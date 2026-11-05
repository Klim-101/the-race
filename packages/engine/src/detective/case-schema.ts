// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { LocaleSchema } from '../locale.js';
import { InformationSourceSchema, TraitTriggerSchema } from '../traits.js';
import { WeatherSchema } from '../world/climate.js';
import { DetectiveSkillSchema } from './archetype.js';
import { ConsumableIdSchema } from './consumables.js';
import { GearIdSchema } from './gear.js';

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

/** A place where one can sit down for a while: a teahouse, a cafe. The case marks them; the engine never guesses. */
export const VENUES = ['teahouse', 'cafe'] as const;
export const VenueSchema = z.enum(VENUES);
export type Venue = z.infer<typeof VenueSchema>;

/** Whether a place is inside a building or out of doors: the weather and the road only touch the second. */
export const EXPOSURES = ['indoor', 'outdoor'] as const;
export const ExposureSchema = z.enum(EXPOSURES);
export type Exposure = z.infer<typeof ExposureSchema>;

/**
 * What stands between the hero and a part of a place; a tool of the kit removes one kind (the catalogue is
 * kept as data elsewhere, so a kind is added here and in the data and nowhere else).
 * - `locked`: a lock or a bolt; `dark`: no light to see by; `soft`: upholstery, an envelope, a seam;
 * - `trace`: a fine mark on a surface or a clue; `sealed`: a sealed or glued thing; `digital`: a device.
 */
export const OBSTACLE_KINDS = ['locked', 'dark', 'soft', 'trace', 'sealed', 'digital'] as const;
export const ObstacleKindSchema = z.enum(OBSTACLE_KINDS);
export type ObstacleKind = z.infer<typeof ObstacleKindSchema>;

/**
 * The way to a clue that needs no tool, so a hero with any kit can still have it: ask a person, or follow a
 * lead that gives the clue another way. The leads themselves are kept for the rules of leads; until then a
 * lead is only a name, and only a person can be checked.
 */
export const PartFallbackSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ask'), suspectId: EntityIdSchema }),
  z.object({ kind: z.literal('lead'), leadId: EntityIdSchema }),
]);
export type PartFallback = z.infer<typeof PartFallbackSchema>;

/** A place is searched piece by piece: a desk, a cabinet, a bin, a safe, the floor. */
export const PlacePartSchema = z.object({
  id: EntityIdSchema,
  name: NarrativeTextSchema,
  /** `null` for a part that lies open. */
  obstacle: ObstacleKindSchema.nullable(),
  /** The clue (or the red herring) the part holds; `null` for a part with nothing in it. */
  holds: EntityIdSchema.nullable(),
  /** Whether a glance round the room shows it. */
  inQuickLook: z.boolean(),
  /** The lead that must be earned before the part is shown, if any. */
  requiresLead: EntityIdSchema.nullable(),
  /** What a hero without the tool does instead; a part with an obstacle and a clue in it must have one. */
  fallback: PartFallbackSchema.nullable(),
});
export type PlacePart = z.infer<typeof PlacePartSchema>;

/**
 * What earns a lead, all of it things the hero does: finding a clue, a talk that goes well with a person, a lie
 * that falls, a conclusion drawn, a rumour from the locals, a clue studied with a tool.
 */
export const LeadTriggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('clue'), clueId: EntityIdSchema }),
  z.object({ kind: z.literal('talk'), suspectId: EntityIdSchema }),
  z.object({ kind: z.literal('lie'), lieId: EntityIdSchema }),
  z.object({ kind: z.literal('deduction'), deductionId: EntityIdSchema }),
  /** A rumour: a contacts roll in that place, asking the locals. It is the one way to open a place with no clue in hand. */
  z.object({ kind: z.literal('locals'), locationId: EntityIdSchema }),
  /**
   * A clue the hero holds, studied with a tool: handwriting under a glass, a stain under a lamp. With no `tool` any
   * tool will do, the phone's camera included, so every hero can earn it; with one, only that tool (and the case is
   * not asked to be solvable by it, since the generator never sees the kit).
   */
  z.object({ kind: z.literal('study'), clueId: EntityIdSchema, tool: GearIdSchema.optional() }),
]);
export type LeadTrigger = z.infer<typeof LeadTriggerSchema>;

/** The hours of a day in which a lead can be followed ("at night"); minutes of the day, and it may wrap midnight. */
export const LeadWindowSchema = z
  .object({ fromMinute: z.int().min(0).max(1439), untilMinute: z.int().min(0).max(1439) })
  .refine(({ fromMinute, untilMinute }) => fromMinute !== untilMinute, 'A window of no hours, or of all.');
export type LeadWindow = z.infer<typeof LeadWindowSchema>;

/**
 * A pointer the hero earns. What it opens is whatever names it in `requiresLead`: a place (a soft lead, which
 * puts the place on the map) or a part (a hard lead, which shows the part with its obstacle). It is told to
 * the hero in the hero's own words and never says what is true; a false lead leads to an empty part or a red
 * herring, and costs the time of following it.
 */
export const LeadSchema = z.object({
  id: EntityIdSchema,
  /** One line, from the hero's own clue or talk: why the hero looks there. */
  reason: NarrativeTextSchema,
  earnedBy: LeadTriggerSchema,
  window: LeadWindowSchema.optional(),
  // The generator's instructions call it optional, so a lead that leaves it out is a true one.
  isFalse: z.boolean().default(false),
});
export type Lead = z.infer<typeof LeadSchema>;

/**
 * Something a place keeps for the hero, a tool or a supply: `found` once the place has been searched (a crowbar on a
 * farm), `sold` there for the asking (a sedative in a shop). Nothing in a case is ever needed from it: the validator
 * judges the hero's own kit alone, so stock is a way to carry on, never a way to solve.
 */
export const STOCK_HOWS = ['found', 'sold'] as const;
export const StockHowSchema = z.enum(STOCK_HOWS);
export type StockHow = z.infer<typeof StockHowSchema>;
export const StockEntrySchema = z.discriminatedUnion('kind', [
  z.object({ id: EntityIdSchema, kind: z.literal('tool'), itemId: GearIdSchema, how: StockHowSchema }),
  z.object({
    id: EntityIdSchema,
    kind: z.literal('supply'),
    itemId: ConsumableIdSchema,
    how: StockHowSchema,
  }),
]);
export type StockEntry = z.infer<typeof StockEntrySchema>;

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
  /** Set for a place where the hero can sit down and win back a little of their nerves. */
  venue: VenueSchema.optional(),
  /**
   * The lead that must be earned before the hero knows the place exists: until then it is not on the map or among
   * the exits, and cannot be walked to. A place without it is known as soon as it is next to one the hero has seen.
   */
  requiresLead: EntityIdSchema.optional(),
  /**
   * The things to look at in the place. Optional rather than defaulted, so that the cases of before the parts
   * keep their seal; a place without parts is searched as a whole, as it always was.
   */
  parts: z.array(PlacePartSchema).optional(),
  /** What the place keeps for the hero. Optional, so that the cases of before it keep their seal. */
  stock: z.array(StockEntrySchema).optional(),
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
  /**
   * Set on a clue that a witness gives: the witness who tells it and the suspect they saw. It is made from the
   * timeline when the case is accepted (see `deriveSightingClues`), lies in no part and is found by asking the witness
   * and in no other way.
   */
  sightingOf: z.object({ witnessId: EntityIdSchema, suspectId: EntityIdSchema }).optional(),
  /**
   * The people the clue bears on directly, whether or not it points at them: a motive, an alibi, a thing that was
   * theirs. A suspect shown a clue about them reacts to it, even when it breaks none of their lies. Optional for
   * the cases of before it, which keep their seal; a clue that points at a suspect is about them as well.
   */
  about: z.array(EntityIdSchema).optional(),
  isRedHerring: z.boolean(),
});
export type Clue = z.infer<typeof ClueSchema>;

export const LieSchema = z.object({
  id: EntityIdSchema,
  statement: NarrativeTextSchema,
  brokenBy: z.array(EntityIdSchema).min(1),
  /** Conclusions that break it too, put to the suspect as a question; a lie may be broken by these alone. */
  brokenByInsights: z.array(EntityIdSchema).optional(),
  /**
   * What the suspect says once the lie has fallen: where they really were, what they really did, as far as they
   * would admit it. Optional, so that the cases of before it keep their seal; without it the statement is all there is.
   */
  admission: NarrativeTextSchema.optional(),
  /**
   * The lie of the same suspect that must fall before this one is told: an admission that is itself a lie, so a
   * talk is a chain of one caught after another. Until then the lie does not stand and cannot be broken.
   */
  after: EntityIdSchema.optional(),
  /** A clue the suspect hands over, as testimony, when this lie falls. */
  gives: EntityIdSchema.optional(),
  /**
   * Set on the lie the suspect's alibi rests on: when it falls the alibi no longer stands, and the notebook shows it
   * refuted beside what the suspect now says. At most one lie of a suspect carries it. Optional, so that the cases of
   * before it keep their seal.
   */
  replacesAlibi: z.boolean().optional(),
});
export type Lie = z.infer<typeof LieSchema>;

/**
 * What a suspect says when shown a clue that bears on them, in their own voice: a deflection, a half-truth, an
 * indignant denial. It names no hidden trait and tells nothing the suspect would not say aloud; it is a line to play,
 * not a fact.
 */
export const ReactionSchema = z.object({
  clueId: EntityIdSchema,
  text: NarrativeTextSchema,
});
export type Reaction = z.infer<typeof ReactionSchema>;

export const SuspectSchema = z.object({
  id: EntityIdSchema,
  /** Where the suspect can be found. Public, unlike the timeline; without it they can be questioned anywhere. */
  locationId: EntityIdSchema.optional(),
  name: NarrativeTextSchema,
  persona: NarrativeTextSchema,
  secret: NarrativeTextSchema,
  alibi: NarrativeTextSchema,
  lies: z.array(LieSchema),
  /** Optional, so that the cases of before it keep their seal; a clue with no reaction keeps the generic line. */
  reactions: z.array(ReactionSchema).optional(),
  /**
   * True things the suspect says at the first talk, beside the statements of their lies: a claim the hero hears is
   * either one of these or a lie's `statement`, and nothing tells which until a lie falls. Optional for the same reason.
   */
  claims: z.array(NarrativeTextSchema).optional(),
});
export type Suspect = z.infer<typeof SuspectSchema>;

/**
 * A person of a place who is not a suspect: a waiter, a guard, a passer-by. They stood in the place during
 * `hours` (minutes of the day, which may wrap midnight) on the evening of the crime and again whenever the hero meets
 * them, so what they saw is whatever the sealed timeline puts at their place in those hours. The generator writes no
 * testimony; the engine derives it, so it cannot say more than a passer-by could have seen.
 */
export const WitnessSchema = z.object({
  id: EntityIdSchema,
  locationId: EntityIdSchema,
  name: NarrativeTextSchema,
  persona: NarrativeTextSchema,
  hours: LeadWindowSchema,
});
export type Witness = z.infer<typeof WitnessSchema>;

export const DeductionSchema = z.object({
  id: EntityIdSchema,
  clueIds: z.array(EntityIdSchema).min(2),
  insight: NarrativeTextSchema,
  /**
   * The suspect this conclusion clears: once the hero has drawn it, that person could not have done it. Optional, so
   * that the cases of before it keep their seal. It is earned by the hero's reasoning and never given.
   */
  clears: EntityIdSchema.optional(),
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
  /**
   * The weather of that day, when the event is about it: a snowfall or an ice storm is the weather the hero walks in,
   * not only a line of news. Absent for an event that says nothing of the weather.
   */
  weather: WeatherSchema.optional(),
});
export type WorldEvent = z.infer<typeof WorldEventSchema>;

/** Conditions a random event may put on the hero; none of them implies violence, so `injured` is left out. */
export const RANDOM_EVENT_CONDITIONS = ['shaken', 'exhausted'] as const;
export const MAX_RANDOM_EVENT_MINUTES = 120;
export const MAX_RANDOM_EVENT_NERVES = 2;
export const MAX_RANDOM_EVENTS = 40;
/** What a generated case must bring at least, so that the days and the nights have something to draw from. */
export const MIN_RANDOM_EVENTS = 4;
/** A run this short (in days) is promised an event every day; a longer one is promised a share of its days. */
export const EVERY_DAY_EVENT_MAX_DAYS = 3;
/** The fewest events a run longer than `EVERY_DAY_EVENT_MAX_DAYS` is promised. */
export const MIN_PROMISED_EVENTS = 3;

/**
 * How many events a run of this many days is promised: one a day while it is short, then a third of its days
 * and never fewer than `MIN_PROMISED_EVENTS`, so that ten days of events do not crowd out the investigation.
 */
export function promisedEventsOf(days: number): number {
  return days <= EVERY_DAY_EVENT_MAX_DAYS ? days : Math.max(MIN_PROMISED_EVENTS, Math.ceil(days / 3));
}

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
  /** Optional for the same reason: the cases of before the leads have none, and keep their seal. */
  leads: z.array(LeadSchema).optional(),
  /** Optional for the same reason: the cases of before the witnesses have none, and keep their seal. */
  witnesses: z.array(WitnessSchema).optional(),
});
export type DetectiveCase = z.infer<typeof DetectiveCaseSchema>;
