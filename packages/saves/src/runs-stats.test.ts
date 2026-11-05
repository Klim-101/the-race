// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { endRun, type DetectiveRunState } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { memoryFs, type MemoryFs } from '../test/memory-fs.js';
import { newRun } from '../test/new-run.js';
import { runBoardFile } from './board-dir.js';
import { runFiles, saveRun } from './run-store.js';
import { RunsStatsSchema, collectRunsStats } from './runs-stats.js';

const DIR = 'save-root';
const TODAY = '2026-11-05';

const runOf = (runId: string, edit: (run: DetectiveRunState) => DetectiveRunState = (run) => run) =>
  edit({ ...newRun(), runId });
const won = (run: DetectiveRunState) => endRun(run, 'won', 'proven');
const lost = (run: DetectiveRunState) => endRun(run, 'lost', 'wrong');

async function folder(runs: DetectiveRunState[]): Promise<MemoryFs> {
  const fs = memoryFs();
  for (const run of runs) await saveRun(DIR, run, fs);
  return fs;
}

describe('the statistics of all the runs', () => {
  it('has no runs and nothing in the totals for an empty folder', async () => {
    const stats = await collectRunsStats(DIR, TODAY, memoryFs());

    expect(stats).toEqual({
      schemaVersion: 1,
      updatedOn: TODAY,
      locale: 'en',
      runs: [],
      totals: { runs: 0, wins: 0, longestDays: 0, bestStreak: 0 },
    });
    expect(RunsStatsSchema.parse(stats)).toEqual(stats);
  });

  it('lists each run, the first played first, with its result, days and turns', async () => {
    const fs = await folder([
      runOf('20261031-120000-b', lost),
      runOf('20261030-100000-a', won),
      runOf('20261101-090000-c', (run) => ({ ...run, turn: 12, clock: { day: 3, minute: 600 } })),
      runOf('20261102-090000-d', (run) => endRun(run, 'gave-up', 'gave-up')),
    ]);

    const { runs } = await collectRunsStats(DIR, TODAY, fs);

    expect(runs.map(({ runId, result }) => [runId, result])).toEqual([
      ['20261030-100000-a', 'won'],
      ['20261031-120000-b', 'lost'],
      ['20261101-090000-c', 'in-progress'],
      ['20261102-090000-d', 'gave-up'],
    ]);
    expect(runs[0]).toMatchObject({
      startedOn: '2026-10-30',
      title: 'The Vanishing Wheel of Elmwick',
      endReason: 'proven',
      days: 1,
      turns: 0,
    });
    expect(runs[2]).toMatchObject({ endReason: null, days: 3, turns: 12 });
  });

  it('sums up the runs: how many, how many won, the longest, the best streak of wins that are over', async () => {
    const day = (days: number) => (run: DetectiveRunState) => ({
      ...run,
      clock: { day: days, minute: 600 },
    });
    const fs = await folder([
      runOf('20261030-100000-a', (run) => won(day(2)(run))),
      runOf('20261031-100000-b', (run) => won(day(3)(run))),
      runOf('20261101-100000-c', (run) => lost(day(1)(run))),
      runOf('20261102-100000-d', (run) => won(day(2)(run))),
      // A run that goes on neither adds to a streak nor breaks one.
      runOf('20261103-100000-e'),
    ]);

    const { totals } = await collectRunsStats(DIR, TODAY, fs);

    expect(totals).toEqual({ runs: 5, wins: 3, longestDays: 3, bestStreak: 2 });
  });

  it('lists a run that cannot be read as damaged, without touching it, and a folder with no state as no run', async () => {
    const fs = await folder([runOf('20261030-100000-a', won)]);
    fs.files.set(runFiles(DIR, '20261031-100000-b').current, '{ not json');
    fs.files.set(runFiles(DIR, '20261031-100000-b').currentLog, '[]');
    fs.files.set(runFiles(DIR, '20261101-100000-c').currentLog, '[]');
    const damaged = fs.files.get(runFiles(DIR, '20261031-100000-b').current);

    const stats = await collectRunsStats(DIR, TODAY, fs);

    expect(stats.runs.map(({ runId, result }) => [runId, result])).toEqual([
      ['20261030-100000-a', 'won'],
      ['20261031-100000-b', 'damaged'],
    ]);
    expect(stats.runs[1]).toMatchObject({
      title: null,
      hero: null,
      endReason: null,
      days: null,
      turns: null,
    });
    expect(fs.files.get(runFiles(DIR, '20261031-100000-b').current)).toBe(damaged);
    expect(stats.totals.runs).toBe(2);
  });

  it('does not let a damaged run, or one that goes on, break a streak', async () => {
    const fs = await folder([runOf('20261030-100000-a', won), runOf('20261031-100000-c', won)]);
    fs.files.set(runFiles(DIR, '20261030-110000-b').current, '{ not json');
    fs.files.set(runFiles(DIR, '20261030-110000-b').currentLog, '[]');

    expect((await collectRunsStats(DIR, TODAY, fs)).totals.bestStreak).toBe(2);
  });

  it('says whether the board of a run is on disk', async () => {
    const fs = await folder([runOf('20261030-100000-a', won), runOf('20261031-100000-b', won)]);
    fs.files.set(runBoardFile(DIR, '20261030-100000-a'), '<html></html>');

    const { runs } = await collectRunsStats(DIR, TODAY, fs);

    expect(runs.map(({ board }) => board)).toEqual([true, false]);
  });

  it('has the language of the newest run that can be read', async () => {
    const fs = await folder([
      runOf('20261030-100000-a', (run) => ({ ...run, locale: 'ru' as const })),
      runOf('20261031-100000-b', (run) => ({ ...run, locale: 'en' as const })),
    ]);
    fs.files.set(runFiles(DIR, '20261101-100000-c').current, '{ not json');
    fs.files.set(runFiles(DIR, '20261101-100000-c').currentLog, '[]');

    expect((await collectRunsStats(DIR, TODAY, fs)).locale).toBe('en');
  });

  it('gives a run with no date in its id no day', async () => {
    const fs = await folder([runOf('00000000-legacy', won)]);

    expect((await collectRunsStats(DIR, TODAY, fs)).runs[0]?.startedOn).toBeNull();
  });

  it('does not take a board that cannot be read for a board that is there', async () => {
    const fs = await folder([runOf('20261030-100000-a', won)]);
    fs.failRead(runBoardFile(DIR, '20261030-100000-a'));

    expect((await collectRunsStats(DIR, TODAY, fs)).runs[0]?.board).toBe(false);
  });

  it('holds nothing sealed: nothing of the truth, the solution or the log of a run', async () => {
    const run = runOf('20261030-100000-a', won);
    const fs = await folder([run]);

    const text = JSON.stringify(await collectRunsStats(DIR, TODAY, fs));

    for (const secret of [run.case.truth.motive, run.case.truth.method, run.case.truth.culpritId]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain('caseSeal');
    expect(text).not.toContain('evidenceChains');
  });
});
