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
 * 11: a place is made of parts with obstacles (see `case-schema.ts`); the search by part is yet to come, and
 * until it does a run plays as before.
 * 12: a place made of parts is searched by part, and a quick look shows the parts (see `search-parts.ts`).
 * 13: a place can wait for a lead and a part can be shown by one (see `leads.ts`); a deed that earns a lead
 * earns it for good.
 * 14: an obstacle is got past with a tool of the kit, with a roll, and a tool wears (see `gear.ts`).
 * 15: a shown clue can confirm a fallen lie or implicate a suspect, a conclusion can be put to a suspect, and a
 * suspect has a state that a fallen lie moves and that changes the next talk (see `suspect-mood.ts`).
 * 16: using a tool that is not lawful risks being seen, and the police may detain the hero (see `risk.ts`).
 * 17: the hero can sit down at a teahouse or a cafe to win back a point of nerves, twice a day (see `venue.ts`).
 * 18: the hero can ask the locals for a rumour and study a clue with a tool, and either can earn a lead (see `ask.ts`).
 * 19: the hero can ask a witness of a place what they saw, in general or about one suspect (see `witnesses.ts`).
 * 20: a link may hold one clue more than its conclusion needs and still give it (see `verdict.ts`).
 * 21: a suspect makes claims at the first talk that the hero can see, and later ones as lies fall (see `claims.ts`).
 * 22: what a witness tells is a clue the hero holds, to show, link and lay out as proof (see `witnesses.ts`).
 * 23: a world event can set the weather of its day, so the news and the road agree (see `weather.ts`).
 * 24: the hazards of the climate make a bad day of the road harder: a longer walk and mishaps of their own (see
 * `road.ts`).
 * 25: the engine gives each place-bound trait of the hero a place of its own to act in (see `trait-scenes.ts`).
 */
export const RULESET_VERSION = 25;

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
