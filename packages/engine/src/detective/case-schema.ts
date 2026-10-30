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

/** Connections are two-way: listing a connection on either location links both. */
export const LocationSchema = z.object({
  id: EntityIdSchema,
  name: NarrativeTextSchema,
  description: NarrativeTextSchema,
  connections: z.array(EntityIdSchema),
  access: LocationAccessSchema,
  /** What the scene is like (a cramped cellar, a crowd); the hero's traits react to it. */
  situations: z.array(TraitTriggerSchema).default([]),
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

export const WorldEventSchema = z.object({
  day: z.int().min(1),
  description: NarrativeTextSchema,
});
export type WorldEvent = z.infer<typeof WorldEventSchema>;

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
});
export type DetectiveCase = z.infer<typeof DetectiveCaseSchema>;
