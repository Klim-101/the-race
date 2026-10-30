// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Rng } from '../dice.js';
import type { Locale } from '../locale.js';
import {
  MAX_REPUTATION,
  RULESET_VERSION,
  RUN_SCHEMA_VERSION,
  advanceClock,
  runBaseShape,
  type RunClock,
  type RunStatus,
} from '../run.js';
import { TraitSchema, type Trait } from '../traits.js';
import { DETECTIVE, DetectiveHeroSchema, type DetectiveHero } from './archetype.js';
import { DetectiveCaseSchema, EntityIdSchema, type DetectiveCase, type Location } from './case-schema.js';
import { buildNeighbors } from './obtainability.js';
import { CASE_SEAL_PATTERN, isCaseSealIntact, sealCase } from './seal.js';

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
  })
  .superRefine((run, context) => {
    if (!isCaseSealIntact(run)) {
      context.addIssue({
        code: 'custom',
        path: ['caseSeal'],
        message: 'The case does not match its seal: it was changed after it was accepted.',
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
    clock: { day: 1, minute: 0 },
    reputation: MAX_REPUTATION,
    status: 'active',
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
  return { ...run, clock: advanceClock(run.clock, minutes) };
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

export function endRun(run: DetectiveRunState, status: Exclude<RunStatus, 'active'>): DetectiveRunState {
  assertActive(run);
  return { ...run, status };
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
  readonly hero: DetectiveHero;
  readonly hiddenTraitCount: number;
  readonly revealedTraits: readonly Trait[];
  readonly location: {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly exits: readonly { readonly id: string; readonly name: string; readonly visited: boolean }[];
  };
  readonly suspects: readonly { readonly id: string; readonly name: string; readonly persona: string }[];
  readonly clues: readonly {
    readonly id: string;
    readonly locationId: string;
    readonly description: string;
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

export function viewRun(run: DetectiveRunState): DetectiveRunView {
  const { case: detectiveCase } = run;
  const location = requireLocation(detectiveCase, run.locationId);
  const exits = [...(buildNeighbors(detectiveCase.locations).get(location.id) ?? [])].map((id) => ({
    id,
    name: requireLocation(detectiveCase, id).name,
    visited: run.visitedLocationIds.includes(id),
  }));
  return {
    title: detectiveCase.title,
    premise: detectiveCase.premise,
    locale: run.locale,
    turn: run.turn,
    status: run.status,
    clock: { ...run.clock, totalDays: detectiveCase.clock.days },
    reputation: run.reputation,
    hero: run.hero,
    hiddenTraitCount: run.traits.length - run.revealedTraitIds.length,
    revealedTraits: run.traits.filter(({ id }) => run.revealedTraitIds.includes(id)),
    location: { id: location.id, name: location.name, description: location.description, exits },
    suspects: detectiveCase.suspects.map(({ id, name, persona }) => ({ id, name, persona })),
    clues: detectiveCase.clues
      .filter(({ id }) => run.foundClueIds.includes(id))
      .map(({ id, locationId, description }) => ({ id, locationId, description })),
    insights: detectiveCase.deductions
      .filter(({ id }) => run.insightIds.includes(id))
      .map(({ id, insight }) => ({ id, insight })),
  };
}
