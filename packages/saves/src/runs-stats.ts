// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { LocaleSchema } from '@the-race/engine';
import { z } from 'zod';
import { runBoardFile } from './board-dir.js';
import { listRunIds, loadRun } from './run-store.js';
import { nodeSaveFs, type SaveFs } from './save-fs.js';

// What the player sees of all their runs together. It holds what `run_view` shows (a title, a hero, how a run
// stands, its days and turns) and nothing sealed: the case's truth, its solution and its log never enter it.

export const RUN_RESULTS = ['won', 'lost', 'gave-up', 'in-progress', 'damaged'] as const;
export const RunResultSchema = z.enum(RUN_RESULTS);
export type RunResult = z.infer<typeof RunResultSchema>;

export const RunStatsEntrySchema = z.strictObject({
  runId: z.string().min(1),
  /** The day the run was made, from its id; `null` for a run whose id carries none. */
  startedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  /** `null` for a run that could not be read. */
  title: z.string().nullable(),
  hero: z.string().nullable(),
  result: RunResultSchema,
  /** How the run ended, as the view says it; `null` while it goes on or when it cannot be read. */
  endReason: z.string().nullable(),
  days: z.int().min(1).nullable(),
  turns: z.int().min(0).nullable(),
  /** Whether the board of the run is on disk, so that the page may link to it. */
  board: z.boolean(),
});
export type RunStatsEntry = z.infer<typeof RunStatsEntrySchema>;

/** JSON is the canonical form; the page is rendered from it. */
export const RunsStatsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  updatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The language of the page: that of the newest run that could be read. */
  locale: LocaleSchema,
  /** The first played first. */
  runs: z.array(RunStatsEntrySchema),
  totals: z.strictObject({
    runs: z.int().min(0),
    wins: z.int().min(0),
    /** The most days any run took. */
    longestDays: z.int().min(0),
    /** The most wins in a row among the runs that are over, in the order they were played. */
    bestStreak: z.int().min(0),
  }),
});
export type RunsStats = z.infer<typeof RunsStatsSchema>;

// The date and time an id starts with, as `YYYYMMDD-HHMMSS-`; the id of a run from before runs had folders has none.
const DAY_OF_ID = /^\d{8}-\d{6}-/;

function startedOn(runId: string): string | null {
  return DAY_OF_ID.test(runId) ? `${runId.slice(0, 4)}-${runId.slice(4, 6)}-${runId.slice(6, 8)}` : null;
}

function bestStreak(runs: readonly RunStatsEntry[]): number {
  let best = 0;
  let current = 0;
  for (const { result } of runs) {
    if (result === 'in-progress' || result === 'damaged') continue;
    current = result === 'won' ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

/**
 * Reads every run in the folder of the saves and sums them up. A run that cannot be read is listed as damaged and
 * left as it is; a run that goes on is listed as in progress. Nothing here writes.
 */
export async function collectRunsStats(
  saveDir: string,
  updatedOn: string,
  fs: SaveFs = nodeSaveFs,
): Promise<RunsStats> {
  const runs: RunStatsEntry[] = [];
  let locale: RunsStats['locale'] = 'en';
  for (const runId of await listRunIds(saveDir, fs)) {
    const board = (await fs.readFile(runBoardFile(saveDir, runId)).catch(() => undefined)) !== undefined;
    const loaded = await loadRun(saveDir, runId, fs);
    // A folder with no state in it (a crash before the first save) is no run, damaged or not.
    if (!loaded.ok && loaded.reason === 'missing') continue;
    if (!loaded.ok) {
      runs.push({
        runId,
        startedOn: startedOn(runId),
        title: null,
        hero: null,
        result: 'damaged',
        endReason: null,
        days: null,
        turns: null,
        board,
      });
      continue;
    }
    const { run } = loaded;
    locale = run.locale;
    runs.push({
      runId,
      startedOn: startedOn(runId),
      title: run.case.title,
      hero: run.hero.name,
      result: run.status === 'active' ? 'in-progress' : run.status,
      endReason: run.endReason,
      days: run.clock.day,
      turns: run.turn,
      board,
    });
  }
  return RunsStatsSchema.parse({
    schemaVersion: 1,
    updatedOn,
    locale,
    runs,
    totals: {
      runs: runs.length,
      wins: runs.filter(({ result }) => result === 'won').length,
      longestDays: Math.max(0, ...runs.map(({ days }) => days ?? 0)),
      bestStreak: bestStreak(runs),
    },
  });
}
