// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Trait } from '../../traits.js';
import { DAY_START_MINUTE, MINUTES_PER_DAY } from '../../run.js';
import { findWeekday } from '../../text/weekdays.js';
import { MOVE_MINUTES } from '../actions.js';
import { STUDY_MINUTES } from '../ask.js';
import { DEDUCE_MINUTES } from '../verdict.js';
import type { DetectiveHero } from '../archetype.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import type { InformationSource } from '../../traits.js';
import {
  canEverPass,
  closedSources,
  computeObtainable,
  type CheckPolicy,
  type Obtainable,
} from '../obtainability.js';
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
export function namesOf(name: string, id: string): string[] {
  return [id, name, ...name.split(/[\s,.]+/).filter((piece) => piece.length >= MIN_NAME_PIECE)].map((piece) =>
    piece.toLowerCase(),
  );
}

/**
 * Where the victim is kept is a conclusion the hero draws, and not a place picked off the map: a sign of the victim (a
 * text or a note, never a call, which may be missed) linked to a detail of the place (a clue found there), so that the
 * hero has to go and see. The conclusion must be one the hero can draw before the deadline. And when the place is shown
 * by a lead, another place is shown by a lead of the same kind, or a place that appears on the map would give itself away.
 */
function checkPlaceConclusion(
  detectiveCase: DetectiveCase,
  {
    whereabouts,
    canPass,
    closed,
    available,
    reach,
    issues,
  }: {
    readonly whereabouts: string;
    readonly canPass: CheckPolicy;
    readonly closed: ReadonlySet<InformationSource>;
    readonly available: number;
    readonly reach: number;
    readonly issues: readonly CaseIssue[];
  },
): CaseIssue[] {
  const found: CaseIssue[] = [];
  const path = 'solution.whereaboutsDeductionId';
  // The references are checked before this, so a conclusion that is named is there.
  const conclusionClueIds = detectiveCase.deductions
    .filter(({ id }) => id === detectiveCase.solution.whereaboutsDeductionId)
    .flatMap(({ clueIds }) => clueIds);
  if (detectiveCase.solution.whereaboutsDeductionId === undefined) {
    found.push({
      code: 'place-conclusion-missing',
      path,
      message:
        'An abduction needs a conclusion about where the victim is: set "solution.whereaboutsDeductionId" to a deduction that links a message to a detail of the place.',
    });
  } else {
    const clues = detectiveCase.clues.filter(({ id }) => conclusionClueIds.includes(id));
    // The minutes at which each sign comes: a text or a note, never a call.
    const signs = clues.flatMap(({ message }) =>
      message !== undefined && message.channel !== 'call' ? [message.arrivesAtMinute] : [],
    );
    const details = clues.filter(
      ({ locationId, message }) => locationId === whereabouts && message === undefined,
    );
    if (signs.length === 0) {
      found.push({
        code: 'place-conclusion-missing',
        path,
        message:
          'The conclusion about where the victim is must take a message that shows a sign of the victim, a text or a note: a call may be missed.',
      });
    }
    if (details.length === 0) {
      found.push({
        code: 'place-conclusion-missing',
        path,
        message: `The conclusion about where the victim is must take a clue found in "${whereabouts}" itself, a detail of the place: the hero has to go and see.`,
      });
    }
    if (signs.length > 0 && details.length > 0 && !issues.some(({ code }) => code === 'deadline-too-short')) {
      const conditions = { canPass, closed, closures: [] };
      const seen = details.flatMap(({ id }) => {
        const minutes = minutesToGather(detectiveCase, new Set([id]), conditions);
        return minutes === null ? [] : [Math.max(minutes, reach)];
      });
      const heard = signs.map((arrives) => Math.max(0, arrives - DAY_START_MINUTE));
      const drawn = Math.max(Math.min(...heard), Math.min(...seen)) + DEDUCE_MINUTES;
      if (seen.length > 0 && drawn > available) {
        found.push({
          code: 'deadline-too-short',
          path: 'truth.abduction.deadlineMinute',
          message: `The conclusion about where the victim is can be drawn only after about ${String(drawn)} minutes (the sign has to come, the place be seen, the link be made), but the deadline leaves ${String(Math.max(0, available))} from 08:00 of day 1.`,
        });
      }
    }
  }
  const leads = detectiveCase.leads ?? [];
  const place = detectiveCase.locations.find(({ id }) => id === whereabouts);
  const lead = leads.find(({ id }) => id === place?.requiresLead);
  if (lead !== undefined) {
    const decoys = detectiveCase.locations.filter(
      ({ id, requiresLead }) =>
        id !== whereabouts &&
        id !== detectiveCase.startLocationId &&
        leads.some((other) => other.id === requiresLead && other.earnedBy.kind === lead.earnedBy.kind),
    );
    if (decoys.length === 0) {
      found.push({
        code: 'place-without-decoy',
        path: 'truth.abduction.whereabouts',
        message: `"${whereabouts}" is shown by a lead of the kind "${lead.earnedBy.kind}", and no other place is: a new place on the map would point straight at it. Show one or two other places, with nothing of the victim in them, by a lead of the same kind.`,
      });
    }
  }
  return found;
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
  // Minutes from 08:00 of day 1 by which the hero can stand in the place, by the quickest way they are led there.
  let reach = 0;
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
      if (toLead.length > 0) reach = quickest;
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

  issues.push(
    ...checkPlaceConclusion(detectiveCase, { whereabouts, canPass, closed, available, reach, issues }),
  );

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
