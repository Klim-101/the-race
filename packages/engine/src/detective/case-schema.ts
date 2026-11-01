// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { LocaleSchema } from '../locale.js';
import { InformationSourceSchema, TraitTriggerSchema } from '../traits.js';
import { DetectiveSkillSchema } from './archetype.js';

export const CASE_SCHEMA_VERSION = 1;

export const CRIME_TYPES = [
  'financial',
  'cyber',
  'political-leak',
  'missing-person',
  'forgery',
  'corporate-espionage',
  'curious-theft',
] as const;
export const CrimeTypeSchema = z.enum(CRIME_TYPES);
export type CrimeType = z.infer<typeof CrimeTypeSchema>;

export const TONES = ['serious', 'wry', 'absurd'] as const;
export const ToneSchema = z.enum(TONES);
export type Tone = z.infer<typeof ToneSchema>;

/** Ids are shared by every entity of a case, so one id names exactly one thing. */
export const EntityIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, 'Use lowercase kebab-case ids.');

const NarrativeTextSchema = z.string().trim().min(1).max(2000);

export const SkillCheckSchema = z.object({
  skill: DetectiveSkillSchema,
  difficulty: z.int().min(1).max(30),
});
export type SkillCheck = z.infer<typeof SkillCheckSchema>;

export const LocationAccessSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('open') }),
  z.object({ kind: z.literal('skill'), check: SkillCheckSchema }),
  z.object({ kind: z.literal('clue'), clueId: EntityIdSchema }),
]);
export type LocationAccess = z.infer<typeof LocationAccessSchema>;

/** How safe a night in a place is; it decides the chance of an incident (see `night.ts`). */
export const LODGING_SAFETIES = ['safe', 'ordinary', 'risky'] as const;
export const LodgingSafetySchema = z.enum(LODGING_SAFETIES);
export type LodgingSafety = z.infer<typeof LodgingSafetySchema>;

/** Whether a place is inside a building or out of doors: the weather and the road only touch the second. */
export const EXPOSURES = ['indoor', 'outdoor'] as const;
export const ExposureSchema = z.enum(EXPOSURES);
export type Exposure = z.infer<typeof ExposureSchema>;

/** Connections are two-way: listing a connection on either location links both. */
export const LocationSchema = z.object({
  id: EntityIdSchema,
  name: NarrativeTextSchema,
  description: NarrativeTextSchema,
  connections: z.array(EntityIdSchema),
  access: LocationAccessSchema,
  /** Indoors or out of doors; a place that does not say (every case before it was asked for) is out of doors. */
  exposure: ExposureSchema.default('outdoor'),
  /** What the scene is like (a cramped cellar, a crowd); the hero's traits react to it. */
  situations: z.array(TraitTriggerSchema).default([]),
  /** How safe the hero's night is if they sleep here; optional, and a place without it is an ordinary one. */
  lodging: LodgingSafetySchema.optional(),
});
export type Location = z.infer<typeof LocationSchema>;

export const ClueSchema = z.object({
  id: EntityIdSchema,
  locationId: EntityIdSchema,
  description: NarrativeTextSchema,
  /** `null` means the clue is found by simply looking. */
  discovery: SkillCheckSchema.nullable(),
  /** Extra circumstances of this clue, on top of those of its location. */
  situations: z.array(TraitTriggerSchema).default([]),
  /** Where the information comes from, if it comes from a source that can be closed to the hero. */
  source: InformationSourceSchema.nullable().default(null),
  pointsTo: z.array(EntityIdSchema),
  isRedHerring: z.boolean(),
});
export type Clue = z.infer<typeof ClueSchema>;

export const LieSchema = z.object({
  id: EntityIdSchema,
  statement: NarrativeTextSchema,
  brokenBy: z.array(EntityIdSchema).min(1),
});
export type Lie = z.infer<typeof LieSchema>;

export const SuspectSchema = z.object({
  id: EntityIdSchema,
  /** Where the suspect can be found. Public, unlike the timeline; without it they can be questioned anywhere. */
  locationId: EntityIdSchema.optional(),
  name: NarrativeTextSchema,
  persona: NarrativeTextSchema,
  secret: NarrativeTextSchema,
  alibi: NarrativeTextSchema,
  lies: z.array(LieSchema),
});
export type Suspect = z.infer<typeof SuspectSchema>;

export const DeductionSchema = z.object({
  id: EntityIdSchema,
  clueIds: z.array(EntityIdSchema).min(2),
  insight: NarrativeTextSchema,
});
export type Deduction = z.infer<typeof DeductionSchema>;

export const TimelineEntrySchema = z.object({
  /** Minutes since the start of the crime day. */
  atMinute: z.int().min(0),
  actorId: EntityIdSchema,
  locationId: EntityIdSchema,
  action: NarrativeTextSchema,
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

/** The secret the narrator never sees. */
export const TruthSchema = z.object({
  culpritId: EntityIdSchema,
  motive: NarrativeTextSchema,
  method: NarrativeTextSchema,
  crimeLocationId: EntityIdSchema,
  crimeAtMinute: z.int().min(0),
  timeline: z.array(TimelineEntrySchema).min(1),
});
export type Truth = z.infer<typeof TruthSchema>;

export const SolutionSchema = z.object({
  motiveDeductionId: EntityIdSchema,
  /** Each chain is a set of clues that proves the culprit on its own. */
  evidenceChains: z.array(z.array(EntityIdSchema).min(1)),
});
export type Solution = z.infer<typeof SolutionSchema>;

/**
 * What a scheduled event does to the run, beyond being news. Both effects are the engine's to apply:
 * - `culprit-flees`: the culprit gets away on that day, and a case still unsolved is lost;
 * - `location-closes`: the place can no longer be entered from that day (clues already found stay found).
 */
export const WorldEventEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('culprit-flees') }),
  z.object({ kind: z.literal('location-closes'), locationId: EntityIdSchema }),
]);
export type WorldEventEffect = z.infer<typeof WorldEventEffectSchema>;

export const WorldEventSchema = z.object({
  /** The day on which the event fires, as that day begins. */
  day: z.int().min(1),
  /** What the player is told; it must not give away the truth. */
  description: NarrativeTextSchema,
  /** Absent for an event that is only news. */
  effect: WorldEventEffectSchema.optional(),
});
export type WorldEvent = z.infer<typeof WorldEventSchema>;

/** Conditions a random event may put on the hero; none of them implies violence, so `injured` is left out. */
export const RANDOM_EVENT_CONDITIONS = ['shaken', 'exhausted'] as const;
export const MAX_RANDOM_EVENT_MINUTES = 120;
export const MAX_RANDOM_EVENT_NERVES = 2;
export const MAX_RANDOM_EVENTS = 40;
/** What a generated case must bring, so that the days and the nights have something to draw from. */
export const MIN_RANDOM_EVENTS = 3;

/**
 * What a random event does. The vocabulary is closed on purpose: an event can move the world or the hero's
 * day, and it can never touch the truth, the solution or the content of a clue, nor hurt anyone.
 * - `flavor`: only news;
 * - `location-closes`: the place cannot be entered while the event lasts;
 * - `suspect-moves`: the suspect can be found at another place while the event lasts;
 * - `source-closes`: a source of information is shut to the hero while the event lasts;
 * - `time-lost`: the hero loses minutes of the day;
 * - `nerves-cost`: the hero loses points of nerves, never the last one;
 * - `condition`: a timed condition falls on the hero.
 */
export const RandomEventEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('flavor') }),
  z.object({ kind: z.literal('location-closes'), locationId: EntityIdSchema }),
  z.object({ kind: z.literal('suspect-moves'), suspectId: EntityIdSchema, locationId: EntityIdSchema }),
  z.object({ kind: z.literal('source-closes'), source: InformationSourceSchema }),
  z.object({ kind: z.literal('time-lost'), minutes: z.int().min(15).max(MAX_RANDOM_EVENT_MINUTES) }),
  z.object({ kind: z.literal('nerves-cost'), points: z.int().min(1).max(MAX_RANDOM_EVENT_NERVES) }),
  z.object({ kind: z.literal('condition'), condition: z.enum(RANDOM_EVENT_CONDITIONS) }),
]);
export type RandomEventEffect = z.infer<typeof RandomEventEffectSchema>;

/**
 * How long an effect lasts. `until-day` ends it as that day begins; `permanent` never ends. The effects
 * that happen once (`flavor`, `time-lost`, `nerves-cost`, `condition`) are `instant`, and only they are.
 */
export const RandomEventDurationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('instant') }),
  z.object({ kind: z.literal('until-day'), day: z.int().min(2) }),
  z.object({ kind: z.literal('permanent') }),
]);
export type RandomEventDuration = z.infer<typeof RandomEventDurationSchema>;

/** Whether an effect changes the world for a while, rather than happening once. */
export function isLastingEffect(effect: RandomEventEffect): boolean {
  return (
    effect.kind === 'location-closes' || effect.kind === 'suspect-moves' || effect.kind === 'source-closes'
  );
}

export const RandomEventSchema = z
  .object({
    id: EntityIdSchema,
    /** What the player is told. No violence and no death; the validator checks it. */
    description: NarrativeTextSchema,
    /** Its share among the events that fit the moment. */
    weight: z.int().min(1).max(10),
    /** Tones it fits; empty means every tone. */
    tones: z.array(ToneSchema).default([]),
    /** The first day it can happen, and the last (`null` for no last day). */
    fromDay: z.int().min(1).default(1),
    untilDay: z.int().min(1).nullable().default(null),
    /** Hero traits that make it likelier, by trigger. The engine reads the traits; the generator never sees them. */
    traitTriggers: z.array(TraitTriggerSchema).default([]),
    effect: RandomEventEffectSchema,
    duration: RandomEventDurationSchema,
  })
  .superRefine((event, context) => {
    if (isLastingEffect(event.effect) === (event.duration.kind === 'instant')) {
      context.addIssue({
        code: 'custom',
        path: ['duration'],
        message: isLastingEffect(event.effect)
          ? 'An effect that changes the world lasts until a day or for good.'
          : 'An effect that happens once is instant.',
      });
    }
    if (event.untilDay !== null && event.untilDay < event.fromDay) {
      context.addIssue({
        code: 'custom',
        path: ['untilDay'],
        message: 'The last day comes before the first.',
      });
    }
  });
export type RandomEvent = z.infer<typeof RandomEventSchema>;

export const ClockSchema = z.object({
  days: z.int().min(1).max(14),
  worldEvents: z.array(WorldEventSchema),
});
export type Clock = z.infer<typeof ClockSchema>;

export const DetectiveCaseSchema = z.object({
  schemaVersion: z.literal(CASE_SCHEMA_VERSION),
  locale: LocaleSchema,
  crimeType: CrimeTypeSchema,
  tone: ToneSchema,
  title: NarrativeTextSchema,
  premise: NarrativeTextSchema,
  startLocationId: EntityIdSchema,
  locations: z.array(LocationSchema).min(1),
  clues: z.array(ClueSchema).min(1),
  suspects: z.array(SuspectSchema).min(2),
  deductions: z.array(DeductionSchema),
  truth: TruthSchema,
  solution: SolutionSchema,
  clock: ClockSchema,
  /**
   * The pool the night draws from. Optional rather than defaulted: a default would write `[]` into every
   * case and change the seal of the cases accepted before the pool existed.
   */
  randomEvents: z.array(RandomEventSchema).max(MAX_RANDOM_EVENTS).optional(),
});
export type DetectiveCase = z.infer<typeof DetectiveCaseSchema>;
