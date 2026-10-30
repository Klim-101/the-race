// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

/** The complexity budget: a hero never tracks more than this many meters. */
export const MAX_METERS = 3;

/** When a meter drains or recovers; the engine decides when each of these happens. */
export const METER_RATE_UNITS = ['hour', 'night', 'day', 'failure'] as const;
export const MeterRateUnitSchema = z.enum(METER_RATE_UNITS);
export type MeterRateUnit = z.infer<typeof MeterRateUnitSchema>;

export const MeterRateSchema = z.object({
  amount: z.int().min(1),
  per: MeterRateUnitSchema,
});
export type MeterRate = z.infer<typeof MeterRateSchema>;

/** A bonus or penalty on checks of the listed skills, or on every check. */
export const ModifierEffectSchema = z.object({
  skills: z.union([z.literal('all'), z.array(z.string().min(1)).min(1)]),
  amount: z.int().refine((amount) => amount !== 0, { message: 'A modifier of zero does nothing.' }),
});
export type ModifierEffect = z.infer<typeof ModifierEffectSchema>;

/** The most a garbled reading can be garbled. */
export const MAX_GARBLE_LEVEL = 3;

export const MeterThresholdEffectsSchema = z
  .object({
    modifiers: z.array(ModifierEffectSchema).default([]),
    /** Percent chance that an action goes wrong on top of the dice. */
    mishapChance: z.int().min(1).max(100).optional(),
    garbleLevel: z.int().min(1).max(MAX_GARBLE_LEVEL).optional(),
  })
  .refine(
    (effects) =>
      effects.modifiers.length > 0 || effects.mishapChance !== undefined || effects.garbleLevel !== undefined,
    { message: 'A threshold with no effect does nothing.' },
  );
export type MeterThresholdEffects = z.output<typeof MeterThresholdEffectsSchema>;

/** A band of the meter: it applies while the value is below `below` or at least `atLeast`. */
export const MeterThresholdSchema = z
  .object({
    below: z.int().optional(),
    atLeast: z.int().optional(),
    effects: MeterThresholdEffectsSchema,
  })
  .refine((threshold) => (threshold.below === undefined) !== (threshold.atLeast === undefined), {
    message: 'A threshold has exactly one of `below` and `atLeast`.',
  });
export type MeterThreshold = z.output<typeof MeterThresholdSchema>;

export const MeterDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Meter ids are kebab-case.'),
    max: z.int().min(1),
    start: z.int().min(0),
    drain: MeterRateSchema.optional(),
    recovery: MeterRateSchema.optional(),
    thresholds: z.array(MeterThresholdSchema).default([]),
  })
  .refine((meter) => meter.start <= meter.max, { message: 'A meter cannot start above its maximum.' });
export type MeterDefinition = z.output<typeof MeterDefinitionSchema>;
export type MeterInput = z.input<typeof MeterDefinitionSchema>;

/** Validates a meter written as data and fills in its defaults. */
export function defineMeter(input: MeterInput): MeterDefinition {
  return MeterDefinitionSchema.parse(input);
}

export interface MeterEffects {
  readonly modifiers: readonly ModifierEffect[];
  readonly mishapChance: number;
  readonly garbleLevel: number;
}

/** What a meter at `value` does: modifiers add up, while a mishap chance and a garble level take the worst. */
export function meterEffects(definition: MeterDefinition, value: number): MeterEffects {
  const modifiers: ModifierEffect[] = [];
  let mishapChance = 0;
  let garbleLevel = 0;
  for (const { below, atLeast, effects } of definition.thresholds) {
    const applies = (below !== undefined && value < below) || (atLeast !== undefined && value >= atLeast);
    if (!applies) continue;
    modifiers.push(...effects.modifiers);
    mishapChance = Math.max(mishapChance, effects.mishapChance ?? 0);
    garbleLevel = Math.max(garbleLevel, effects.garbleLevel ?? 0);
  }
  return { modifiers, mishapChance, garbleLevel };
}

/** The meter after `count` units of its drain (or recovery) for `unit`, kept between zero and its maximum. */
export function applyMeterRate(
  definition: MeterDefinition,
  value: number,
  kind: 'drain' | 'recovery',
  unit: MeterRateUnit,
  count = 1,
): number {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`A meter moves by a whole, non-negative number of units, got ${String(count)}.`);
  }
  const rate = definition[kind];
  if (rate?.per !== unit) return value;
  const delta = (kind === 'drain' ? -rate.amount : rate.amount) * count;
  return Math.min(definition.max, Math.max(0, value + delta));
}
