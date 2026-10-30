// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { InformationSource, Trait } from '../../traits.js';
import { LOOK_MINUTES, MOVE_MINUTES, SEARCH_MINUTES } from '../actions.js';
import type { DetectiveHero } from '../archetype.js';
import type { CaseIssue } from '../case-issue.js';
import type { Clue, DetectiveCase, Location } from '../case-schema.js';
import { ACTIVE_MINUTES_PER_DAY } from '../clock.js';
import { buildNeighbors, canEverPass, closedSources, type CheckPolicy } from '../obtainability.js';

interface Closure {
  readonly locationId: string;
  readonly day: number;
}

/**
 * A case the hero can prove only after the culprit has fled is a lost case from the start. This estimates
 * the minutes a whole evidence chain and the motive take, and requires that the cheapest chain fits into
 * the days before the earliest culprit-flees event.
 *
 * The estimate is a plan of the hero's own: stand where the plan has them, walk to the nearest place that
 * still holds something worth having, look (or search, if a roll is needed) there, repeat. Moves, looks
 * and searches are costed from the action constants; luck is ignored as everywhere in the validator, so
 * no failed roll, nat 20 or auto-discovery shortens or lengthens it. The nights are not counted either
 * (the active hours simply run on), which makes the plan a little kinder than the table. A closure
 * blocks entering a place only from the day it fires, measured on that same running clock.
 */
export function checkFleeDeadline(
  detectiveCase: DetectiveCase,
  hero: DetectiveHero,
  traits: readonly Trait[],
): CaseIssue[] {
  const { worldEvents } = detectiveCase.clock;
  const fleeDays = worldEvents.flatMap(({ day, effect }) => (effect?.kind === 'culprit-flees' ? [day] : []));
  // A flight on the first day is reported by the event check itself.
  const fleeDay = Math.min(...fleeDays);
  if (fleeDays.length === 0 || fleeDay < 2) return [];

  const closures: Closure[] = worldEvents.flatMap(({ day, effect }) =>
    effect?.kind === 'location-closes' ? [{ locationId: effect.locationId, day }] : [],
  );
  const { evidenceChains, motiveDeductionId } = detectiveCase.solution;
  const motiveClueIds = detectiveCase.deductions
    .filter(({ id }) => id === motiveDeductionId)
    .flatMap(({ clueIds }) => clueIds);
  const canPass = canEverPass(hero, traits);
  const closed = closedSources(traits);
  // The hero may act until the active hours of the day before the flight are spent.
  const deadline = (fleeDay - 1) * ACTIVE_MINUTES_PER_DAY;

  const isInTime = evidenceChains.some((chain) => {
    const minutes = minutesToGather(detectiveCase, new Set([...chain, ...motiveClueIds]), {
      canPass,
      closed,
      closures,
    });
    return minutes !== null && minutes < deadline;
  });
  return isInTime
    ? []
    : [
        {
          code: 'solution-after-culprit-flees',
          path: 'clock.worldEvents',
          message: `No evidence chain and motive can be gathered in the ${String(fleeDay - 1)} day(s) before the culprit flees on day ${String(fleeDay)}; move the flight later or bring the clues closer.`,
        },
      ];
}

interface Conditions {
  readonly canPass: CheckPolicy;
  readonly closed: ReadonlySet<InformationSource>;
  readonly closures: readonly Closure[];
}

/** Minutes of the plan described above to hold every target clue, or `null` if the plan gets stuck. */
function minutesToGather(
  detectiveCase: DetectiveCase,
  targetClueIds: ReadonlySet<string>,
  { canPass, closed, closures }: Conditions,
): number | null {
  const neighborsById = buildNeighbors(detectiveCase.locations);
  // Clues that unlock a place are worth having too, or the plan could never get through the door.
  const keyClueIds = new Set(
    detectiveCase.locations.flatMap(({ access }) => (access.kind === 'clue' ? [access.clueId] : [])),
  );
  const found = new Set<string>();

  const findableAt = (place: Location): Clue[] =>
    detectiveCase.clues.filter(
      (clue) =>
        clue.locationId === place.id &&
        (clue.source === null || !closed.has(clue.source)) &&
        (clue.discovery === null || canPass(clue.discovery, [...place.situations, ...clue.situations])),
    );
  const wantedAt = (place: Location): Clue[] =>
    findableAt(place).filter(
      (clue) => !found.has(clue.id) && (targetClueIds.has(clue.id) || keyClueIds.has(clue.id)),
    );
  const isClosedAt = (locationId: string, minute: number): boolean =>
    closures.some(
      (closure) =>
        closure.locationId === locationId && closure.day <= Math.floor(minute / ACTIVE_MINUTES_PER_DAY) + 1,
    );

  let place = detectiveCase.locations.filter(({ id }) => id === detectiveCase.startLocationId);
  let minute = 0;
  for (;;) {
    if ([...targetClueIds].every((id) => found.has(id))) return minute;

    // A breadth-first walk, so places come in order of distance; it goes only through places the hero can
    // enter, and a place that has closed by the time the hero gets there is not one of them.
    const reached = new Set(place.map(({ id }) => id));
    const queue = place.map((start) => ({ place: start, steps: 0 }));
    for (const { place: current, steps } of queue) {
      const neighbors = neighborsById.get(current.id);
      for (const next of detectiveCase.locations) {
        if (reached.has(next.id) || !neighbors?.has(next.id)) continue;
        if (isClosedAt(next.id, minute + steps * MOVE_MINUTES)) continue;
        const { access } = next;
        const isOpen =
          access.kind === 'open' ||
          (access.kind === 'clue' && found.has(access.clueId)) ||
          (access.kind === 'skill' && canPass(access.check, next.situations));
        if (!isOpen) continue;
        reached.add(next.id);
        queue.push({ place: next, steps: steps + 1 });
      }
    }
    const goal = queue.find((entry) => wantedAt(entry.place).length > 0);
    if (goal === undefined) return null;

    minute += goal.steps * MOVE_MINUTES;
    place = [goal.place];
    // A search is needed as soon as one wanted clue asks for a roll; otherwise a look is enough.
    const needsSearch = wantedAt(goal.place).some((clue) => clue.discovery !== null);
    minute += needsSearch ? SEARCH_MINUTES : LOOK_MINUTES;
    for (const clue of findableAt(goal.place)) {
      if (needsSearch || clue.discovery === null) found.add(clue.id);
    }
  }
}
