// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { applyMeterRate, type MeterReading, type ModifierEffect } from '../meters.js';
import type { ModifierSources } from '../modifiers.js';
import { MINUTES_PER_DAY, type RunClock } from '../run.js';
import { findSignal } from '../signals.js';
import type { Trait } from '../traits.js';
import { gearModifiers, type KitItem } from './gear.js';
import { DETECTIVE, DETECTIVE_NERVES, DETECTIVE_REPUTATION, DETECTIVE_SLEEP_DEBT } from './archetype.js';

// The hero's condition is everything about them that wears off or wears out: nerves, sleep debt and timed
// conditions. It is a function of the clock and of what happened, never of the case, and it never touches
// evidence: it only moves the modifier of a check, through `collectModifier`, the same path as traits.

/** One point of nerves is spent for every stretch of this many minutes the clock runs through. */
export const NERVES_MINUTES_PER_POINT = 240;
/** Work from this minute of the day to its end is work late at night and builds sleep debt. */
export const LATE_FROM_MINUTE = 22 * 60;
/** One point of sleep debt for every full stretch of this many minutes worked late. */
export const SLEEP_DEBT_MINUTES_PER_POINT = 60;

/** From this ruleset on, failures of the work itself fray the nerves, not only the clock and a blunder. */
export const ACTION_STRAIN_RULESET_VERSION = 9;
/** The most points of nerves that failed talks, links and searches take in one day. */
export const ACTION_STRAIN_CAP_PER_DAY = 3;

export const CONDITION_IDS = [
  'drunk',
  'injured',
  'exhausted',
  'shaken',
  'sedated',
  'ill-equipped',
  'emboldened',
] as const;
export const ConditionIdSchema = z.enum(CONDITION_IDS);
export type ConditionId = z.infer<typeof ConditionIdSchema>;

/** How long a condition lasts: a number of minutes of game time, or until the night. */
export const ConditionDurationSchema = z.union([
  z.object({ minutes: z.int().min(1) }),
  z.object({ untilNight: z.literal(true) }),
]);
export type ConditionDuration = z.infer<typeof ConditionDurationSchema>;

export interface ConditionDefinition {
  readonly duration: ConditionDuration;
  readonly effects: readonly ModifierEffect[];
}

export const DETECTIVE_CONDITIONS: Readonly<Record<ConditionId, ConditionDefinition>> = {
  drunk: {
    duration: { minutes: 240 },
    effects: [
      { skills: ['perception', 'reasoning'], amount: -2 },
      { skills: ['pressure'], amount: 1 },
    ],
  },
  injured: { duration: { minutes: MINUTES_PER_DAY }, effects: [{ skills: 'all', amount: -1 }] },
  exhausted: { duration: { untilNight: true }, effects: [{ skills: 'all', amount: -2 }] },
  shaken: { duration: { minutes: 120 }, effects: [{ skills: ['social', 'pressure'], amount: -2 }] },
  // A sedative settles the nerves at once, at the price of attention.
  sedated: { duration: { minutes: 360 }, effects: [{ skills: ['perception'], amount: -3 }] },
  // The lift of a drink: bolder in talk, until it wears off.
  emboldened: { duration: { minutes: 240 }, effects: [{ skills: ['social'], amount: 2 }] },
  // Gear lost to a robbery, until it is replaced: gear is not an item yet, so it is a timed penalty.
  'ill-equipped': { duration: { minutes: 2 * MINUTES_PER_DAY }, effects: [{ skills: 'all', amount: -1 }] },
};

/** A condition that is on the hero: the minutes it has left, or `'night'` if it lasts until the night. */
export const ActiveConditionSchema = z.object({
  id: ConditionIdSchema,
  remaining: z.union([z.int().min(1), z.literal('night')]),
});
export type ActiveCondition = z.infer<typeof ActiveConditionSchema>;

export const HeroConditionSchema = z
  .object({
    nerves: z.int().min(0).max(DETECTIVE_NERVES.max),
    sleepDebt: z.int().min(0).max(DETECTIVE_SLEEP_DEBT.max),
    active: z.array(ActiveConditionSchema),
  })
  .refine(({ active }) => new Set(active.map(({ id }) => id)).size === active.length, {
    message: 'A condition is on the hero at most once.',
  });
export type HeroCondition = z.infer<typeof HeroConditionSchema>;

export function initialCondition(): HeroCondition {
  return { nerves: DETECTIVE_NERVES.start, sleepDebt: DETECTIVE_SLEEP_DEBT.start, active: [] };
}

/** Minutes from the start of the run to the clock. */
export function absoluteMinute(clock: RunClock): number {
  return (clock.day - 1) * MINUTES_PER_DAY + clock.minute;
}

const LATE_MINUTES_PER_DAY = MINUTES_PER_DAY - LATE_FROM_MINUTE;

/** Minutes worked late since the start of the run, up to the given minute of the run. */
function lateMinutesUntil(minute: number): number {
  const rest = minute % MINUTES_PER_DAY;
  return Math.floor(minute / MINUTES_PER_DAY) * LATE_MINUTES_PER_DAY + Math.max(0, rest - LATE_FROM_MINUTE);
}

/**
 * The condition after `minutes` pass from `clock`. Nerves and sleep debt follow whole stretches of the
 * clock, counted from absolute time, so the result does not depend on how the minutes were split into
 * turns. Timed conditions run down and fall away; those that last until the night wait for it.
 */
export function passTime(condition: HeroCondition, clock: RunClock, minutes: number): HeroCondition {
  const start = absoluteMinute(clock);
  const end = start + minutes;
  const spent = Math.floor(end / NERVES_MINUTES_PER_POINT) - Math.floor(start / NERVES_MINUTES_PER_POINT);
  const late =
    Math.floor(lateMinutesUntil(end) / SLEEP_DEBT_MINUTES_PER_POINT) -
    Math.floor(lateMinutesUntil(start) / SLEEP_DEBT_MINUTES_PER_POINT);
  const active: ActiveCondition[] = [];
  for (const item of condition.active) {
    if (item.remaining === 'night') active.push(item);
    else if (item.remaining > minutes) active.push({ id: item.id, remaining: item.remaining - minutes });
  }
  return {
    nerves: Math.max(0, condition.nerves - spent),
    sleepDebt: Math.min(DETECTIVE_SLEEP_DEBT.max, condition.sleepDebt + late),
    active,
  };
}

/** Nerves lost to a failure, through the meter's own drain. */
export function withNervesStrained(condition: HeroCondition): HeroCondition {
  return { ...condition, nerves: applyMeterRate(DETECTIVE_NERVES, condition.nerves, 'drain', 'failure') };
}

/** Puts a condition on the hero; one that is already there starts over, and the longer of the two stays. */
export function withCondition(condition: HeroCondition, id: ConditionId): HeroCondition {
  const { duration } = DETECTIVE_CONDITIONS[id];
  const fresh: ActiveCondition['remaining'] = 'untilNight' in duration ? 'night' : duration.minutes;
  const current = condition.active.find((item) => item.id === id);
  let remaining = fresh;
  if (current !== undefined) {
    remaining =
      current.remaining === 'night' || fresh === 'night' ? 'night' : Math.max(current.remaining, fresh);
  }
  return {
    ...condition,
    active: [...condition.active.filter((item) => item.id !== id), { id, remaining }],
  };
}

/** Everything that moves the hero's checks, for `collectModifier`. */
export function modifierSources(run: {
  readonly traits: readonly Trait[];
  readonly condition: HeroCondition;
  readonly kit: readonly KitItem[];
  readonly hero?: { readonly signalId?: string | undefined };
}): ModifierSources {
  const { condition } = run;
  const meters: MeterReading[] = [
    { definition: DETECTIVE_NERVES, value: condition.nerves },
    { definition: DETECTIVE_SLEEP_DEBT, value: condition.sleepDebt },
  ];
  return {
    traits: run.traits,
    signal: findSignal(DETECTIVE.signals, run.hero?.signalId),
    conditions: condition.active.map(({ id }) => ({ id, effects: DETECTIVE_CONDITIONS[id].effects })),
    gear: gearModifiers(run.kit),
    meters,
  };
}

/** Every meter of the detective with where it stands, reputation first as on the archetype. */
export function meterReadings(run: {
  readonly reputation: number;
  readonly condition: HeroCondition;
}): readonly MeterReading[] {
  return [
    { definition: DETECTIVE_REPUTATION, value: run.reputation },
    { definition: DETECTIVE_NERVES, value: run.condition.nerves },
    { definition: DETECTIVE_SLEEP_DEBT, value: run.condition.sleepDebt },
  ];
}

export interface ConditionView {
  readonly nerves: number;
  readonly maxNerves: number;
  readonly sleepDebt: number;
  readonly maxSleepDebt: number;
  readonly conditions: readonly {
    readonly id: ConditionId;
    /** Minutes left, or `null` for a condition that lasts until the night. */
    readonly minutesLeft: number | null;
  }[];
}

/** The public face of the condition: what the player may see on the hero. */
export function viewCondition(condition: HeroCondition): ConditionView {
  return {
    nerves: condition.nerves,
    maxNerves: DETECTIVE_NERVES.max,
    sleepDebt: condition.sleepDebt,
    maxSleepDebt: DETECTIVE_SLEEP_DEBT.max,
    conditions: condition.active.map(({ id, remaining }) => ({
      id,
      minutesLeft: remaining === 'night' ? null : remaining,
    })),
  };
}
