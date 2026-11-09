// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Trait } from '../../traits.js';
import { DAY_START_MINUTE, MINUTES_PER_DAY } from '../../run.js';
import { findWeekday } from '../../text/weekdays.js';
import { MOVE_MINUTES } from '../actions.js';
import { STUDY_MINUTES } from '../ask.js';
import type { DetectiveHero } from '../archetype.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import { canEverPass, closedSources, computeObtainable, type Obtainable } from '../obtainability.js';
import { collectNarrativeTexts } from './texts.js';
import { minutesToGather } from './flee-deadline.js';

/** The shortest names a message is searched for: shorter pieces of a name (an initial, "Mr") are in too many words. */
const MIN_NAME_PIECE = 4;

/** Steps of the shortest walk from a place to the victim's through places the hero can enter; `null` for none. */
function stepsBetween(
  detectiveCase: DetectiveCase,
  obtainable: Obtainable,
  from: string,
  to: string,
): number | null {
  const seen = new Set([from]);
  const queue = detectiveCase.locations
    .filter(({ id }) => id === from)
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
 * - the deadline falls on the last day of the case, so that the days the hero sees are the days the hero has, after the hero can have started (08:00 of day 1) and walked to the victim's
 *   place by the shortest way, and after the cheapest chain of proof can have been gathered;
 * - the victim's place is one the hero can enter, and some chain of evidence leads to it: a clue of a chain, found
 *   outside that place, names it, opens the way in, or earns the lead that does; so does a text that comes by itself, found
 *   or studied, which earns that lead. A clue that lies in the place cannot
 *   lead the hero there, and the way to the place is gathered, then walked, before the deadline;
 * - every message arrives before the deadline, and none names the culprit or a trait of the hero. What a message says is
 *   judged only once it is written (`content`), as is the rule that no text names a weekday: the clock counts days, and
 *   "Friday" is a date it cannot show.
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

  // The run ends at the deadline, so a case of more days than that shows the hero days they cannot have.
  const deadlineDay = Math.floor((deadlineMinute - 1) / MINUTES_PER_DAY) + 1;
  if (deadlineMinute <= endOfCase && deadlineDay !== detectiveCase.clock.days) {
    issues.push({
      code: 'deadline-out-of-range',
      path: 'clock.days',
      message: `The deadline (${String(deadlineMinute)}) falls on day ${String(deadlineDay)}, but the case lasts ${String(detectiveCase.clock.days)} days. An abduction ends at its deadline, so set "clock.days" to ${String(deadlineDay)} (or move the deadline to the last day).`,
    });
  }

  const steps = stepsBetween(detectiveCase, obtainable, detectiveCase.startLocationId, whereabouts);
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
  const opensTheWay = (clueId: string): boolean =>
    places.some(({ access }) => access.kind === 'clue' && access.clueId === clueId);
  // How a clue earns the lead that shows the place: by being found, or by being studied with any tool (a tool the
  // hero may lack does not count, as it does not for any lead).
  const earnsTheLead = (clueId: string): 'found' | 'studied' | null => {
    const earned = (detectiveCase.leads ?? [])
      .filter(({ id }) => places.some(({ requiresLead }) => requiresLead === id))
      .map(({ earnedBy }) => earnedBy);
    if (earned.some((by) => by.kind === 'clue' && by.clueId === clueId)) return 'found';
    return earned.some((by) => by.kind === 'study' && by.tool === undefined && by.clueId === clueId)
      ? 'studied'
      : null;
  };
  // What the hero can gather without setting foot in the place: a clue that lies there cannot be what leads there.
  const canPass = canEverPass(hero, traits);
  const closed = closedSources(traits);
  const outside = computeObtainable(
    { ...detectiveCase, locations: detectiveCase.locations.filter(({ id }) => id !== whereabouts) },
    canPass,
    closed,
  );
  // A text that comes by itself can earn the lead too, found or traced (its number, its line): it need not be a clue of a
  // chain, since it proves nothing, and it names nothing. A call may be missed and a note has to be gone to, so neither leads.
  const isText = (clue: { message?: { channel: string } | undefined }): boolean =>
    clue.message?.channel === 'text';
  const leading = detectiveCase.clues.filter(
    (clue) =>
      clue.locationId !== whereabouts &&
      outside.clueIds.has(clue.id) &&
      (isText(clue)
        ? earnsTheLead(clue.id) !== null
        : chainClueIds.has(clue.id) &&
          (opensTheWay(clue.id) ||
            earnsTheLead(clue.id) !== null ||
            (content && placeNames.some((name) => clue.description.toLowerCase().includes(name))))),
  );
  // A hero who starts in the place has no way to find.
  if (whereabouts !== detectiveCase.startLocationId) {
    if (leading.length === 0) {
      issues.push({
        code: 'victim-place-unled',
        path: 'truth.abduction.whereabouts',
        message: `No chain of evidence leads to "${whereabouts}": a clue of a chain, found outside that place, must name it, open the way in or earn the lead to it. A clue that lies in the place does not count.`,
      });
    } else {
      // Minutes from 08:00 of day 1 until the hero can stand in the place by that clue: a text is read once it has come.
      const toLead = leading.flatMap((clue) => {
        const studying = earnsTheLead(clue.id) === 'studied' ? STUDY_MINUTES : 0;
        if (clue.message !== undefined) {
          return steps === null
            ? []
            : [
                Math.max(0, clue.message.arrivesAtMinute - DAY_START_MINUTE) +
                  studying +
                  steps * MOVE_MINUTES,
              ];
        }
        const gathered = minutesToGather(detectiveCase, new Set([clue.id]), {
          canPass,
          closed,
          closures: [],
        });
        const walk = stepsBetween(detectiveCase, obtainable, clue.locationId, whereabouts);
        return gathered === null || walk === null ? [] : [gathered + studying + walk * MOVE_MINUTES];
      });
      const quickest = Math.min(...toLead);
      // A deadline already found too short says so once.
      const said = issues.some(({ code }) => code === 'deadline-too-short');
      if (toLead.length > 0 && quickest > available && !said) {
        issues.push({
          code: 'deadline-too-short',
          path: 'truth.abduction.deadlineMinute',
          message: `The way to "${whereabouts}" (the clue that leads there, then the walk) takes about ${String(quickest)} minutes, but the deadline leaves ${String(Math.max(0, available))} from 08:00 of day 1.`,
        });
      }
    }
  }

  if (content) {
    for (const { path, text } of collectNarrativeTexts(detectiveCase)) {
      const weekday = findWeekday(text);
      if (weekday === undefined) continue;
      issues.push({
        code: 'weekday-named',
        path,
        message: `This text names a weekday ("${weekday}"). The case counts days, not a calendar: write the day by its number and the hour, such as "by six in the evening of the third day".`,
      });
    }
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
