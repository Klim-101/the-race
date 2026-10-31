// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Rng } from './dice.js';
import { MeterRateUnitSchema, ModifierEffectSchema, type MeterDefinition } from './meters.js';
import { TraitTriggerSchema, type TraitTrigger } from './traits.js';

// A character signal is the one visible trait of mood or circumstance that the player picks for the hero
// ("in love", "burnt out"). It is DATA, so a new signal needs no new code: modifiers under triggers, a rule
// on a meter, events the engine draws on the run's dice and a voice hint for the narrator. Every signal has
// a gift and a cost. The narrator writes the text of a signal event, but the tone and the effect are drawn
// by the engine, and the signal itself is public: the player and the narrator both know it.

/** A hero has at most one signal; it counts toward the complexity budget beside the meters. */
export const MAX_SIGNALS_PER_HERO = 1;
/** The most events one signal may schedule. */
export const MAX_SIGNAL_EVENTS = 2;

const KebabIdSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Ids are kebab-case.');

/** The tone an event can be drawn in; the engine chooses it, and the narrator is told only the kind. */
export const SIGNAL_TONES = ['encouraging', 'demoralising', 'neutral'] as const;
export const SignalToneSchema = z.enum(SIGNAL_TONES);
export type SignalTone = z.infer<typeof SignalToneSchema>;

export const SignalEffectSchema = z.discriminatedUnion('kind', [
  /** A meter moves by `delta`; a loss never takes the last point, and a gain stops at the meter's cap. */
  z.object({
    kind: z.literal('meter'),
    meter: KebabIdSchema,
    delta: z.int().refine((delta) => delta !== 0, { message: 'A change of zero does nothing.' }),
  }),
  /** A timed condition of the archetype starts on the hero. */
  z.object({ kind: z.literal('condition'), condition: KebabIdSchema }),
]);
export type SignalEffect = z.infer<typeof SignalEffectSchema>;

/** A bonus or penalty on checks; with a trigger it applies only in that situation, without one always. */
export const SignalModifierSchema = z.object({
  trigger: TraitTriggerSchema.optional(),
  ...ModifierEffectSchema.shape,
});
export type SignalModifier = z.infer<typeof SignalModifierSchema>;

/** What a signal does to one meter: a cap on it, a drift at every night, or a kind of loss it ignores. */
export const SignalMeterRuleSchema = z
  .object({
    meter: KebabIdSchema,
    /** The meter never rises above this, whatever restores it. */
    cap: z.int().min(1).optional(),
    /** Added to the meter at every night, once the night has done its own work. */
    drift: z
      .int()
      .refine((drift) => drift !== 0, { message: 'A drift of zero does nothing.' })
      .optional(),
    /** Losses of the meter for these reasons do not happen. */
    ignores: z.array(MeterRateUnitSchema).min(1).optional(),
  })
  .refine(({ cap, drift, ignores }) => cap !== undefined || drift !== undefined || ignores !== undefined, {
    message: 'A rule on a meter with no cap, drift or ignored loss does nothing.',
  });
export type SignalMeterRule = z.infer<typeof SignalMeterRuleSchema>;

/** One way an event can turn out. `kind` is what the narrator is told: it names the scene, never the effect. */
export const SignalToneVariantSchema = z.object({
  tone: SignalToneSchema,
  kind: KebabIdSchema,
  weight: z.int().min(1),
  effects: z.array(SignalEffectSchema).min(1),
});
export type SignalToneVariant = z.infer<typeof SignalToneVariantSchema>;

/** An event the engine may draw at a night: it happens with `chance`, then the dice pick a variant by weight. */
export const SignalEventSchema = z
  .object({
    id: KebabIdSchema,
    /** Percent chance that the event comes on one night, from `fromDay` on. */
    chance: z.int().min(1).max(100),
    fromDay: z.int().min(1).default(1),
    /** Who it comes from, as a role and never a name; the name is the case's to give. */
    role: KebabIdSchema.optional(),
    variants: z.array(SignalToneVariantSchema).min(1),
  })
  .refine(({ variants }) => new Set(variants.map(({ kind }) => kind)).size === variants.length, {
    message: 'The variants of an event have distinct kinds.',
  });
/** A signal event that has come, for the log and for a replay: what the engine drew, never what it did. */
export const DrawnSignalEventSchema = z.object({
  eventId: KebabIdSchema,
  kind: KebabIdSchema,
  tone: SignalToneSchema,
  day: z.int().min(1),
});
export type DrawnSignalEvent = z.infer<typeof DrawnSignalEventSchema>;

export type SignalEvent = z.output<typeof SignalEventSchema>;

export const SignalSchema = z
  .object({
    id: KebabIdSchema,
    /** The id of a voice hint for the narrator; the wording lives in the narrator's files. */
    voice: KebabIdSchema,
    /** Ids into the locale files: what the signal gives the hero and what it takes. */
    gift: KebabIdSchema,
    cost: KebabIdSchema,
    modifiers: z.array(SignalModifierSchema).default([]),
    meters: z.array(SignalMeterRuleSchema).default([]),
    events: z.array(SignalEventSchema).max(MAX_SIGNAL_EVENTS).default([]),
  })
  .refine(({ modifiers, meters, events }) => modifiers.length + meters.length + events.length > 0, {
    message: 'A signal with no modifier, meter rule or event does nothing.',
  });
export type Signal = z.output<typeof SignalSchema>;
export type SignalInput = z.input<typeof SignalSchema>;

/** Validates a signal written as data and fills in its defaults. */
export function defineSignal(input: SignalInput): Signal {
  return SignalSchema.parse(input);
}

/** The signal of that id in a list, or `undefined` for none. */
export function findSignal(signals: readonly Signal[], id: string | undefined): Signal | undefined {
  return id === undefined ? undefined : signals.find((signal) => signal.id === id);
}

/** The signal's modifier to a check of `skill` in the current situations. */
export function signalModifier(
  signal: Signal | undefined,
  situations: readonly TraitTrigger[],
  skill: string,
): number {
  let total = 0;
  for (const { trigger, skills, amount } of signal?.modifiers ?? []) {
    if (trigger !== undefined && !situations.includes(trigger)) continue;
    if (skills === 'all' || skills.includes(skill)) total += amount;
  }
  return total;
}

/**
 * What the player may be told that the signal did in a turn: a check it moved (a gift when the amount is
 * above zero, a cost when it is below), or a loss it absorbed. Public data of the hero: it names the signal's
 * own effect and no hidden trait.
 */
export type SignalFelt =
  | { readonly kind: 'modifier'; readonly skill: string; readonly amount: number }
  | { readonly kind: 'shield'; readonly meter: string };

/** What the signal added to a check of `skill` in these situations; nothing when its modifier is zero. */
export function feltModifier(
  signal: Signal | undefined,
  situations: readonly TraitTrigger[],
  skill: string,
): SignalFelt[] {
  const amount = signalModifier(signal, situations, skill);
  return amount === 0 ? [] : [{ kind: 'modifier', skill, amount }];
}

/** The loss of the meter, for the reason, that the signal absorbed; nothing when it absorbs none. */
export function feltShield(signal: Signal | undefined, meter: string, reason: string): SignalFelt[] {
  return signalIgnores(signal, meter, reason) ? [{ kind: 'shield', meter }] : [];
}

/** The same effect once, in the order it was first felt. */
export function distinctFelt(felt: readonly SignalFelt[]): SignalFelt[] {
  return felt.filter(
    (item, at) => felt.findIndex((other) => JSON.stringify(other) === JSON.stringify(item)) === at,
  );
}

/** Whether the signal makes the hero ignore losses of the meter for the reason. */
export function signalIgnores(signal: Signal | undefined, meter: string, reason: string): boolean {
  return (signal?.meters ?? []).some(
    (rule) => rule.meter === meter && (rule.ignores ?? []).some((ignored) => ignored === reason),
  );
}

/** The most the signal lets the meter reach; the meter's own maximum if it says nothing. */
export function signalCap(signal: Signal | undefined, meter: MeterDefinition): number {
  const caps = (signal?.meters ?? []).flatMap((rule) =>
    rule.meter === meter.id && rule.cap !== undefined ? [rule.cap] : [],
  );
  return Math.min(meter.max, ...caps);
}

/** A variant drawn by weight: one die, and the same die always draws the same variant. */
export function drawVariant(event: SignalEvent, rng: Rng): SignalToneVariant {
  const [first, ...others] = event.variants;
  /* v8 ignore next 3 -- unreachable: the schema demands at least one variant */
  if (first === undefined) throw new RangeError(`The event "${event.id}" has no variants.`);
  let rolled = rng.roll(event.variants.reduce((sum, { weight }) => sum + weight, 0));
  let chosen = first;
  for (const variant of [first, ...others]) {
    chosen = variant;
    rolled -= variant.weight;
    if (rolled <= 0) break;
  }
  return chosen;
}
