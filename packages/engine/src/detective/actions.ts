// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { assertNever } from '../assert-never.js';
import { endReasonOfMeters } from '../meters.js';
import { rollCheck, type Rng, type SkillCheckResult } from '../dice.js';
import type { Hazard, Weather } from '../world/climate.js';
import { collectModifier } from '../modifiers.js';
import { distinctFelt, feltModifier, feltShield, type SignalFelt } from '../signals.js';
import { hasAutoDiscover, type TraitTrigger } from '../traits.js';
import {
  EntityIdSchema,
  type Clue,
  type PlacePart,
  type DetectiveCase,
  type Location,
  type SkillCheck,
  type Witness,
} from './case-schema.js';
import { meterReadings, modifierSources } from './condition.js';
import { RereadIntentSchema, applyFatigue, resolveReread, type Fatigue } from './fatigue.js';
import { settleClock } from './clock.js';
import { isCollapse, passNight, type NightCause, type NightReport } from './night.js';
import { InterrogateIntentSchema, resolveInterrogate, type InterrogationOutcome } from './interrogation.js';
import { applyMishap, walk } from './road.js';
import { TakeIntentSchema, resolveTake, type TakeOutcome } from './take.js';
import { UseIntentSchema, resolveUse, type UseOutcome } from './use-item.js';
import {
  actingReveals,
  applyReveals,
  collectDebt,
  lockOutReveals,
  revealedBy,
  sceneSituations,
  type Revealed,
} from './trait-reveal.js';
import { locationScene } from './trait-scenes.js';
import { isLeadEarned, isLeadOpen, isPlaceKnown } from './leads.js';
import { risks, unlawfulRisk, type Risk } from './risk.js';
import { DETECTIVE_NERVES } from './archetype.js';
import {
  ASK_DIFFICULTY,
  ASK_MINUTES,
  ASK_RULESET_VERSION,
  FAILED_ASK_MINUTES,
  FAILED_STUDY_MINUTES,
  STUDY_MINUTES,
  askBonusOf,
  chooseStudyTool,
} from './ask.js';
import {
  SIGHTING_CLUES_RULESET_VERSION,
  WITNESS_NAMED_EASE,
  WITNESS_RULESET_VERSION,
  holdsClueAbout,
  recordSightings,
  sightingClueId,
  sightingsOf,
  type Sighting,
  witnessesHere,
} from './witnesses.js';
import { SIT_MINUTES, SIT_NERVES, sitRefusal, sitsLeft } from './venue.js';
import { chooseTool, partsOfPlace } from './search-parts.js';
import { GearIdSchema, worn, type GearId } from './gear.js';
import { buildNeighbors } from './obtainability.js';
import { closedSourcesOf, drawDayEvents, drawOwedDayEvent, isLocationClosed } from './random-events.js';
import {
  changeReputation,
  endTurn,
  findClue,
  findToldClue,
  grantLeads,
  markSearched,
  moveTo,
  noticeParts,
  recordPartSearch,
  recordSitting,
  wearTool,
  signalOfRun,
  spendTime,
  strainByAction,
  strainNerves,
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
  /**
   * A thorough search. Of the whole place: every hidden clue gets a check. Of a place made of parts (from the
   * ruleset of parts on) it is a search of one part, named by `partId`, with the tool of the kit named by
   * `toolId` against an obstacle (left out, the kit's best fit is used).
   */
  z.object({ kind: z.literal('search'), partId: EntityIdSchema.optional(), toolId: GearIdSchema.optional() }),
  /** Question a suspect of the place, showing clues that may break their lies. */
  InterrogateIntentSchema,
  /** Link found clues into an insight. */
  DeduceIntentSchema,
  /** Stop for the day and sleep where the hero stands: the night passes at once. */
  z.object({ kind: z.literal('rest') }),
  /**
   * Ask the locals for a rumour: a contacts roll, with the piece of the kit named by `toolId` (cash) to help it. With
   * `witnessId` (from the ruleset of witnesses on) it is a question to one witness of the place about what they saw,
   * and `aboutSuspectId` narrows it to one suspect.
   */
  z.object({
    kind: z.literal('ask'),
    toolId: GearIdSchema.optional(),
    witnessId: EntityIdSchema.optional(),
    aboutSuspectId: EntityIdSchema.optional(),
  }),
  /** Study a clue the hero holds with a tool of the kit, for a lead. */
  z.object({ kind: z.literal('study'), clueId: EntityIdSchema, toolId: GearIdSchema.optional() }),
  /** Sit down at a teahouse or a cafe for a while: a little of the nerves comes back. */
  z.object({ kind: z.literal('sit') }),
  /** The final accusation, which ends the run. */
  AccuseIntentSchema,
  /** Read a garbled clue again, carefully. */
  RereadIntentSchema,
  /** Take a consumable the hero carries. */
  UseIntentSchema,
  /** Take what the place offers: a tool for the suitcase or a supply for the pockets. */
  TakeIntentSchema,
]);
export type Intent = z.infer<typeof IntentSchema>;

/** What each action costs in game time, in minutes. */
export const LOOK_MINUTES = 5;
export const MOVE_MINUTES = 15;
export const SEARCH_MINUTES = 30;
/** In a place made of parts: a quick look takes a little longer than a glance, a search of one part is shorter. */
export const PART_LOOK_MINUTES = 10;
export const PART_SEARCH_MINUTES = 20;
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
  | 'location-closed'
  | 'unknown-suspect'
  | 'place-needed'
  | 'place-unwanted'
  | 'no-witness'
  | 'suspect-elsewhere'
  | 'clue-not-found'
  | 'insight-not-found'
  | 'suspect-closed'
  | 'nothing-new'
  | 'not-available'
  | 'no-venue'
  | 'venue-closed'
  | 'venue-unsafe'
  | 'not-frayed'
  | 'sat-enough'
  | 'unknown-part'
  | 'part-not-noticed'
  | 'part-searched'
  | 'needs-tool'
  | 'wrong-tool'
  | 'lead-window'
  | 'not-found'
  | 'no-insight'
  | 'garbled-clue'
  | 'wrong-link-size'
  | 'not-garbled'
  | 'unknown-item'
  | 'none-left'
  | 'unknown-stock'
  | 'stock-taken'
  | 'already-carried'
  | 'no-slot'
  | 'not-in-suitcase'
  | 'pockets-full';

/** Why an intent was not carried out. Nothing changed and no time passed. */
export interface Refusal {
  readonly code: RefusalCode;
  /** For people reading logs; the player-facing text lives in the locales. */
  readonly message: string;
}

/**
 * What a turn cost beyond its time: `spotted` is a hero seen using a tool that is not lawful, and `detained` one the
 * police held for hours because of it (see `risk.ts`).
 */
export type Consequence = 'time-lost' | 'reputation-lost' | 'mishap' | 'nerves-lost' | 'spotted' | 'detained';

/**
 * What happened, as far as the player and the narrator may know. It names no clue that was not found
 * and does not say how many are still hidden.
 */
export type Outcome = (
  | {
      readonly kind: 'look';
      readonly foundClueIds: readonly string[];
      readonly minutes: number;
      /** In a place made of parts: every part a glance round the room shows, found or not. */
      readonly noticedPartIds?: readonly string[];
    }
  | {
      readonly kind: 'move';
      readonly from: string;
      readonly to: string;
      readonly entered: boolean;
      readonly minutes: number;
      readonly consequences: readonly Consequence[];
      /** The weather of a walk out of doors, which made it slower by the minutes it adds (see `road.ts`). */
      readonly weather?: Weather;
      /** The hazard of the country that the weather brought out on this walk, when one did. */
      readonly hazard?: Hazard;
      /** The small, comic thing that happened on the road, by id, if one did. */
      readonly roadMishap?: string;
    }
  | {
      readonly kind: 'search';
      readonly foundClueIds: readonly string[];
      readonly minutes: number;
      readonly consequences: readonly Consequence[];
      /** The part that was searched, in a place made of parts. */
      readonly partId?: string;
      /** The tool used against the obstacle of the part: whether it got through, and how it wore. */
      readonly tool?: {
        readonly id: GearId;
        readonly cleared: boolean;
        readonly wear: 'spent' | 'broken' | null;
      };
      /** The minutes of a detention, already in `minutes`; only when the police held the hero. */
      readonly detainedMinutes?: number;
    }
  | { readonly kind: 'rest' }
  | {
      readonly kind: 'ask';
      readonly minutes: number;
      /** Whether the locals had anything to say that the roll could get out of them. */
      readonly succeeded: boolean;
      readonly consequences: readonly Consequence[];
      /** The cash that helped, and whether it was the last of it. */
      readonly tool?: { readonly id: GearId; readonly wear: 'spent' | 'broken' | null };
      /** Only when the question was put to a witness: who, and what they saw (nothing, on a success that saw nothing). */
      readonly witness?: {
        readonly id: string;
        readonly sightings: readonly Sighting[];
        /** The clues the hero now holds because of what the witness told, when the case makes sightings clues. */
        readonly clueIds?: readonly string[];
      };
    }
  | {
      readonly kind: 'study';
      readonly clueId: string;
      readonly minutes: number;
      readonly succeeded: boolean;
      readonly consequences: readonly Consequence[];
      readonly tool: { readonly id: GearId; readonly wear: 'spent' | 'broken' | null };
    }
  | {
      readonly kind: 'sit';
      readonly minutes: number;
      /** The points of nerves it gave back. */
      readonly nervesRestored: number;
      /** The sittings the hero has left today. */
      readonly sitsLeft: number;
    }
  | InterrogationOutcome
  | DeduceOutcome
  | AccusationOutcome
  | { readonly kind: 'reread'; readonly clueId: string; readonly minutes: number }
  | UseOutcome
  | TakeOutcome
) &
  /** Set by fatigue only when there is something to say: a mishap's kind, and the garble of a reading. */
  Partial<Fatigue>;

/** The full record of a check, for the engine's own log: it does name what was being checked. */
export interface CheckDetail {
  readonly subject: { readonly kind: 'clue' | 'location' | 'suspect' | 'part'; readonly id: string };
  /** `'auto'`: found without a roll, as by a photographic memory. */
  readonly result: SkillCheckResult | 'auto';
}

export type Resolution =
  | {
      readonly ok: true;
      readonly run: DetectiveRunState;
      readonly outcome: Outcome;
      readonly details: readonly CheckDetail[];
      /** Set when the turn ended in a night: what the night did, for the engine's log. */
      readonly night?: NightReport;
      /** What the hero's signal did in this turn, when it did anything; told to the player, not logged. */
      readonly felt?: readonly SignalFelt[];
      /** The hidden traits that showed themselves in this turn, and how; each trait is told once. */
      readonly revealed?: readonly Revealed[];
    }
  | { readonly ok: false; readonly refusal: Refusal };

function refuse(code: RefusalCode, message: string): Resolution {
  return { ok: false, refusal: { code, message } };
}

/** The hero's own roll for a check, with the modifier their traits give in the scene, and what the signal added. */
function roll(
  run: DetectiveRunState,
  rng: Rng,
  check: SkillCheck,
  situations: readonly TraitTrigger[],
): { result: SkillCheckResult; felt: SignalFelt[]; revealed: Revealed[] } {
  const scene = sceneSituations(run, situations);
  const result = rollCheck(
    rng,
    run.hero.skills,
    check,
    collectModifier(modifierSources(run), check.skill, scene),
  );
  return {
    result,
    felt: feltModifier(signalOfRun(run), scene, check.skill),
    revealed: actingReveals(run, scene, check.skill),
  };
}

/** Time spent, reputation lost for a critical failure, and the turn counted with the state of the dice. */
function settle(
  run: DetectiveRunState,
  rng: Rng,
  minutes: number,
  results: readonly SkillCheckResult[],
): { run: DetectiveRunState; consequences: Consequence[]; felt: SignalFelt[] } {
  const consequences: Consequence[] = [];
  const felt: SignalFelt[] = [];
  let next = run;
  if (results.some((result) => result.critical === 'failure')) {
    next = strainNerves(changeReputation(next, -CRITICAL_FAILURE_REPUTATION));
    consequences.push('reputation-lost');
    felt.push(...feltShield(signalOfRun(run), 'nerves', 'failure'));
  }
  return { run: endTurn(spendTime(next, minutes), rng), consequences, felt };
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
  const closed = closedSourcesOf(run);
  return run.case.clues.filter(
    (clue) =>
      clue.locationId === locationId &&
      // What a witness tells is found by asking them and by nothing else.
      clue.sightingOf === undefined &&
      !run.foundClueIds.includes(clue.id) &&
      (clue.source === null || !closed.has(clue.source)),
  );
}

/** A glance round a room made of parts: it names the parts in the open and takes what lies in plain sight on them. */
function resolveLookAtParts(run: DetectiveRunState, rng: Rng, parts: readonly PlacePart[]): Resolution {
  const shown = parts.filter(
    ({ inQuickLook, requiresLead }) =>
      inQuickLook && (requiresLead === null || isLeadEarned(run, requiresLead)),
  );
  const hidden = hiddenClues(run, run.locationId);
  const found = shown.flatMap((part) =>
    part.obstacle === null ? hidden.filter((clue) => clue.id === part.holds && clue.discovery === null) : [],
  );
  const noticed = noticeParts(
    run,
    shown.map(({ id }) => id),
  );
  const next = found.reduce((state, clue) => findClue(state, clue.id), noticed);
  const settled = settle(next, rng, PART_LOOK_MINUTES, []);
  const outcome: Outcome = {
    kind: 'look',
    foundClueIds: found.map(({ id }) => id),
    minutes: PART_LOOK_MINUTES,
    noticedPartIds: shown.map(({ id }) => id),
  };
  return { ok: true, run: settled.run, outcome, details: [], revealed: lockOutReveals(run, run.locationId) };
}

function resolveLook(run: DetectiveRunState, rng: Rng): Resolution {
  const parts = partsOfPlace(run, run.locationId);
  if (parts.length > 0) return resolveLookAtParts(run, rng, parts);
  const found = hiddenClues(run, run.locationId).filter((clue) => clue.discovery === null);
  const next = found.reduce((state, clue) => findClue(state, clue.id), run);
  const settled = settle(next, rng, LOOK_MINUTES, []);
  const outcome: Outcome = { kind: 'look', foundClueIds: found.map(({ id }) => id), minutes: LOOK_MINUTES };
  return { ok: true, run: settled.run, outcome, details: [], revealed: lockOutReveals(run, run.locationId) };
}

/**
 * A thorough search of one part. The part must have been noticed and not searched before, and an obstacle that
 * the phone cannot clear stops it before any time passes: the case names the way round. What the part holds is
 * found by a roll, unless it lies in plain sight; a part with nothing in it costs only its time.
 */
function resolveSearchPart(
  run: DetectiveRunState,
  rng: Rng,
  location: Location,
  parts: readonly PlacePart[],
  partId: string | undefined,
  toolId: GearId | undefined,
): Resolution {
  const part = parts.find(({ id }) => id === partId);
  if (part === undefined) return refuse('unknown-part', 'Name one of the parts of this place to search.');
  if (!run.noticedPartIds.includes(part.id)) {
    return refuse('part-not-noticed', 'The hero has not noticed that part yet.');
  }
  if (run.searchedParts.some((searched) => searched.partId === part.id)) {
    return refuse('part-searched', 'That part has been searched already.');
  }
  if (
    part.requiresLead !== null &&
    isLeadEarned(run, part.requiresLead) &&
    !isLeadOpen(run, part.requiresLead)
  ) {
    return refuse('lead-window', 'That is not the hour for it: the lead is followed at another time of day.');
  }
  const choice = chooseTool(run, part.obstacle, toolId);
  if (choice.kind === 'refused') {
    return refuse(
      choice.code,
      choice.code === 'wrong-tool'
        ? 'That tool is not in the kit, or does not get past that.'
        : 'The hero has nothing to get past that with.',
    );
  }
  if (choice.kind === 'none') return searchPartForClue(run, rng, location, part, NOTHING_CARRIED);

  // The tool against the obstacle: a roll for most, none for a torch. It wears whether it gets through or not.
  const { rules, item } = choice;
  const details: CheckDetail[] = [];
  const results: SkillCheckResult[] = [];
  const felt: SignalFelt[] = [];
  const revealed: Revealed[] = [];
  let cleared = true;
  let blundered = false;
  if (rules.check !== null) {
    const attempt = roll(run, rng, rules.check, locationScene(run, location));
    felt.push(...attempt.felt);
    revealed.push(...attempt.revealed);
    details.push({ subject: { kind: 'part', id: part.id }, result: attempt.result });
    results.push(attempt.result);
    cleared = attempt.result.success;
    blundered = attempt.result.critical === 'failure';
  }
  const used = worn(item, blundered);
  const tool = { id: item.id, cleared, wear: used.wear };
  const worndown = wearTool(run, item.id, blundered);
  // A tool that is not lawful risks being seen, whether it gets through or not.
  const risk = risks(run) && !rules.lawful ? unlawfulRisk(worndown, rng, location) : undefined;
  const watched = risk?.run ?? worndown;
  revealed.push(...(risk?.revealed ?? []));
  if (cleared) {
    return searchPartForClue(watched, rng, location, part, { details, felt, revealed, tool, risk });
  }

  // It did not get through: the time of the attempt, and a point of nerves unless a blunder already took one.
  const strained = blundered ? watched : strainByAction(watched);
  const detained = risk?.detentionMinutes ?? 0;
  const minutes = PART_SEARCH_MINUTES + rules.failureMinutes + detained;
  const settled = settle(strained, rng, minutes, results);
  const frayed = strained.condition.nerves < watched.condition.nerves;
  return {
    ok: true,
    run: settled.run,
    outcome: {
      kind: 'search',
      foundClueIds: [],
      minutes,
      consequences: uniqueConsequences([
        'time-lost',
        ...(frayed ? (['nerves-lost'] as const) : []),
        ...(risk?.consequences ?? []),
        ...settled.consequences,
      ]),
      partId: part.id,
      tool,
      ...(detained === 0 ? {} : { detainedMinutes: detained }),
    },
    details,
    felt: distinctFelt([...felt, ...settled.felt]),
    revealed,
  };
}

/** Each consequence once: a point of nerves lost to a failed attempt and to being seen is one thing to tell. */
function uniqueConsequences(consequences: readonly Consequence[]): Consequence[] {
  return [...new Set(consequences)];
}

/** What the tool against the obstacle has already settled when the part itself is searched. */
interface ToolCarry {
  readonly details: readonly CheckDetail[];
  readonly felt: readonly SignalFelt[];
  readonly revealed: readonly Revealed[];
  readonly tool?: NonNullable<Extract<Outcome, { kind: 'search' }>['tool']>;
  /** The risk of an unlawful tool, which has already cost the run what it costs; its minutes are added here. */
  readonly risk?: Risk | undefined;
}

const NOTHING_CARRIED: ToolCarry = { details: [], felt: [], revealed: [] };

/** What the part holds, once its obstacle is out of the way: found by a roll, unless it lies in plain sight. */
function searchPartForClue(
  run: DetectiveRunState,
  rng: Rng,
  location: Location,
  part: PlacePart,
  carried: ToolCarry,
): Resolution {
  const { tool, risk } = carried;
  const clue = hiddenClues(run, location.id).find(({ id }) => id === part.holds);
  const details: CheckDetail[] = [...carried.details];
  const results: SkillCheckResult[] = [];
  const felt: SignalFelt[] = [...carried.felt];
  const revealed: Revealed[] = [...lockOutReveals(run, location.id), ...carried.revealed];
  let found: Clue | undefined;
  if (clue !== undefined) {
    const subject = { kind: 'clue', id: clue.id } as const;
    if (clue.discovery === null) {
      found = clue;
      details.push({ subject, result: 'auto' });
    } else {
      const situations: TraitTrigger[] = [...locationScene(run, location), ...clue.situations];
      const { result, felt: moved, revealed: acted } = roll(run, rng, clue.discovery, situations);
      felt.push(...moved);
      revealed.push(...acted);
      results.push(result);
      details.push({ subject, result });
      if (result.success) found = clue;
    }
  }

  // A roll that finds nothing although something was there costs more than the search itself, and a point of
  // nerves besides, and the part is left to be searched again; an empty part is just time spent, and then done.
  const wasted = found === undefined && clue !== undefined;
  const marked = markSearched(run, location.id);
  const withFind = found === undefined ? marked : findClue(marked, found.id);
  const searched = wasted
    ? marked
    : recordPartSearch(withFind, part.id, location.id, found === undefined ? [] : [found.id]);
  const blundered = results.some((result) => result.critical === 'failure');
  const withClues = wasted && !blundered ? strainByAction(searched) : searched;
  const detained = risk?.detentionMinutes ?? 0;
  const minutes = PART_SEARCH_MINUTES + (wasted ? FAILED_SEARCH_MINUTES : 0) + detained;
  const settled = settle(withClues, rng, minutes, results);
  const frayed = withClues.condition.nerves < searched.condition.nerves;
  const consequences = uniqueConsequences([
    ...(wasted ? (['time-lost'] as const) : []),
    ...(frayed ? (['nerves-lost'] as const) : []),
    ...(risk?.consequences ?? []),
    ...settled.consequences,
  ]);
  return {
    ok: true,
    run: settled.run,
    outcome: {
      kind: 'search',
      foundClueIds: found === undefined ? [] : [found.id],
      minutes,
      consequences,
      partId: part.id,
      ...(tool === undefined ? {} : { tool }),
      ...(detained === 0 ? {} : { detainedMinutes: detained }),
    },
    details,
    felt: distinctFelt([...felt, ...settled.felt]),
    revealed,
  };
}

function resolveSearch(
  run: DetectiveRunState,
  rng: Rng,
  partId: string | undefined,
  toolId: GearId | undefined,
): Resolution {
  const location = locationById(run.case, run.locationId);
  const parts = partsOfPlace(run, location.id);
  if (parts.length > 0) return resolveSearchPart(run, rng, location, parts, partId, toolId);
  if (partId !== undefined) return refuse('unknown-part', 'This place has no parts to search.');
  const reinspection = run.searchedLocationIds.includes(location.id);
  const hidden = hiddenClues(run, location.id);
  const details: CheckDetail[] = [];
  const results: SkillCheckResult[] = [];
  const felt: SignalFelt[] = [];
  const revealed: Revealed[] = lockOutReveals(run, location.id);
  const found: Clue[] = [];

  for (const clue of hidden) {
    const situations: TraitTrigger[] = [...locationScene(run, location), ...clue.situations];
    if (reinspection) situations.push('reinspection');
    const subject = { kind: 'clue', id: clue.id } as const;
    const scene = sceneSituations(run, situations);
    if (clue.discovery === null || (reinspection && hasAutoDiscover(run.traits, scene))) {
      found.push(clue);
      details.push({ subject, result: 'auto' });
      if (clue.discovery !== null) {
        revealed.push(
          ...run.traits
            .filter(
              ({ trigger, effects }) =>
                scene.includes(trigger) && effects.some((e) => e.kind === 'auto-discover'),
            )
            .map((trait) => revealedBy(trait, 'auto-discover')),
        );
      }
      continue;
    }
    const { result, felt: moved, revealed: acted } = roll(run, rng, clue.discovery, situations);
    felt.push(...moved);
    revealed.push(...acted);
    results.push(result);
    details.push({ subject, result });
    if (result.success) found.push(clue);
  }

  const searched = found.reduce((state, clue) => findClue(state, clue.id), markSearched(run, location.id));
  // A search that turns up nothing although something was there costs more than the search itself, and a point
  // of nerves besides.
  const wasted = found.length === 0 && hidden.length > 0;
  // A blunder on the roll costs its own point (see `settle`) and is not counted twice.
  const blundered = results.some((result) => result.critical === 'failure');
  const withClues = wasted && !blundered ? strainByAction(searched) : searched;
  const minutes = SEARCH_MINUTES + (wasted ? FAILED_SEARCH_MINUTES : 0);
  const settled = settle(withClues, rng, minutes, results);
  const frayed = withClues.condition.nerves < searched.condition.nerves;
  const consequences: Consequence[] = [
    ...(wasted ? (['time-lost'] as const) : []),
    ...(frayed ? (['nerves-lost'] as const) : []),
    ...settled.consequences,
  ];
  return {
    ok: true,
    run: settled.run,
    outcome: { kind: 'search', foundClueIds: found.map(({ id }) => id), minutes, consequences },
    details,
    felt: distinctFelt([...felt, ...settled.felt]),
    revealed,
  };
}

function resolveMove(run: DetectiveRunState, rng: Rng, locationId: string): Resolution {
  const detectiveCase = run.case;
  // A place the hero does not know yet is refused like one that does not exist, so that asking cannot find it.
  const target = detectiveCase.locations.find(({ id }) => id === locationId);
  if (target === undefined || !isPlaceKnown(run, target)) {
    return refuse('unknown-location', `There is no location "${locationId}".`);
  }
  if (locationId === run.locationId) {
    return refuse('already-here', 'The hero is already there.');
  }
  if (!buildNeighbors(detectiveCase.locations).get(run.locationId)?.has(locationId)) {
    return refuse('not-adjacent', `"${locationId}" is not next to the hero's place.`);
  }

  if (isLocationClosed(run, locationId)) {
    return refuse('location-closed', `"${locationId}" has been closed.`);
  }
  const destination = locationById(detectiveCase, locationId);
  const { access } = destination;
  // A place the hero has been in is open to them for good.
  const visited = run.visitedLocationIds.includes(locationId);
  if (
    !visited &&
    destination.requiresLead !== undefined &&
    isLeadEarned(run, destination.requiresLead) &&
    !isLeadOpen(run, destination.requiresLead)
  ) {
    return refuse('lead-window', 'That is not the hour for it: the lead is followed at another time of day.');
  }
  const details: CheckDetail[] = [];
  const results: SkillCheckResult[] = [];
  const felt: SignalFelt[] = [];
  const revealed: Revealed[] = [];
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
        const {
          result,
          felt: moved,
          revealed: acted,
        } = roll(run, rng, access.check, locationScene(run, destination));
        felt.push(...moved);
        revealed.push(...acted);
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

  const arrived = entered ? moveTo(run, locationId) : run;
  // The walk itself: the weather's minutes and, now and then, a small mishap; only a walk that was made.
  const road = entered
    ? walk(run, locationById(detectiveCase, run.locationId), destination, rng)
    : { extraMinutes: 0 };
  const moved = road.mishap === undefined ? arrived : applyMishap(arrived, road.mishap);
  const minutes =
    MOVE_MINUTES + road.extraMinutes + (road.mishap?.minutes ?? 0) + (entered ? 0 : FAILED_ENTRY_MINUTES);
  const settled = settle(moved, rng, minutes, results);
  const consequences: Consequence[] = [...(entered ? [] : (['time-lost'] as const)), ...settled.consequences];
  return {
    ok: true,
    run: settled.run,
    outcome: {
      kind: 'move',
      from: run.locationId,
      to: locationId,
      entered,
      minutes,
      consequences,
      ...(road.weather === undefined ? {} : { weather: road.weather }),
      ...(road.hazard === undefined ? {} : { hazard: road.hazard }),
      ...(road.mishap === undefined ? {} : { roadMishap: road.mishap.id }),
    },
    details,
    felt: distinctFelt([...felt, ...settled.felt]),
    revealed,
  };
}

/**
 * Turns one player intent into a state change: validates it against the state, rolls the checks it needs
 * on the run's dice, spends time and counts the turn. A pure function: the same state, intent and dice
 * always give the same resolution, and the state it is given is left alone. An intent that cannot be carried
 * out is refused with a code, and then nothing changes and no dice are rolled.
 */
export function resolveIntent(run: DetectiveRunState, input: unknown, rng: Rng): Resolved {
  const dispatched = dispatchIntent(run, input, rng);
  if (!dispatched.ok) return dispatched;
  const resolution = applyFatigue(run, dispatched, rng);
  // The turn is settled here, once, for every kind of intent: the night, scheduled events and the ways to lose.
  const slept = sleepIfDue(resolution, run.clock.day, rng);
  const indebted = collectDebt(slept.run, run.clock.day);
  const shown = applyReveals(indebted.run, [...(slept.revealed ?? []), ...indebted.revealed]);
  const settled = settleClock(drawDayEvents(shown.run, run.clock, rng).run, run.clock.day);
  const newLeadIds = settled.earnedLeads.slice(run.earnedLeads.length).map(({ leadId }) => leadId);
  return { ...slept, run: settled, revealed: shown.revealed, newLeadIds };
}

/** What `resolveIntent` returns: every carried-out turn says which hidden traits it showed, often none. */
export type Resolved =
  | Extract<Resolution, { ok: false }>
  | (Extract<Resolution, { ok: true }> & {
      readonly revealed: readonly Revealed[];
      /** The leads this turn earned, by id: the view says what each is. */
      readonly newLeadIds: readonly string[];
    });

type Carried = Resolution & { ok: true };

/**
 * The night, if the turn brought one: the hero chose to rest, the active hours ran out or nerves are gone
 * and the meters call it a collapse. A run that is lost to its meters or its reputation does not sleep it
 * off: the night would hide a breakdown, which the clock settles next.
 */
function sleepIfDue(resolution: Carried, day: number, rng: Rng): Carried {
  const { run } = resolution;
  if (run.status !== 'active') return resolution;
  if (run.reputation === 0 || endReasonOfMeters(meterReadings(run)) !== null) return resolution;
  let cause: NightCause | null = null;
  if (resolution.outcome.kind === 'rest') cause = 'rest';
  else if (run.clock.day > day) cause = 'active-hours';
  else if (isCollapse(run)) cause = 'collapse';
  if (cause === null) return resolution;
  // A day cut short by the hero's own choice or by a collapse is owed its event before the night begins.
  const owed = cause === 'active-hours' ? run : drawOwedDayEvent(run, rng).run;
  const night = passNight(owed, rng, cause, day);
  return { ...resolution, run: night.run, night: night.report };
}

function resolveRest(run: DetectiveRunState, rng: Rng): Resolution {
  return { ok: true, run: endTurn(run, rng), outcome: { kind: 'rest' }, details: [] };
}

/**
 * Sitting down at a venue: time passes, a point of nerves comes back. Refused, with nothing spent, where there is no
 * venue, where it is shut or unsafe, for a hero who is not frayed, and once the day's sittings are used.
 */
function resolveSit(run: DetectiveRunState, rng: Rng): Resolution {
  const refusal = sitRefusal(run, locationById(run.case, run.locationId), DETECTIVE_NERVES.max);
  if (refusal !== null) return refuse(refusal, `The hero cannot sit down here: ${refusal}.`);
  const rested = recordSitting(run, SIT_NERVES);
  const settled = endTurn(spendTime(rested, SIT_MINUTES), rng);
  return {
    ok: true,
    run: settled,
    outcome: {
      kind: 'sit',
      minutes: SIT_MINUTES,
      nervesRestored: rested.condition.nerves - run.condition.nerves,
      sitsLeft: sitsLeft(rested),
    },
    details: [],
  };
}

/**
 * Asking the locals: a contacts roll in the place. A success gets out of them the rumours the case holds for this
 * place, a failure only time. A piece named in `toolId` (cash) eases the roll and wears.
 */
function resolveAsk(run: DetectiveRunState, rng: Rng, intent: Extract<Intent, { kind: 'ask' }>): Resolution {
  const { toolId, witnessId, aboutSuspectId } = intent;
  if (run.rulesetVersion < ASK_RULESET_VERSION)
    return refuse('not-available', 'Nobody here has a rumour to tell.');
  // A question to a witness: one who is not here now, one of another place and one that does not exist are refused alike.
  let witness: Witness | undefined;
  if (witnessId !== undefined || aboutSuspectId !== undefined) {
    if (run.rulesetVersion < WITNESS_RULESET_VERSION)
      return refuse('not-available', 'Nobody here has seen anything.');
    if (witnessId === undefined) return refuse('invalid-intent', 'Name the witness to ask.');
    witness = witnessesHere(run).find(({ id }) => id === witnessId);
    if (witness === undefined) return refuse('no-witness', 'There is nobody here to ask that.');
    if (aboutSuspectId !== undefined && !run.case.suspects.some(({ id }) => id === aboutSuspectId)) {
      return refuse('unknown-suspect', `There is no suspect "${aboutSuspectId}".`);
    }
  }
  const helper = toolId === undefined ? undefined : askBonusOf(run, toolId);
  if (toolId !== undefined && helper === undefined) {
    return refuse('wrong-tool', 'That is not in the kit, or it is no help in asking.');
  }
  const location = locationById(run.case, run.locationId);
  const named = aboutSuspectId !== undefined && holdsClueAbout(run, aboutSuspectId);
  const attempt = roll(
    run,
    rng,
    {
      skill: 'contacts',
      difficulty: ASK_DIFFICULTY - (helper?.bonus ?? 0) - (named ? WITNESS_NAMED_EASE : 0),
    },
    locationScene(run, location),
  );
  const { result } = attempt;
  const worndown = helper === undefined ? run : wearTool(run, helper.item.id, false);
  const sightings =
    witness !== undefined && result.success ? sightingsOf(run.case, witness, aboutSuspectId) : [];
  // From the ruleset of sighting clues, what the witness tells is a clue the hero now holds, when the case has made one.
  const told =
    run.rulesetVersion < SIGHTING_CLUES_RULESET_VERSION || witness === undefined
      ? []
      : [...new Set(sightings.map(({ suspectId }) => sightingClueId(witness.id, suspectId)))].filter(
          (clueId) => run.case.clues.some(({ id }) => id === clueId) && !run.foundClueIds.includes(clueId),
        );
  const heard =
    witness !== undefined
      ? told.reduce(findToldClue, recordSightings(worndown, witness, sightings))
      : result.success
        ? grantLeads(worndown, [{ kind: 'locals', locationId: location.id }])
        : worndown;
  const minutes = ASK_MINUTES + (result.success ? 0 : FAILED_ASK_MINUTES);
  const settled = settle(heard, rng, minutes, [result]);
  return {
    ok: true,
    run: settled.run,
    outcome: {
      kind: 'ask',
      minutes,
      succeeded: result.success,
      consequences: [...(result.success ? [] : (['time-lost'] as const)), ...settled.consequences],
      ...(helper === undefined ? {} : { tool: { id: helper.item.id, wear: worn(helper.item, false).wear } }),
      ...(witness === undefined
        ? {}
        : { witness: { id: witness.id, sightings, ...(told.length === 0 ? {} : { clueIds: told }) } }),
    },
    details: [{ subject: { kind: 'location', id: location.id }, result }],
    felt: distinctFelt([...attempt.felt, ...settled.felt]),
    revealed: attempt.revealed,
  };
}

/**
 * Studying a clue the hero holds with a tool: a roll of the tool's own skill. A success gets out of the clue the leads
 * the case holds for that clue and that tool, a failure costs time, and the tool wears either way, a piece that is
 * used up spending a charge.
 */
function resolveStudy(
  run: DetectiveRunState,
  rng: Rng,
  clueId: string,
  toolId: GearId | undefined,
): Resolution {
  if (run.rulesetVersion < ASK_RULESET_VERSION)
    return refuse('not-available', 'There is nothing to study that with.');
  // A clue not found and one that does not exist are refused alike.
  if (!run.foundClueIds.includes(clueId)) {
    return refuse('clue-not-found', 'The hero can only study a clue they hold.');
  }
  const choice = chooseStudyTool(run, toolId);
  if (choice.kind === 'refused') {
    return refuse(
      choice.code,
      choice.code === 'wrong-tool'
        ? 'That tool is not in the kit, or it is no use for studying a clue.'
        : 'The hero has nothing to study a clue with.',
    );
  }
  const { item, rules } = choice;
  const location = locationById(run.case, run.locationId);
  const attempt = roll(run, rng, rules.study, locationScene(run, location));
  const { result } = attempt;
  const used = worn(item, result.critical === 'failure');
  const worndown = wearTool(run, item.id, result.critical === 'failure');
  const found = result.success ? grantLeads(worndown, [{ kind: 'study', clueId, tool: item.id }]) : worndown;
  const minutes = STUDY_MINUTES + (result.success ? 0 : Math.max(rules.failureMinutes, FAILED_STUDY_MINUTES));
  const settled = settle(found, rng, minutes, [result]);
  return {
    ok: true,
    run: settled.run,
    outcome: {
      kind: 'study',
      clueId,
      minutes,
      succeeded: result.success,
      consequences: [...(result.success ? [] : (['time-lost'] as const)), ...settled.consequences],
      tool: { id: item.id, wear: used.wear },
    },
    details: [{ subject: { kind: 'clue', id: clueId }, result }],
    felt: distinctFelt([...attempt.felt, ...settled.felt]),
    revealed: attempt.revealed,
  };
}

function dispatchIntent(run: DetectiveRunState, input: unknown, rng: Rng): Resolution {
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
      return resolveSearch(run, rng, intent.partId, intent.toolId);
    case 'move':
      return resolveMove(run, rng, intent.locationId);
    case 'rest':
      return resolveRest(run, rng);
    case 'sit':
      return resolveSit(run, rng);
    case 'ask':
      return resolveAsk(run, rng, intent);
    case 'study':
      return resolveStudy(run, rng, intent.clueId, intent.toolId);
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
    case 'reread':
      return resolveReread(run, intent, rng);
    case 'use':
      return resolveUse(run, intent, rng);
    case 'take':
      return resolveTake(run, intent, rng);
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(intent);
  }
}
