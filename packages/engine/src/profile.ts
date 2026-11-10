// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { END_REASONS, EndReasonSchema, type EndReason } from './run.js';
import { deriveStats, type RunLog } from './detective/event-log.js';
import { DetectiveHeroSchema } from './detective/archetype.js';
import { ArchetypeSchema, type Archetype } from './hero.js';
import { MirrorFormsSchema } from './world/world.js';
import type { DetectiveRunState } from './detective/run-state.js';

// The player's profile is a list of the runs that are over, one small record each, and nothing else: no counter
// is stored. Every number the player sees is computed from the records, so a new metric is a new function over
// the same list and needs no migration, and a profile can be thrown away and rebuilt from its records. A record
// holds what is public once a run is over (the hero, the title, how it ended and how far it got); it never
// holds the case, its truth or the log itself.

export const PROFILE_RECORD_VERSION = 1;

export const ProfileRecordSchema = z.object({
  version: z.literal(PROFILE_RECORD_VERSION),
  /** The run's own seed: one record for a run, so recording it twice or importing it twice adds nothing. */
  runId: z.string().min(1),
  /**
   * The kind of game the run was. Every record before the second kind of game is a detective's, so a record without it
   * is read as one (see `archetypeOf`); a page of the profile groups the runs by it and each kind says how it is shown.
   */
  archetype: ArchetypeSchema.optional(),
  /** What the case was about, in the words of its archetype's themes: the crime type for a detective. */
  theme: z.string().min(1).optional(),
  /** The country of the mirror world the run was set in, named in both languages; none for a run set nowhere. */
  setting: z.object({ id: z.string().min(1), name: MirrorFormsSchema }).optional(),
  /** The id of the run's folder in the saves, for opening that run's report later; absent from older records. */
  folder: z.string().optional(),
  locale: z.enum(['ru', 'en']),
  title: z.string(),
  hero: z.object({
    name: z.string(),
    background: DetectiveHeroSchema.shape.background,
    lifeState: DetectiveHeroSchema.shape.lifeState,
    signalId: z.string().optional(),
  }),
  endReason: EndReasonSchema,
  won: z.boolean(),
  /** The day of the case the hero was on when the run ended. */
  days: z.int().min(1),
  turns: z.int().min(0),
  minutes: z.int().min(0),
  cluesFound: z.int().min(0),
  insights: z.int().min(0),
  traitsRevealed: z.int().min(0),
  traitsTotal: z.int().min(0),
});
export type ProfileRecord = z.infer<typeof ProfileRecordSchema>;

/** The archetype of a record: a record from before the field was written is a detective's. */
export const archetypeOf = (record: Pick<ProfileRecord, 'archetype'>): Archetype =>
  record.archetype ?? 'detective';

/**
 * The record of a run that is over, from its final state and its log. The numbers of play come from the log
 * (see `deriveStats`), the rest from the state; an active run has no record.
 */
export function profileRecordOf(run: DetectiveRunState, log: RunLog): ProfileRecord | undefined {
  if (run.status === 'active' || run.endReason === null) return undefined;
  const { turns, minutes, cluesFound, insights } = deriveStats(log);
  return {
    version: PROFILE_RECORD_VERSION,
    runId: run.seed,
    archetype: run.archetype,
    theme: run.case.crimeType,
    ...(run.setting === null ? {} : { setting: { id: run.setting.id, name: run.setting.name } }),
    ...(run.runId === undefined ? {} : { folder: run.runId }),
    locale: run.locale,
    title: run.case.title,
    hero: {
      name: run.hero.name,
      background: run.hero.background,
      lifeState: run.hero.lifeState,
      ...(run.hero.signalId === undefined ? {} : { signalId: run.hero.signalId }),
    },
    endReason: run.endReason,
    won: run.status === 'won',
    days: run.clock.day,
    turns,
    minutes,
    cluesFound,
    insights,
    traitsRevealed: run.revealedTraitIds.length,
    traitsTotal: run.traits.length,
  };
}

export interface ProfileStats {
  readonly runs: number;
  readonly won: number;
  /** Runs that ended without a win and without giving up. */
  readonly lost: number;
  readonly gaveUp: number;
  /** Whole percent of the runs that were won, or 0 for a profile with no runs. */
  readonly winRate: number;
  /** How many runs ended for each reason; every reason is there, with zero if it never happened. */
  readonly byReason: Readonly<Record<EndReason, number>>;
  readonly daysPlayed: number;
  readonly longestRunDays: number;
  readonly turnsPlayed: number;
  readonly cluesFound: number;
  readonly insights: number;
  readonly traitsRevealed: number;
  /** Wins in a row, counting back from the latest run, and the most there ever were. */
  readonly currentStreak: number;
  readonly bestStreak: number;
}

/** Every number of the profile, computed from its records in the order they were made. */
export function computeProfileStats(records: readonly ProfileRecord[]): ProfileStats {
  const byReason = Object.fromEntries(END_REASONS.map((reason) => [reason, 0])) as Record<EndReason, number>;
  let best = 0;
  let current = 0;
  for (const record of records) {
    byReason[record.endReason] += 1;
    current = record.won ? current + 1 : 0;
    best = Math.max(best, current);
  }
  const won = records.filter((record) => record.won).length;
  const gaveUp = byReason['gave-up'];
  const sum = (pick: (record: ProfileRecord) => number): number =>
    records.reduce((total, record) => total + pick(record), 0);
  return {
    runs: records.length,
    won,
    lost: records.length - won - gaveUp,
    gaveUp,
    winRate: records.length === 0 ? 0 : Math.round((won / records.length) * 100),
    byReason,
    daysPlayed: sum((record) => record.days),
    longestRunDays: Math.max(0, ...records.map((record) => record.days)),
    turnsPlayed: sum((record) => record.turns),
    cluesFound: sum((record) => record.cluesFound),
    insights: sum((record) => record.insights),
    traitsRevealed: sum((record) => record.traitsRevealed),
    currentStreak: current,
    bestStreak: best,
  };
}
