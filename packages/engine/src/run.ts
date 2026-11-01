// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { LocaleSchema } from './locale.js';

export const RUN_SCHEMA_VERSION = 2;
/**
 * Bumped when a rule changes in a way that makes an old run play differently. 6: random events are also drawn
 * in the day, when the clock passes midday and the evening; a run of an older ruleset plays as it did.
 * 9: a failed pressure talk, a link that leads nowhere and a search that finds nothing fray the nerves too,
 * up to a few points a day (see `strainByAction`).
 * 10: every day has an event of its own: the night leaves the pool enough for the days still to come, and
 * an evening with none drawn brings one (see `random-events.ts`).
 */
export const RULESET_VERSION = 10;

export const MAX_REPUTATION = 10;
export const MINUTES_PER_DAY = 24 * 60;
/** Every day of a run starts at this minute of the clock, 08:00, and so does the morning after a night. */
export const DAY_START_MINUTE = 8 * 60;

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

/**
 * Why a run ended: what the final screen shows. The status only says won, lost or gave-up. `breakdown` comes from
 * a threshold of the nerves meter (see `endReasonOfMeters`).
 */
export const END_REASONS = [
  'proven',
  'unproven',
  'wrong',
  'time-ran-out',
  'culprit-fled',
  'reputation-zero',
  'breakdown',
  'gave-up',
] as const;
export const EndReasonSchema = z.enum(END_REASONS);
export type EndReason = z.infer<typeof EndReasonSchema>;

/** The status a run ends in for each reason: only a proven case is won. */
export function statusOfEndReason(reason: EndReason): Exclude<RunStatus, 'active'> {
  if (reason === 'proven') return 'won';
  return reason === 'gave-up' ? 'gave-up' : 'lost';
}

/** The id of the folder a run is saved in; the old single save becomes the one with the legacy id. */
export const LEGACY_RUN_ID = '00000000-legacy';
/** `<date>-<time>-<seed>`, such as `20261101-124606-9f3a1c2e`: folders sort in the order the runs were played. */
export const RUN_ID_PATTERN = /^(?:\d{8}-\d{6}-[a-z0-9]+(?:-[a-z0-9]+)*|00000000-legacy)$/;

/** What every kind of run carries, whatever its archetype. */
export const runBaseShape = {
  schemaVersion: z.literal(RUN_SCHEMA_VERSION),
  rulesetVersion: z.int().min(1),
  /** The seed the run started from; the dice continue from `rngState`. */
  seed: z.string().min(1),
  /** Where the run is saved: made when the run starts, and absent from a run saved before runs had folders. */
  runId: z.string().regex(RUN_ID_PATTERN).optional(),
  rngState: z.int().min(0).max(0xffffffff),
  locale: LocaleSchema,
  turn: z.int().min(0),
  clock: RunClockSchema,
  reputation: z.int().min(0).max(MAX_REPUTATION),
  status: RunStatusSchema,
  /** `null` while the run is active, and for a save from before reasons were recorded. */
  endReason: EndReasonSchema.nullable().default(null),
};

/** Moves the clock forward; time only runs one way. */
export function advanceClock(clock: RunClock, minutes: number): RunClock {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError(`Time can only move forward in whole minutes, got ${String(minutes)}.`);
  }
  const total = clock.minute + minutes;
  return { day: clock.day + Math.floor(total / MINUTES_PER_DAY), minute: total % MINUTES_PER_DAY };
}
