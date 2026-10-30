// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { LocaleSchema } from './locale.js';

export const RUN_SCHEMA_VERSION = 1;
/** Bumped when a rule changes in a way that makes an old run play differently. */
export const RULESET_VERSION = 1;

export const MAX_REPUTATION = 10;
export const MINUTES_PER_DAY = 24 * 60;

export const RunClockSchema = z.object({
  /** 1-based day of the run. */
  day: z.int().min(1),
  minute: z
    .int()
    .min(0)
    .max(MINUTES_PER_DAY - 1),
});
export type RunClock = z.infer<typeof RunClockSchema>;

export const RUN_STATUSES = ['active', 'won', 'lost', 'gave-up'] as const;
export const RunStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** What every kind of run carries, whatever its archetype. */
export const runBaseShape = {
  schemaVersion: z.literal(RUN_SCHEMA_VERSION),
  rulesetVersion: z.int().min(1),
  /** The seed the run started from; the dice continue from `rngState`. */
  seed: z.string().min(1),
  rngState: z.int().min(0).max(0xffffffff),
  locale: LocaleSchema,
  turn: z.int().min(0),
  clock: RunClockSchema,
  reputation: z.int().min(0).max(MAX_REPUTATION),
  status: RunStatusSchema,
};

/** Moves the clock forward; time only runs one way. */
export function advanceClock(clock: RunClock, minutes: number): RunClock {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError(`Time can only move forward in whole minutes, got ${String(minutes)}.`);
  }
  const total = clock.minute + minutes;
  return { day: clock.day + Math.floor(total / MINUTES_PER_DAY), minute: total % MINUTES_PER_DAY };
}
