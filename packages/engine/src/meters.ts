// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { EndReasonSchema, type EndReason } from './run.js';

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

/** What a meter in a band does to the run when it ends it: the reason shown on the final screen. */
export const EndsRunEffectSchema = z.object({ reason: EndReasonSchema });
export type EndsRunEffect = z.infer<typeof EndsRunEffectSchema>;

export const MeterThresholdEffectsSchema = z
  .object({
    modifiers: z.array(ModifierEffectSchema).default([]),
    /** Percent chance that an action goes wrong on top of the dice. */
    mishapChance: z.int().min(1).max(100).optional(),
    garbleLevel: z.int().min(1).max(MAX_GARBLE_LEVEL).optional(),
    /** The run ends with this reason (and the status that goes with it) while the band applies. */
    endsRun: EndsRunEffectSchema.optional(),
    /** A public warning, by id, shown to the player while the band applies. */
    warning: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Warning ids are kebab-case.')
      .optional(),
  })
  .refine(
    (effects) =>
      effects.modifiers.length > 0 ||
      effects.mishapChance !== undefined ||
      effects.garbleLevel !== undefined ||
      effects.endsRun !== undefined ||
      effects.warning !== undefined,
    { message: 'A threshold with no effect does nothing.' },
  );
export type MeterThresholdEffects = z.output<typeof MeterThresholdEffectsSchema>;

/** A band: it holds while the value is below `below` or at least `atLeast`. */
export interface Band {
  readonly below?: number | undefined;
  readonly atLeast?: number | undefined;
}

/** The band of another meter, named by id, that must hold as well. */
export const MeterConditionSchema = z
  .object({
    meter: z.string().min(1),
    below: z.int().optional(),
    atLeast: z.int().optional(),
  })
  .refine((band) => (band.below === undefined) !== (band.atLeast === undefined), {
    message: 'A condition has exactly one of `below` and `atLeast`.',
  });
export type MeterCondition = z.output<typeof MeterConditionSchema>;

/** Whether `value` is in the band. */
export function inBand({ below, atLeast }: Band, value: number): boolean {
  return (below !== undefined && value < below) || (atLeast !== undefined && value >= atLeast);
}

/**
 * A band of the meter, with the effects that apply while the value is in it. `when` adds bands of OTHER
 * meters that must all hold too; such a threshold can only end the run, since the other effects read one
 * meter alone.
 */
export const MeterThresholdSchema = z
  .object({
    below: z.int().optional(),
    atLeast: z.int().optional(),
    when: z.array(MeterConditionSchema).optional(),
    effects: MeterThresholdEffectsSchema,
  })
  .refine((threshold) => (threshold.below === undefined) !== (threshold.atLeast === undefined), {
    message: 'A threshold has exactly one of `below` and `atLeast`.',
  })
  .refine(
    ({ when, effects }) =>
      when === undefined ||
      (when.length > 0 &&
        effects.endsRun !== undefined &&
        effects.modifiers.length === 0 &&
        effects.mishapChance === undefined &&
        effects.garbleLevel === undefined &&
        effects.warning === undefined),
    { message: 'A threshold with a `when` has at least one condition and does nothing but end the run.' },
  );
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
  /** Ids of the public warnings that apply. */
  readonly warnings: readonly string[];
}

/** What a meter at `value` does: modifiers add up, while a mishap chance and a garble level take the worst. */
export function meterEffects(definition: MeterDefinition, value: number): MeterEffects {
  const modifiers: ModifierEffect[] = [];
  let mishapChance = 0;
  let garbleLevel = 0;
  const warnings: string[] = [];
  for (const { below, atLeast, when, effects } of definition.thresholds) {
    // A threshold with a condition on other meters only ends the run; see `endReasonOfMeters`.
    if (when !== undefined || !inBand({ below, atLeast }, value)) continue;
    modifiers.push(...effects.modifiers);
    mishapChance = Math.max(mishapChance, effects.mishapChance ?? 0);
    garbleLevel = Math.max(garbleLevel, effects.garbleLevel ?? 0);
    if (effects.warning !== undefined && !warnings.includes(effects.warning)) warnings.push(effects.warning);
  }
  return { modifiers, mishapChance, garbleLevel, warnings };
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

/** A meter's definition and where it stands now. */
export interface MeterReading {
  readonly definition: MeterDefinition;
  readonly value: number;
}

/**
 * Why the meters end the run, or `null` if they do not. A threshold ends it when its own meter is in the
 * band and every condition on other meters holds; a condition on a meter that has no reading never holds.
 * Meters are taken in the order given and thresholds in the order written, and the first that applies
 * names the reason, so the result does not depend on anything but the readings.
 */
export function endReasonOfMeters(readings: readonly MeterReading[]): EndReason | null {
  const values = new Map(readings.map(({ definition, value }) => [definition.id, value]));
  for (const { definition, value } of readings) {
    for (const { below, atLeast, when = [], effects } of definition.thresholds) {
      if (effects.endsRun === undefined || !inBand({ below, atLeast }, value)) continue;
      const holds = when.every(({ meter, ...band }) => {
        const other = values.get(meter);
        return other !== undefined && inBand(band, other);
      });
      if (holds) return effects.endsRun.reason;
    }
  }
  return null;
}

/** Ids of the public warnings that apply to the readings, in the order of the meters. */
export function warningsOfMeters(readings: readonly MeterReading[]): readonly string[] {
  const warnings: string[] = [];
  for (const { definition, value } of readings) {
    for (const warning of meterEffects(definition, value).warnings) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
  }
  return warnings;
}
