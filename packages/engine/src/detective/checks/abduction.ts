// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Trait } from '../../traits.js';
import { DAY_START_MINUTE, MINUTES_PER_DAY } from '../../run.js';
import { MOVE_MINUTES } from '../actions.js';
import type { DetectiveHero } from '../archetype.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import { canEverPass, closedSources, type Obtainable } from '../obtainability.js';
import { minutesToGather } from './flee-deadline.js';

/** The shortest names a message is searched for: shorter pieces of a name (an initial, "Mr") are in too many words. */
const MIN_NAME_PIECE = 4;

/** Steps of the shortest walk from the start to the victim's place through places the hero can enter; `null` for none. */
function stepsToVictim(detectiveCase: DetectiveCase, obtainable: Obtainable, to: string): number | null {
  const seen = new Set([detectiveCase.startLocationId]);
  const queue = detectiveCase.locations
    .filter(({ id }) => id === detectiveCase.startLocationId)
    .map((location) => ({ location, steps: 0 }));
  for (const { location, steps } of queue) {
    if (location.id === to) return steps;
    // Connections are two-way: listing one on either place links both.
    for (const next of detectiveCase.locations) {
      const linked = location.connections.includes(next.id) || next.connections.includes(location.id);
      if (!linked || seen.has(next.id) || !obtainable.locationIds.has(next.id)) continue;
      seen.add(next.id);
      queue.push({ location: next, steps: steps + 1 });
    }
  }
  return null;
}

/** The pieces of a name that a message would give away the person by: the whole name and its longer words. */
function namesOf(name: string, id: string): string[] {
  return [id, name, ...name.split(/[\s,.]+/).filter((piece) => piece.length >= MIN_NAME_PIECE)].map((piece) =>
    piece.toLowerCase(),
  );
}

/**
 * The fairness rules of an abduction, on top of those every case passes (two independent chains, no free culprit):
 * - the deadline falls inside the case, after the hero can have started (08:00 of day 1) and walked to the victim's
 *   place by the shortest way, and after the cheapest chain of proof can have been gathered;
 * - the victim's place is one the hero can enter, and some chain of evidence leads to it: a clue of a chain lies there,
 *   names it, opens the way in, or earns the lead that does;
 * - every message arrives before the deadline, and none names the culprit or a trait of the hero. What a message says is
 *   judged only once it is written (`content`).
 * A whodunit has none of this to judge.
 */
export function checkAbduction(
  detectiveCase: DetectiveCase,
  hero: DetectiveHero,
  traits: readonly Trait[],
  obtainable: Obtainable,
  content: boolean,
): CaseIssue[] {
  const { abduction, culpritId } = detectiveCase.truth;
  if (abduction === undefined) return [];
  const issues: CaseIssue[] = [];
  const { whereabouts, deadlineMinute } = abduction;
  const endOfCase = detectiveCase.clock.days * MINUTES_PER_DAY;

  if (deadlineMinute > endOfCase) {
    issues.push({
      code: 'deadline-out-of-range',
      path: 'truth.abduction.deadlineMinute',
      message: `The deadline (${String(deadlineMinute)}) is past the end of the case: ${String(detectiveCase.clock.days)} days end at minute ${String(endOfCase)}. It counts from midnight of day 1, so 23:00 of day 2 is 2820.`,
    });
  }

  const steps = stepsToVictim(detectiveCase, obtainable, whereabouts);
  const available = deadlineMinute - DAY_START_MINUTE;
  if (steps === null) {
    issues.push({
      code: 'victim-place-unreachable',
      path: 'truth.abduction.whereabouts',
      message: `The hero cannot get from "${detectiveCase.startLocationId}" to "${whereabouts}", where the victim is kept.`,
    });
  } else if (steps * MOVE_MINUTES > available) {
    issues.push({
      code: 'deadline-too-short',
      path: 'truth.abduction.deadlineMinute',
      message: `The hero starts at 08:00 of day 1 and needs ${String(steps * MOVE_MINUTES)} minutes to walk to "${whereabouts}", but the deadline leaves ${String(Math.max(0, available))}.`,
    });
  }

  const { evidenceChains, motiveDeductionId } = detectiveCase.solution;
  const motiveClueIds = detectiveCase.deductions
    .filter(({ id }) => id === motiveDeductionId)
    .flatMap(({ clueIds }) => clueIds);
  const gathered = evidenceChains.flatMap((chain) => {
    const minutes = minutesToGather(detectiveCase, new Set([...chain, ...motiveClueIds]), {
      canPass: canEverPass(hero, traits),
      closed: closedSources(traits),
      closures: [],
    });
    return minutes === null ? [] : [minutes];
  });
  const cheapest = Math.min(...gathered);
  if (gathered.length > 0 && cheapest > available) {
    issues.push({
      code: 'deadline-too-short',
      path: 'truth.abduction.deadlineMinute',
      message: `The cheapest chain of proof takes about ${String(cheapest)} minutes to gather, but the deadline leaves ${String(Math.max(0, available))} from 08:00 of day 1.`,
    });
  }

  // The references are checked before this, so the place is there.
  const places = detectiveCase.locations.filter(({ id }) => id === whereabouts);
  const placeNames = places.map(({ name }) => name.toLowerCase());
  const chainClueIds = new Set(evidenceChains.flat());
  const chainClues = detectiveCase.clues.filter(({ id }) => chainClueIds.has(id));
  const opensTheWay = (clueId: string): boolean =>
    places.some(({ access }) => access.kind === 'clue' && access.clueId === clueId);
  const earnsTheLead = (clueId: string): boolean =>
    (detectiveCase.leads ?? []).some(
      ({ id, earnedBy }) =>
        places.some(({ requiresLead }) => requiresLead === id) &&
        earnedBy.kind === 'clue' &&
        earnedBy.clueId === clueId,
    );
  const isLed = chainClues.some(
    (clue) =>
      clue.locationId === whereabouts ||
      opensTheWay(clue.id) ||
      earnsTheLead(clue.id) ||
      (content && placeNames.some((name) => clue.description.toLowerCase().includes(name))),
  );
  if (!isLed) {
    issues.push({
      code: 'victim-place-unled',
      path: 'truth.abduction.whereabouts',
      message: `No chain of evidence leads to "${whereabouts}": a clue of a chain must lie there, name the place, open the way in or earn the lead to it.`,
    });
  }

  const culpritNames = detectiveCase.suspects
    .filter(({ id }) => id === culpritId)
    .flatMap(({ name, id }) => namesOf(name, id));
  detectiveCase.clues.forEach((clue, index) => {
    if (clue.message === undefined) return;
    const path = `clues[${String(index)}]`;
    if (clue.message.arrivesAtMinute >= deadlineMinute) {
      issues.push({
        code: 'message-after-deadline',
        path: `${path}.message.arrivesAtMinute`,
        message: `Message "${clue.id}" arrives at ${String(clue.message.arrivesAtMinute)}, not before the deadline (${String(deadlineMinute)}).`,
      });
    }
    if (!content) return;
    const text = clue.description.toLowerCase();
    if (culpritNames.some((name) => text.includes(name))) {
      issues.push({
        code: 'message-names-culprit',
        path: `${path}.description`,
        message: `Message "${clue.id}" names the culprit; a message shows the victim is alive and leaves the culprit to be found.`,
      });
    }
    if (traits.some(({ id }) => text.includes(id.toLowerCase()))) {
      issues.push({
        code: 'message-names-trait',
        path: `${path}.description`,
        message: `Message "${clue.id}" names a trait of the hero; write what the message says and nothing about the hero.`,
      });
    }
  });
  return issues;
}
