// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Rng } from '../dice.js';
import type { Locale } from '../locale.js';
import {
  MAX_REPUTATION,
  RULESET_VERSION,
  DAY_START_MINUTE,
  RUN_SCHEMA_VERSION,
  advanceClock,
  statusOfEndReason,
  runBaseShape,
  type EndReason,
  type RunClock,
  type RunStatus,
} from '../run.js';
import { warningsOfMeters } from '../meters.js';
import { DrawnSignalEventSchema, findSignal, signalIgnores, type Signal } from '../signals.js';
import { TraitSchema, type Trait } from '../traits.js';
import { DETECTIVE, DetectiveHeroSchema, type DetectiveHero } from './archetype.js';
import {
  HeroConditionSchema,
  absoluteMinute,
  initialCondition,
  passTime,
  withCondition,
  withNervesStrained,
  meterReadings,
  viewCondition,
  type ConditionId,
  type ConditionView,
} from './condition.js';
import { DetectiveCaseSchema, EntityIdSchema, type DetectiveCase, type Location } from './case-schema.js';
import {
  PendingEffectSchema,
  SuppliesSchema,
  initialSupplies,
  splitPending,
  viewPending,
  viewSupplies,
  withMeterDelta,
  type PendingView,
  type SupplyView,
} from './consumables.js';
import { GearIdSchema, KitItemSchema, initialKit, viewKit, withGearState, type KitView } from './gear.js';
import { buildNeighbors } from './obtainability.js';
import { isLocationClosed, suspectPlace } from './random-events.js';
import { CASE_SEAL_PATTERN, isCaseSealIntact, sealCase } from './seal.js';

/** A random event that has happened, and the day it happened on. */
export const DrawnEventSchema = z.object({ eventId: EntityIdSchema, day: z.int().min(1) });
export type DrawnEvent = z.infer<typeof DrawnEventSchema>;

/**
 * Everything about one detective run. It holds the secrets of the case and the hero's hidden traits, so
 * it never goes to the narrator or the player as it is: they get `viewRun`.
 */
export const DetectiveRunStateSchema = z
  .object({
    ...runBaseShape,
    archetype: z.literal(DETECTIVE.id),
    hero: DetectiveHeroSchema,
    /** Rolled at hero creation. Only the ids in `revealedTraitIds` are known to the player. */
    traits: z.array(TraitSchema),
    revealedTraitIds: z.array(z.string().min(1)),
    case: DetectiveCaseSchema,
    /** The case as it was when the validator accepted it; see `sealCase`. */
    caseSeal: z.string().regex(CASE_SEAL_PATTERN),
    locationId: EntityIdSchema,
    visitedLocationIds: z.array(EntityIdSchema),
    /** Places the hero has searched; a second search of one is a reinspection. */
    searchedLocationIds: z.array(EntityIdSchema),
    foundClueIds: z.array(EntityIdSchema),
    /** Deductions the hero has made. */
    insightIds: z.array(EntityIdSchema),
    /** Lies of suspects that the hero has broken; the suspect has given that ground for good. */
    concededLieIds: z.array(EntityIdSchema).default([]),
    /** Nerves, sleep debt and timed conditions; see `condition.ts`. */
    condition: HeroConditionSchema.default(() => initialCondition()),
    /** The hero's gear and whether each piece is in hand; it comes from their background. Old saves have none. */
    kit: z.array(KitItemSchema).default([]),
    /** Places that a scheduled event has closed; the hero cannot enter them any more. */
    closedLocationIds: z.array(EntityIdSchema).default([]),
    /** Random events the night has drawn, with the day of each; the pool of the case holds what they are. */
    drawnEvents: z.array(DrawnEventSchema).default([]),
    /** Signal events the night has drawn; the tone is in the log, and the narrator is told only the kind. */
    signalEvents: z.array(DrawnSignalEventSchema).default([]),
    /** Found clues whose reading was garbled by fatigue; each must be read again before it is used as proof. */
    garbledClueIds: z.array(EntityIdSchema).default([]),
    /** Consumables the hero carries, by count; they come from their background. Old saves have none. */
    supplies: SuppliesSchema.default({}),
    /** Prices of consumables that have not landed yet; the clock and the night apply them. */
    pendingEffects: z.array(PendingEffectSchema).default([]),
  })
  .superRefine((run, context) => {
    if (!isCaseSealIntact(run)) {
      context.addIssue({
        code: 'custom',
        path: ['caseSeal'],
        message: 'The case does not match its seal: it was changed after it was accepted.',
      });
    }
    // A save from before reasons were recorded may end without one, but a reason must agree with the status.
    if (run.endReason !== null && statusOfEndReason(run.endReason) !== run.status) {
      context.addIssue({
        code: 'custom',
        path: ['endReason'],
        message: `The end reason "${run.endReason}" does not fit the status "${run.status}".`,
      });
    }
    const known = (path: string, ids: readonly string[], valid: ReadonlySet<string>): void => {
      for (const id of ids) {
        if (!valid.has(id)) {
          context.addIssue({ code: 'custom', path: [path], message: `"${id}" does not exist in this run.` });
        }
      }
    };
    const locationIds = new Set(run.case.locations.map(({ id }) => id));
    known('locationId', [run.locationId], locationIds);
    known('visitedLocationIds', run.visitedLocationIds, locationIds);
    known('searchedLocationIds', run.searchedLocationIds, locationIds);
    known('foundClueIds', run.foundClueIds, new Set(run.case.clues.map(({ id }) => id)));
    known('insightIds', run.insightIds, new Set(run.case.deductions.map(({ id }) => id)));
    known(
      'concededLieIds',
      run.concededLieIds,
      new Set(run.case.suspects.flatMap(({ lies }) => lies.map(({ id }) => id))),
    );
    known('garbledClueIds', run.garbledClueIds, new Set(run.case.clues.map(({ id }) => id)));
    known('closedLocationIds', run.closedLocationIds, locationIds);
    known(
      'drawnEvents',
      run.drawnEvents.map(({ eventId }) => eventId),
      new Set((run.case.randomEvents ?? []).map(({ id }) => id)),
    );
    if (new Set(run.kit.map(({ id }) => id)).size !== run.kit.length) {
      context.addIssue({
        code: 'custom',
        path: ['kit'],
        message: 'A piece of gear is in the kit at most once.',
      });
    }
    known('revealedTraitIds', run.revealedTraitIds, new Set(run.traits.map(({ id }) => id)));
  });
export type DetectiveRunState = z.infer<typeof DetectiveRunStateSchema>;

export interface NewDetectiveRun {
  readonly hero: DetectiveHero;
  readonly traits: readonly Trait[];
  /** A case the validator has accepted for this hero. */
  readonly case: DetectiveCase;
  readonly seed: string;
  readonly rngState: number;
  readonly locale: Locale;
}

export function createDetectiveRun(input: NewDetectiveRun): DetectiveRunState {
  return DetectiveRunStateSchema.parse({
    schemaVersion: RUN_SCHEMA_VERSION,
    rulesetVersion: RULESET_VERSION,
    seed: input.seed,
    rngState: input.rngState,
    locale: input.locale,
    turn: 0,
    clock: { day: 1, minute: DAY_START_MINUTE },
    reputation: MAX_REPUTATION,
    status: 'active',
    endReason: null,
    archetype: DETECTIVE.id,
    hero: input.hero,
    traits: input.traits,
    revealedTraitIds: [],
    case: input.case,
    caseSeal: sealCase(input.case),
    locationId: input.case.startLocationId,
    visitedLocationIds: [input.case.startLocationId],
    searchedLocationIds: [],
    foundClueIds: [],
    insightIds: [],
    concededLieIds: [],
    condition: initialCondition(),
    kit: initialKit(input.hero.background),
    closedLocationIds: [],
    drawnEvents: [],
    signalEvents: [],
    garbledClueIds: [],
    supplies: initialSupplies(input.hero.background),
    pendingEffects: [],
  });
}

// Transitions are pure: each returns a new state and leaves the old one alone. They guard the invariants
// of the state, so a call with an id that names nothing is a bug in the caller and throws.

function assertActive(run: DetectiveRunState): void {
  if (run.status !== 'active') {
    throw new RangeError(`The run is already over (${run.status}).`);
  }
}

function addOnce(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? [...ids] : [...ids, id];
}

function requireId(kind: string, id: string, ids: readonly string[]): void {
  if (!ids.includes(id)) {
    throw new RangeError(`There is no ${kind} "${id}" in this run.`);
  }
}

export function moveTo(run: DetectiveRunState, locationId: string): DetectiveRunState {
  assertActive(run);
  requireId(
    'location',
    locationId,
    run.case.locations.map(({ id }) => id),
  );
  return { ...run, locationId, visitedLocationIds: addOnce(run.visitedLocationIds, locationId) };
}

export function markSearched(run: DetectiveRunState, locationId: string): DetectiveRunState {
  assertActive(run);
  requireId(
    'location',
    locationId,
    run.case.locations.map(({ id }) => id),
  );
  return { ...run, searchedLocationIds: addOnce(run.searchedLocationIds, locationId) };
}

export function findClue(run: DetectiveRunState, clueId: string): DetectiveRunState {
  assertActive(run);
  requireId(
    'clue',
    clueId,
    run.case.clues.map(({ id }) => id),
  );
  return { ...run, foundClueIds: addOnce(run.foundClueIds, clueId) };
}

export function addInsight(run: DetectiveRunState, deductionId: string): DetectiveRunState {
  assertActive(run);
  requireId(
    'deduction',
    deductionId,
    run.case.deductions.map(({ id }) => id),
  );
  return { ...run, insightIds: addOnce(run.insightIds, deductionId) };
}

/** The engine shows a trait to the player; from then on it is part of the public view. */
export function revealTrait(run: DetectiveRunState, traitId: string): DetectiveRunState {
  assertActive(run);
  requireId(
    'trait',
    traitId,
    run.traits.map(({ id }) => id),
  );
  return { ...run, revealedTraitIds: addOnce(run.revealedTraitIds, traitId) };
}

export function spendTime(run: DetectiveRunState, minutes: number): DetectiveRunState {
  assertActive(run);
  const clock = advanceClock(run.clock, minutes);
  const passed = { ...run, clock, condition: passTime(run.condition, run.clock, minutes) };
  return landPending(passed, false);
}

/**
 * Lets the delayed prices that are due land: those whose minute has come and, at the night, those that wait
 * for it. They land on the condition in the order they were scheduled.
 */
export function landPending(run: DetectiveRunState, night: boolean): DetectiveRunState {
  const { due, waiting } = splitPending(run.pendingEffects, absoluteMinute(run.clock), night);
  if (due.length === 0) return run;
  return { ...run, condition: due.reduce(withMeterDelta, run.condition), pendingEffects: waiting };
}

/** The signal of the hero, if they chose one. */
export function signalOfRun(run: DetectiveRunState): Signal | undefined {
  return findSignal(DETECTIVE.signals, run.hero.signalId);
}

/** A failure frays the nerves, unless the hero's signal ignores that; an event's cost is not a failure. */
export function strainNerves(
  run: DetectiveRunState,
  cause: 'failure' | 'event' = 'failure',
): DetectiveRunState {
  assertActive(run);
  if (cause === 'failure' && signalIgnores(signalOfRun(run), 'nerves', 'failure')) return run;
  return { ...run, condition: withNervesStrained(run.condition) };
}

/** Puts a timed condition on the hero. */
export function startCondition(run: DetectiveRunState, id: ConditionId): DetectiveRunState {
  assertActive(run);
  return { ...run, condition: withCondition(run.condition, id) };
}

/** A piece of gear is lost: its bonus is gone and its penalty applies until it is replaced. */
export function loseGear(run: DetectiveRunState, gearId: string): DetectiveRunState {
  assertActive(run);
  return { ...run, kit: withGearState(run.kit, GearIdSchema.parse(gearId), 'lost') };
}

/** A lost piece is replaced: the penalty goes and the bonus is back. No intent reaches this yet. */
export function replaceGear(run: DetectiveRunState, gearId: string): DetectiveRunState {
  assertActive(run);
  return { ...run, kit: withGearState(run.kit, GearIdSchema.parse(gearId), 'owned') };
}

/** Reputation moves by `delta` and stays between zero and the maximum. */
export function changeReputation(run: DetectiveRunState, delta: number): DetectiveRunState {
  assertActive(run);
  if (!Number.isInteger(delta)) {
    throw new RangeError(`Reputation changes by whole points, got ${String(delta)}.`);
  }
  return { ...run, reputation: Math.min(MAX_REPUTATION, Math.max(0, run.reputation + delta)) };
}

/** Closes a turn: counts it and keeps the state of the dice so that the next roll can be resumed. */
export function endTurn(run: DetectiveRunState, rng: Rng): DetectiveRunState {
  assertActive(run);
  return { ...run, turn: run.turn + 1, rngState: rng.state() };
}

/** Ends the run. The reason says why, and it must be one that leads to this status. */
export function endRun(
  run: DetectiveRunState,
  status: Exclude<RunStatus, 'active'>,
  endReason: EndReason | null = null,
): DetectiveRunState {
  assertActive(run);
  if (endReason !== null && statusOfEndReason(endReason) !== status) {
    throw new RangeError(`The end reason "${endReason}" does not lead to the status "${status}".`);
  }
  return { ...run, status, endReason };
}

/** Closes a place for good: a scheduled event of the case does this, never the player. */
export function closeLocation(run: DetectiveRunState, locationId: string): DetectiveRunState {
  assertActive(run);
  requireId(
    'location',
    locationId,
    run.case.locations.map(({ id }) => id),
  );
  return { ...run, closedLocationIds: addOnce(run.closedLocationIds, locationId) };
}

/** Writes down that a random event of the case's pool has happened today; its effects are applied elsewhere. */
export function recordDrawnEvent(run: DetectiveRunState, eventId: string): DetectiveRunState {
  assertActive(run);
  requireId(
    'random event',
    eventId,
    (run.case.randomEvents ?? []).map(({ id }) => id),
  );
  return { ...run, drawnEvents: [...run.drawnEvents, { eventId, day: run.clock.day }] };
}

/** What the player and the narrator may know. It leaves out the truth, the solution and unrevealed traits. */
export interface DetectiveRunView {
  readonly title: string;
  readonly premise: string;
  readonly locale: Locale;
  readonly turn: number;
  readonly status: RunStatus;
  readonly clock: RunClock & { readonly totalDays: number };
  readonly reputation: number;
  readonly condition: ConditionView;
  /** The hero's gear and whether each piece is in hand or lost. */
  readonly kit: readonly KitView[];
  /** Consumables in hand, by count. */
  readonly supplies: readonly SupplyView[];
  /** Prices that are on their way and have not landed yet. */
  readonly pending: readonly PendingView[];
  /** Ids of the warnings the player is shown, such as `low-reputation`; they come from the meters' data. */
  readonly warnings: readonly string[];
  /** What the world has done so far, as the player was told: events whose day has come. */
  readonly news: readonly string[];
  readonly hero: DetectiveHero;
  /** The hero's public character signal: ids only, so the narrator gets a voice and never a number. */
  readonly signal: {
    readonly id: string;
    readonly voice: string;
    readonly gift: string;
    readonly cost: string;
  } | null;
  /** Signal events of the day the run is at, by kind only: the engine chose their tone and effect. */
  readonly signalEvents: readonly { readonly kind: string }[];
  readonly hiddenTraitCount: number;
  readonly revealedTraits: readonly Trait[];
  readonly location: {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly exits: readonly {
      readonly id: string;
      readonly name: string;
      readonly visited: boolean;
      /** Why the way is shut right now, if it is: a door that wants a clue first, or a place an event closed. */
      readonly blocked: 'locked' | 'closed' | null;
    }[];
  };
  readonly suspects: readonly {
    readonly id: string;
    readonly name: string;
    readonly persona: string;
    /** Where the suspect can be found now; `null` when the case ties them to no place (ask anywhere). */
    readonly place: { readonly id: string; readonly name: string } | null;
  }[];
  readonly clues: readonly {
    readonly id: string;
    readonly locationId: string;
    readonly description: string;
    /** Read badly: the clue counts as found, but it has to be read again before it is used as proof. */
    readonly garbled: boolean;
  }[];
  readonly insights: readonly { readonly id: string; readonly insight: string }[];
}

function requireLocation(detectiveCase: DetectiveCase, id: string): Location {
  const location = detectiveCase.locations.find((candidate) => candidate.id === id);
  if (!location) {
    throw new RangeError(`There is no location "${id}" in this run.`);
  }
  return location;
}

function signalViewOf(run: DetectiveRunState): DetectiveRunView['signal'] {
  const signal = signalOfRun(run);
  return signal === undefined
    ? null
    : { id: signal.id, voice: signal.voice, gift: signal.gift, cost: signal.cost };
}

/** Mirrors the refusals of a move, so the narrator never offers a way the engine will turn back. */
function blockedWay(
  run: DetectiveRunState,
  id: string,
  access: Location['access'],
  visited: boolean,
): 'locked' | 'closed' | null {
  if (isLocationClosed(run, id)) return 'closed';
  return !visited && access.kind === 'clue' && !run.foundClueIds.includes(access.clueId) ? 'locked' : null;
}

export function viewRun(run: DetectiveRunState): DetectiveRunView {
  const { case: detectiveCase } = run;
  const location = requireLocation(detectiveCase, run.locationId);
  const exits = [...(buildNeighbors(detectiveCase.locations).get(location.id) ?? [])].map((id) => {
    const { name, access } = requireLocation(detectiveCase, id);
    const visited = run.visitedLocationIds.includes(id);
    return { id, name, visited, blocked: blockedWay(run, id, access, visited) };
  });
  const pool = detectiveCase.randomEvents ?? [];
  return {
    title: detectiveCase.title,
    premise: detectiveCase.premise,
    locale: run.locale,
    turn: run.turn,
    status: run.status,
    clock: { ...run.clock, totalDays: detectiveCase.clock.days },
    reputation: run.reputation,
    condition: viewCondition(run.condition),
    kit: viewKit(run.kit),
    supplies: viewSupplies(run.supplies),
    pending: viewPending(run.pendingEffects, absoluteMinute(run.clock)),
    warnings: warningsOfMeters(meterReadings(run)),
    news: detectiveCase.clock.worldEvents
      .filter(({ day }) => day <= run.clock.day)
      .map(({ description }) => description)
      .concat(
        run.drawnEvents.flatMap(({ eventId }) =>
          pool.filter(({ id }) => id === eventId).map(({ description }) => description),
        ),
      ),
    hero: run.hero,
    signal: signalViewOf(run),
    signalEvents: run.signalEvents.filter(({ day }) => day === run.clock.day).map(({ kind }) => ({ kind })),
    hiddenTraitCount: run.traits.length - run.revealedTraitIds.length,
    revealedTraits: run.traits.filter(({ id }) => run.revealedTraitIds.includes(id)),
    location: { id: location.id, name: location.name, description: location.description, exits },
    suspects: detectiveCase.suspects.map((suspect) => {
      const placeId = suspectPlace(run, suspect);
      const place = placeId === undefined ? undefined : requireLocation(detectiveCase, placeId);
      return {
        id: suspect.id,
        name: suspect.name,
        persona: suspect.persona,
        place: place === undefined ? null : { id: place.id, name: place.name },
      };
    }),
    clues: detectiveCase.clues
      .filter(({ id }) => run.foundClueIds.includes(id))
      .map(({ id, locationId, description }) => ({
        id,
        locationId,
        description,
        garbled: run.garbledClueIds.includes(id),
      })),
    insights: detectiveCase.deductions
      .filter(({ id }) => run.insightIds.includes(id))
      .map(({ id, insight }) => ({ id, insight })),
  };
}
