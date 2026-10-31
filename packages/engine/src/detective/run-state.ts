// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Rng } from '../dice.js';
import type { Locale } from '../locale.js';
import {
  MAX_REPUTATION,
  MINUTES_PER_DAY,
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
import type { ClimateProfile } from '../world/climate.js';
import { SeedKindSchema } from '../news/seed.js';
import { SettingSchema, type Setting } from '../world/setting.js';
import { companionName } from './tavern.js';
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
export const STATEMENT_KINDS = ['alibi', 'conceded', 'secret'] as const;

/**
 * A line a suspect said to the hero: their alibi (once), a lie they gave up, or a secret a perfect roll won.
 * Only what the suspect said aloud; the lies that still hold and the sealed truth are never recorded.
 */
export const StatementSchema = z.strictObject({
  suspectId: EntityIdSchema,
  day: z.int().min(1),
  kind: z.enum(STATEMENT_KINDS),
  text: z.string().min(1),
});
export type Statement = z.infer<typeof StatementSchema>;

/**
 * What the case grew from: the kind of trouble a seed of the day names, and the sentence the seed extractor
 * invented for it. A seed is abstract by construction (no headline, no real name), so it is safe to show.
 */
export const InspirationSchema = z.strictObject({
  kind: SeedKindSchema,
  premise: z.string().min(1).max(400),
});
export type Inspiration = z.infer<typeof InspirationSchema>;

export const SHOWN_EFFECTS = ['breaks-lie', 'no-effect'] as const;
export type ShownEffect = (typeof SHOWN_EFFECTS)[number];
export const LINK_RESULTS = ['insight', 'already-known', 'nothing'] as const;
export type LinkResult = (typeof LINK_RESULTS)[number];

/**
 * What the hero has done with the clues, in the order it happened. All of it is public: the player did it and
 * was told the outcome. A link that came to nothing says nothing of how close it was.
 */
export const RunHistorySchema = z.object({
  finds: z.array(z.object({ clueId: EntityIdSchema, locationId: EntityIdSchema, turn: z.int().min(1) })),
  shown: z.array(
    z.object({
      suspectId: EntityIdSchema,
      clueId: EntityIdSchema,
      effect: z.enum(SHOWN_EFFECTS),
      turn: z.int().min(1),
    }),
  ),
  links: z.array(
    z.object({ clueIds: z.array(EntityIdSchema).min(2), result: z.enum(LINK_RESULTS), turn: z.int().min(1) }),
  ),
});
export type RunHistory = z.infer<typeof RunHistorySchema>;

const emptyHistory = (): RunHistory => ({ finds: [], shown: [], links: [] });

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
    /** The country of the mirror world the run is set in, with its climate. Old saves have none. */
    setting: SettingSchema.nullable().default(null),
    /** What suspects have said at questioning, in the order they said it. Old saves have none. */
    statements: z.array(StatementSchema).default([]),
    /** What the hero has done with the clues, for the board: where each was found, to whom it was shown, the links tried. */
    history: RunHistorySchema.default(() => emptyHistory()),
    /** The pattern of news the case grew from, when it grew from one. Old saves have none. */
    inspiration: InspirationSchema.nullable().default(null),
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
      'statements',
      run.statements.map(({ suspectId }) => suspectId),
      new Set(run.case.suspects.map(({ id }) => id)),
    );
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
  /** The country the case is set in; none when the world has no country with a climate yet. */
  readonly setting?: Setting | null | undefined;
  /** The seed of the day the case was built on; none when the news gave no seed. */
  readonly inspiration?: Inspiration | null | undefined;
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
    kit: initialKit(input.hero.background, input.hero.lifeState),
    closedLocationIds: [],
    drawnEvents: [],
    signalEvents: [],
    garbledClueIds: [],
    supplies: initialSupplies(input.hero.background, input.hero.lifeState),
    pendingEffects: [],
    setting: input.setting ?? null,
    statements: [],
    history: emptyHistory(),
    inspiration: input.inspiration ?? null,
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
  if (run.foundClueIds.includes(clueId)) return run;
  // The place is the clue's own, public once the clue is found; `requireId` has proved there is one such clue.
  const found = run.case.clues.flatMap(({ id, locationId }) =>
    id === clueId ? [{ clueId, locationId, turn: run.turn + 1 }] : [],
  );
  return {
    ...run,
    foundClueIds: [...run.foundClueIds, clueId],
    history: { ...run.history, finds: [...run.history.finds, ...found] },
  };
}

/** Writes down that clues were shown to a suspect in the turn being played, with what the showing did. */
export function recordShown(
  run: DetectiveRunState,
  suspectId: string,
  shown: readonly { readonly clueId: string; readonly effect: ShownEffect }[],
): DetectiveRunState {
  return {
    ...run,
    history: {
      ...run.history,
      shown: [
        ...run.history.shown,
        ...shown.map(({ clueId, effect }) => ({ suspectId, clueId, effect, turn: run.turn + 1 })),
      ],
    },
  };
}

/** Writes down that the hero tried to link these clues in the turn being played, and what came of it. */
export function recordLink(
  run: DetectiveRunState,
  clueIds: readonly string[],
  result: LinkResult,
): DetectiveRunState {
  return {
    ...run,
    history: {
      ...run.history,
      links: [...run.history.links, { clueIds: [...clueIds], result, turn: run.turn + 1 }],
    },
  };
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
  /**
   * The same events with the day each came, oldest first, and how much working time is left before the case
   * runs out. Events that have not come are not here: what the world will do is not the player's to know.
   */
  readonly chronicle: {
    readonly activeMinutesLeft: number;
    readonly events: readonly { readonly day: number; readonly text: string }[];
  };
  readonly hero: DetectiveHero;
  /** Where each clue was found, to whom it was shown and the links tried, in order; the board draws it. */
  readonly history: RunHistory;
  /** The hero's public character signal: ids only, so the narrator gets a voice and never a number. */
  readonly signal: {
    readonly id: string;
    readonly voice: string;
    readonly gift: string;
    readonly cost: string;
  } | null;
  /** Signal events of the day the run is at, by kind only: the engine chose their tone and effect. */
  readonly signalEvents: readonly { readonly kind: string; readonly companion?: string }[];
  readonly hiddenTraitCount: number;
  readonly revealedTraits: readonly Trait[];
  /** Where the case is set, in the language of the run, and what the weather there is like. */
  readonly setting: { readonly name: string; readonly climate: ClimateProfile } | null;
  /** What in the news the case grew from: the kind of trouble and the invented sentence, never a headline. */
  readonly inspiration: Inspiration | null;
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
  /**
   * The places the hero knows, as a graph: every place visited, and every place next to one of them, which
   * stays a name until the hero goes there. Nothing beyond what the hero has seen is in it.
   */
  readonly map: {
    /** The place the hero is at. */
    readonly current: string;
    readonly places: readonly {
      readonly id: string;
      readonly name: string;
      readonly visited: boolean;
      /** Why the way in is shut right now, as for an exit. */
      readonly blocked: 'locked' | 'closed' | null;
    }[];
    /** Each way between two known places once, with `from` before `to` in the order of `places`. */
    readonly links: readonly { readonly from: string; readonly to: string }[];
  };
  readonly suspects: readonly {
    readonly id: string;
    readonly name: string;
    readonly persona: string;
    /** Where the suspect can be found now; `null` when the case ties them to no place (ask anywhere). */
    readonly place: { readonly id: string; readonly name: string } | null;
    /** What the suspect has said at questioning, in the order they said it. */
    readonly statements: readonly {
      readonly day: number;
      readonly kind: (typeof STATEMENT_KINDS)[number];
      readonly text: string;
    }[];
  }[];
  readonly clues: readonly {
    readonly id: string;
    readonly locationId: string;
    readonly description: string;
    /** Read badly: the clue counts as found, but it has to be read again before it is used as proof. */
    readonly garbled: boolean;
  }[];
  /**
   * How many clues each conclusion still to be made takes, smallest first: a number for each, so the player
   * knows what size of link to try and how many are left. Never which clues, and never which conclusion is the
   * motive; a conclusion that has been drawn drops out.
   */
  readonly openLinks: readonly number[];
  /** Each conclusion with the clues it was drawn from, all of them found. */
  readonly insights: readonly {
    readonly id: string;
    readonly insight: string;
    readonly clueIds: readonly string[];
  }[];
}

/** The clue count of each conclusion not yet made, smallest first. */
export function openLinkSizes(run: DetectiveRunState): number[] {
  return run.case.deductions
    .filter(({ id }) => !run.insightIds.includes(id))
    .map(({ clueIds }) => new Set(clueIds).size)
    .toSorted((a, b) => a - b);
}

function requireLocation(detectiveCase: DetectiveCase, id: string): Location {
  const location = detectiveCase.locations.find((candidate) => candidate.id === id);
  if (!location) {
    throw new RangeError(`There is no location "${id}" in this run.`);
  }
  return location;
}

/** The events that have come with their days, and the working time left: today to midnight, then each full day. */
function viewChronicle(run: DetectiveRunState): DetectiveRunView['chronicle'] {
  const { worldEvents, days } = run.case.clock;
  const pool = run.case.randomEvents ?? [];
  const events = [
    ...worldEvents
      .filter(({ day }) => day <= run.clock.day)
      .map(({ day, description }) => ({ day, text: description })),
    ...run.drawnEvents.flatMap(({ eventId, day }) =>
      pool.filter(({ id }) => id === eventId).map(({ description }) => ({ day, text: description })),
    ),
  ].sort((a, b) => a.day - b.day);
  const activeMinutesLeft =
    MINUTES_PER_DAY -
    run.clock.minute +
    Math.max(0, days - run.clock.day) * (MINUTES_PER_DAY - DAY_START_MINUTE);
  return { activeMinutesLeft, events };
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

/** The known map: visited places and their neighbours, with the ways between them. See `DetectiveRunView.map`. */
function viewMap(run: DetectiveRunState): DetectiveRunView['map'] {
  const { locations } = run.case;
  const neighbors = buildNeighbors(locations);
  const known = new Set(run.visitedLocationIds);
  for (const id of run.visitedLocationIds) for (const next of neighbors.get(id) ?? []) known.add(next);
  const places = locations
    .filter(({ id }) => known.has(id))
    .map(({ id, name, access }) => {
      const visited = run.visitedLocationIds.includes(id);
      return { id, name, visited, blocked: blockedWay(run, id, access, visited) };
    });
  const linked = (a: string, b: string): boolean =>
    locations.some(
      ({ id, connections }) => (id === a && connections.includes(b)) || (id === b && connections.includes(a)),
    );
  // A way is known when one end of it has been visited, and is listed once, from the earlier place.
  const links = places.flatMap((place, index) =>
    places
      .slice(index + 1)
      .filter((other) => linked(place.id, other.id) && (place.visited || other.visited))
      .map((other) => ({ from: place.id, to: other.id })),
  );
  return { current: run.locationId, places, links };
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
    chronicle: viewChronicle(run),
    news: detectiveCase.clock.worldEvents
      .filter(({ day }) => day <= run.clock.day)
      .map(({ description }) => description)
      .concat(
        run.drawnEvents.flatMap(({ eventId }) =>
          pool.filter(({ id }) => id === eventId).map(({ description }) => description),
        ),
      ),
    hero: run.hero,
    history: run.history,
    signal: signalViewOf(run),
    signalEvents: run.signalEvents
      .filter(({ day }) => day === run.clock.day)
      .map(({ eventId, kind }) => companionOfEvent(run, eventId, kind)),
    hiddenTraitCount: run.traits.length - run.revealedTraitIds.length,
    revealedTraits: run.traits.filter(({ id }) => run.revealedTraitIds.includes(id)),
    setting: run.setting && { name: run.setting.name[run.locale], climate: run.setting.climate },
    inspiration: run.inspiration,
    location: { id: location.id, name: location.name, description: location.description, exits },
    map: viewMap(run),
    suspects: detectiveCase.suspects.map((suspect) => {
      const placeId = suspectPlace(run, suspect);
      const place = placeId === undefined ? undefined : requireLocation(detectiveCase, placeId);
      return {
        id: suspect.id,
        name: suspect.name,
        persona: suspect.persona,
        place: place === undefined ? null : { id: place.id, name: place.name },
        statements: run.statements
          .filter(({ suspectId }) => suspectId === suspect.id)
          .map(({ day, kind, text }) => ({ day, kind, text })),
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
    openLinks: openLinkSizes(run),
    insights: detectiveCase.deductions
      .filter(({ id }) => run.insightIds.includes(id))
      .map(({ id, insight, clueIds }) => ({
        id,
        insight,
        // Only clues the hero has found: a conclusion never points at something still hidden.
        clueIds: clueIds.filter((clueId) => run.foundClueIds.includes(clueId)),
      })),
  };
}

/** A signal event as the view tells it: its kind, and the first name of the person it comes from, if it comes from one. */
function companionOfEvent(
  run: DetectiveRunState,
  eventId: string,
  kind: string,
): { readonly kind: string; readonly companion?: string } {
  const role = findSignal(DETECTIVE.signals, run.hero.signalId)?.events.find(
    ({ id }) => id === eventId,
  )?.role;
  return role === undefined ? { kind } : { kind, companion: companionName(run.seed, run.locale, role) };
}
