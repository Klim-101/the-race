// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { assertNever } from '../assert-never.js';
import { rollCheck, type Rng, type SkillCheckResult } from '../dice.js';
import { collectModifier } from '../modifiers.js';
import { hasAutoDiscover, type TraitTrigger } from '../traits.js';
import {
  EntityIdSchema,
  type Clue,
  type DetectiveCase,
  type Location,
  type SkillCheck,
} from './case-schema.js';
import { InterrogateIntentSchema, resolveInterrogate, type InterrogationOutcome } from './interrogation.js';
import { buildNeighbors, closedSources } from './obtainability.js';
import {
  changeReputation,
  endTurn,
  findClue,
  markSearched,
  moveTo,
  spendTime,
  type DetectiveRunState,
} from './run-state.js';
import {
  AccuseIntentSchema,
  DeduceIntentSchema,
  accuse,
  deduce,
  type AccusationOutcome,
  type DeduceOutcome,
} from './verdict.js';

// What a player can ask for. A check of a skill happens inside the intents that need one, so there is no
// free-standing "use a skill".
export const IntentSchema = z.discriminatedUnion('kind', [
  /** A quick glance at the place: finds what lies in plain sight. */
  z.object({ kind: z.literal('look') }),
  /** Go to a neighbouring place; a locked door may need a key or a skill check. */
  z.object({ kind: z.literal('move'), locationId: EntityIdSchema }),
  /** A thorough search of the place: every hidden clue gets a check. */
  z.object({ kind: z.literal('search') }),
  /** Question a suspect of the place, showing clues that may break their lies. */
  InterrogateIntentSchema,
  /** Link found clues into an insight. */
  DeduceIntentSchema,
  /** The final accusation, which ends the run. */
  AccuseIntentSchema,
]);
export type Intent = z.infer<typeof IntentSchema>;

/** What each action costs in game time, in minutes. */
export const LOOK_MINUTES = 5;
export const MOVE_MINUTES = 15;
export const SEARCH_MINUTES = 30;
/** Extra time lost when an attempt fails, so that a failure is never "nothing happens". */
export const FAILED_SEARCH_MINUTES = 15;
export const FAILED_ENTRY_MINUTES = 10;
/** A natural 1 on a check also costs this much reputation: the hero made a scene. */
export const CRITICAL_FAILURE_REPUTATION = 1;

export type RefusalCode =
  | 'invalid-intent'
  | 'run-over'
  | 'unknown-location'
  | 'already-here'
  | 'not-adjacent'
  | 'locked'
  | 'unknown-suspect'
  | 'suspect-elsewhere'
  | 'clue-not-found'
  | 'not-found'
  | 'no-insight';

/** Why an intent was not carried out. Nothing changed and no time passed. */
export interface Refusal {
  readonly code: RefusalCode;
  /** For people reading logs; the player-facing text lives in the locales. */
  readonly message: string;
}

export type Consequence = 'time-lost' | 'reputation-lost';

/**
 * What happened, as far as the player and the narrator may know. It names no clue that was not found
 * and does not say how many are still hidden.
 */
export type Outcome =
  | { readonly kind: 'look'; readonly foundClueIds: readonly string[]; readonly minutes: number }
  | {
      readonly kind: 'move';
      readonly from: string;
      readonly to: string;
      readonly entered: boolean;
      readonly minutes: number;
      readonly consequences: readonly Consequence[];
    }
  | {
      readonly kind: 'search';
      readonly foundClueIds: readonly string[];
      readonly minutes: number;
      readonly consequences: readonly Consequence[];
    }
  | InterrogationOutcome
  | DeduceOutcome
  | AccusationOutcome;

/** The full record of a check, for the engine's own log: it does name what was being checked. */
export interface CheckDetail {
  readonly subject: { readonly kind: 'clue' | 'location' | 'suspect'; readonly id: string };
  /** `'auto'`: found without a roll, as by a photographic memory. */
  readonly result: SkillCheckResult | 'auto';
}

export type Resolution =
  | {
      readonly ok: true;
      readonly run: DetectiveRunState;
      readonly outcome: Outcome;
      readonly details: readonly CheckDetail[];
    }
  | { readonly ok: false; readonly refusal: Refusal };

function refuse(code: RefusalCode, message: string): Resolution {
  return { ok: false, refusal: { code, message } };
}

/** The hero's own roll for a check, with the modifier their traits give in the scene. */
function roll(
  run: DetectiveRunState,
  rng: Rng,
  check: SkillCheck,
  situations: readonly TraitTrigger[],
): SkillCheckResult {
  return rollCheck(
    rng,
    run.hero.skills,
    check,
    collectModifier({ traits: run.traits }, check.skill, situations),
  );
}

/** Time spent, reputation lost for a critical failure, and the turn counted with the state of the dice. */
function settle(
  run: DetectiveRunState,
  rng: Rng,
  minutes: number,
  results: readonly SkillCheckResult[],
): { run: DetectiveRunState; consequences: Consequence[] } {
  const consequences: Consequence[] = [];
  let next = run;
  if (results.some((result) => result.critical === 'failure')) {
    next = changeReputation(next, -CRITICAL_FAILURE_REPUTATION);
    consequences.push('reputation-lost');
  }
  return { run: endTurn(spendTime(next, minutes), rng), consequences };
}

function locationById(detectiveCase: DetectiveCase, id: string): Location {
  const location = detectiveCase.locations.find((candidate) => candidate.id === id);
  if (!location) {
    throw new RangeError(`There is no location "${id}" in this run.`);
  }
  return location;
}

/** Clues of a place that are still hidden and that the hero's traits do not shut out. */
function hiddenClues(run: DetectiveRunState, locationId: string): Clue[] {
  const closed = closedSources(run.traits);
  return run.case.clues.filter(
    (clue) =>
      clue.locationId === locationId &&
      !run.foundClueIds.includes(clue.id) &&
      (clue.source === null || !closed.has(clue.source)),
  );
}

function resolveLook(run: DetectiveRunState, rng: Rng): Resolution {
  const found = hiddenClues(run, run.locationId).filter((clue) => clue.discovery === null);
  const next = found.reduce((state, clue) => findClue(state, clue.id), run);
  const settled = settle(next, rng, LOOK_MINUTES, []);
  const outcome: Outcome = { kind: 'look', foundClueIds: found.map(({ id }) => id), minutes: LOOK_MINUTES };
  return { ok: true, run: settled.run, outcome, details: [] };
}

function resolveSearch(run: DetectiveRunState, rng: Rng): Resolution {
  const location = locationById(run.case, run.locationId);
  const reinspection = run.searchedLocationIds.includes(location.id);
  const hidden = hiddenClues(run, location.id);
  const details: CheckDetail[] = [];
  const results: SkillCheckResult[] = [];
  const found: Clue[] = [];

  for (const clue of hidden) {
    const situations: TraitTrigger[] = [...location.situations, ...clue.situations];
    if (reinspection) situations.push('reinspection');
    const subject = { kind: 'clue', id: clue.id } as const;
    if (clue.discovery === null || (reinspection && hasAutoDiscover(run.traits, situations))) {
      found.push(clue);
      details.push({ subject, result: 'auto' });
      continue;
    }
    const result = roll(run, rng, clue.discovery, situations);
    results.push(result);
    details.push({ subject, result });
    if (result.success) found.push(clue);
  }

  const withClues = found.reduce((state, clue) => findClue(state, clue.id), markSearched(run, location.id));
  // A search that turns up nothing although something was there costs more than the search itself.
  const wasted = found.length === 0 && hidden.length > 0;
  const minutes = SEARCH_MINUTES + (wasted ? FAILED_SEARCH_MINUTES : 0);
  const settled = settle(withClues, rng, minutes, results);
  const consequences: Consequence[] = [...(wasted ? (['time-lost'] as const) : []), ...settled.consequences];
  return {
    ok: true,
    run: settled.run,
    outcome: { kind: 'search', foundClueIds: found.map(({ id }) => id), minutes, consequences },
    details,
  };
}

function resolveMove(run: DetectiveRunState, rng: Rng, locationId: string): Resolution {
  const detectiveCase = run.case;
  if (!detectiveCase.locations.some(({ id }) => id === locationId)) {
    return refuse('unknown-location', `There is no location "${locationId}".`);
  }
  if (locationId === run.locationId) {
    return refuse('already-here', 'The hero is already there.');
  }
  if (!buildNeighbors(detectiveCase.locations).get(run.locationId)?.has(locationId)) {
    return refuse('not-adjacent', `"${locationId}" is not next to the hero's place.`);
  }

  const destination = locationById(detectiveCase, locationId);
  const { access } = destination;
  // A place the hero has been in is open to them for good.
  const visited = run.visitedLocationIds.includes(locationId);
  const details: CheckDetail[] = [];
  const results: SkillCheckResult[] = [];
  let entered = true;

  if (!visited) {
    switch (access.kind) {
      case 'open':
        break;
      case 'clue':
        if (!run.foundClueIds.includes(access.clueId)) {
          return refuse('locked', 'The way is locked.');
        }
        break;
      case 'skill': {
        const result = roll(run, rng, access.check, destination.situations);
        results.push(result);
        details.push({ subject: { kind: 'location', id: locationId }, result });
        entered = result.success;
        break;
      }
      /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
      default:
        return assertNever(access);
    }
  }

  const moved = entered ? moveTo(run, locationId) : run;
  const minutes = MOVE_MINUTES + (entered ? 0 : FAILED_ENTRY_MINUTES);
  const settled = settle(moved, rng, minutes, results);
  const consequences: Consequence[] = [...(entered ? [] : (['time-lost'] as const)), ...settled.consequences];
  return {
    ok: true,
    run: settled.run,
    outcome: { kind: 'move', from: run.locationId, to: locationId, entered, minutes, consequences },
    details,
  };
}

/**
 * Turns one player intent into a state change: validates it against the state, rolls the checks it needs
 * on the run's dice, spends time and counts the turn. A pure function: the same state, intent and dice
 * always give the same resolution, and the state it is given is left alone. An intent that cannot be carried
 * out is refused with a code, and then nothing changes and no dice are rolled.
 */
export function resolveIntent(run: DetectiveRunState, input: unknown, rng: Rng): Resolution {
  const parsed = IntentSchema.safeParse(input);
  if (!parsed.success) {
    return refuse('invalid-intent', parsed.error.issues.map((issue) => issue.message).join('; '));
  }
  if (run.status !== 'active') {
    return refuse('run-over', `The run is already over (${run.status}).`);
  }
  const intent = parsed.data;
  switch (intent.kind) {
    case 'look':
      return resolveLook(run, rng);
    case 'search':
      return resolveSearch(run, rng);
    case 'move':
      return resolveMove(run, rng, intent.locationId);
    case 'interrogate':
      return resolveInterrogate(run, intent, rng);
    case 'deduce': {
      const resolution = deduce(run, intent, rng);
      return resolution.ok ? { ...resolution, details: [] } : resolution;
    }
    case 'accuse': {
      const resolution = accuse(run, intent, rng);
      return resolution.ok ? { ...resolution, details: [] } : resolution;
    }
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(intent);
  }
}
