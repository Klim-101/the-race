// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import {
  appendGenerationEntry,
  generationLogFile,
  loadGenerationLog,
  runBoardFile,
  type GenerationEntry,
  type GenerationStats,
  type RunsStats,
} from '@the-race/saves';
import { describe, expect, it } from 'vitest';
import { call, gameContext, installCase, loadTheRun, newestRunId, prepareHero } from '../test/game.js';
import { STATS_JSON, STATS_PAGE, keepGenerationLog, keepStats, statsDirOf, writeStats } from './stats.js';
import { renderStatsPage } from './stats-page.js';
import { accuse } from './tools/accuse.js';
import { act } from './tools/act.js';
import { runGiveUp } from './tools/run-give-up.js';

const GAME = 'game-folder';
const SAVES = join(GAME, 'saves');

async function started() {
  const context = { ...gameContext(), saveDir: SAVES };
  await prepareHero(context);
  await installCase(context);
  return context;
}

const statsOf = (context: Awaited<ReturnType<typeof started>>): RunsStats & { generation: GenerationStats } =>
  JSON.parse(context.fs.files.get(join(GAME, STATS_JSON)) ?? '{}') as RunsStats & {
    generation: GenerationStats;
  };

const NO_GENERATION: GenerationStats = { accepted: 0, failed: 0, acceptedOnAttempt: [], codes: [] };
const GENERATED: GenerationStats = {
  accepted: 3,
  failed: 1,
  acceptedOnAttempt: [2, 1, 0],
  codes: [
    { code: 'unreachable-location', count: 4 },
    { code: 'map-too-small', count: 1 },
  ],
};

describe('where the page of all the runs goes', () => {
  it('is the root of the game folder, the parent of the saves', () => {
    expect(statsDirOf(SAVES)).toBe(GAME);
  });

  it('is the saves folder itself when it was set by hand under another name', () => {
    expect(statsDirOf(join('elsewhere', 'my-runs'))).toBe(join('elsewhere', 'my-runs'));
  });
});

describe('writing the page of all the runs', () => {
  it('writes the data and the page beside each other, from the runs on disk', async () => {
    const context = await started();

    await writeStats(context);

    expect(statsOf(context)).toMatchObject({ schemaVersion: 1, totals: { runs: 1, wins: 0 } });
    expect(context.fs.files.get(join(GAME, STATS_PAGE))).toContain('<table>');
  });

  it('links to the board of a run that has one, by a path from the page, and to none that has not', async () => {
    const context = await started();
    const runId = await newestRunId(SAVES, context.fs);
    await writeStats(context);
    expect(context.fs.files.get(join(GAME, STATS_PAGE))).not.toContain('<a href=');

    context.fs.files.set(runBoardFile(SAVES, runId), '<html></html>');
    await writeStats(context);

    expect(context.fs.files.get(join(GAME, STATS_PAGE))).toContain(
      `<a href="saves/runs/${runId}/board/evidence.html">Open the board</a>`,
    );
  });

  it('is written when a run ends, by giving up and by an accusation, and not by an ordinary turn', async () => {
    const context = await started();
    await call(act, { turn: 0, intent: { kind: 'look' } }, context);
    expect(context.fs.files.has(join(GAME, STATS_JSON))).toBe(false);

    await call(runGiveUp, { turn: 1 }, context);
    expect(statsOf(context).runs.map(({ result }) => result)).toEqual(['gave-up']);

    const other = await started();
    await call(accuse, { turn: 0, culpritId: 'caterer', motiveInsightId: null, evidenceClueIds: [] }, other);
    expect(statsOf(other).runs.map(({ result, endReason }) => [result, endReason])).toEqual([
      ['lost', 'wrong'],
    ]);
  });

  it('sums the log of the generator into the data and the page', async () => {
    const context = await started();
    const entry: GenerationEntry = {
      date: '2026-11-06',
      seed: 's',
      locale: 'en',
      theme: 'forgery',
      archetype: 'detective',
      attempt: 2,
      outcome: 'accepted',
      codes: [],
      issues: 0,
    };
    await appendGenerationEntry(
      GAME,
      { ...entry, attempt: 1, outcome: 'rejected', codes: ['schema'] },
      context.fs,
    );
    await appendGenerationEntry(GAME, entry, context.fs);

    await writeStats(context);

    expect(statsOf(context).generation).toEqual({
      accepted: 1,
      failed: 0,
      acceptedOnAttempt: [0, 1],
      codes: [{ code: 'schema', count: 1 }],
    });
    expect(context.fs.files.get(join(GAME, STATS_PAGE))).toContain('<td>schema</td>');
  });

  it('keeps the log in the game folder beside the page, and an entry that cannot be written is dropped', async () => {
    const context = await started();
    const entry: GenerationEntry = {
      date: '2026-11-06',
      seed: 's',
      locale: 'en',
      theme: 'forgery',
      archetype: 'detective',
      attempt: 1,
      outcome: 'accepted',
      codes: [],
      issues: 0,
    };

    await keepGenerationLog(context, entry);
    expect(await loadGenerationLog(GAME, context.fs)).toEqual([entry]);

    context.fs.failRename(generationLogFile(GAME));
    await expect(keepGenerationLog(context, entry)).resolves.toBeUndefined();
    expect(await loadGenerationLog(GAME, context.fs)).toEqual([entry]);
  });

  it('never costs the player the turn: a page that cannot be written is dropped', async () => {
    const context = await started();
    context.fs.failRename(join(GAME, STATS_PAGE));

    const result = await call(runGiveUp, { turn: 0 }, context);

    expect(result.isError).toBe(false);
    expect((await loadTheRun(SAVES, context.fs)).ok).toBe(true);
    await expect(writeStats(context)).rejects.toThrow();
    await expect(keepStats(context)).resolves.toBeUndefined();
  });
});

describe('the page of all the runs', () => {
  const base: RunsStats = {
    schemaVersion: 1,
    updatedOn: '2026-11-05',
    locale: 'en',
    runs: [
      {
        runId: '20261030-100000-a',
        startedOn: '2026-10-30',
        title: 'The Vanishing Wheel',
        hero: 'Mira Kos',
        result: 'won',
        endReason: 'proven',
        days: 2,
        turns: 40,
        board: true,
      },
      {
        runId: '20261031-100000-b',
        startedOn: '2026-10-31',
        title: null,
        hero: null,
        result: 'damaged',
        endReason: null,
        days: null,
        turns: null,
        board: false,
      },
      {
        runId: '00000000-legacy',
        startedOn: null,
        title: 'An old case',
        hero: 'Dante Rook',
        result: 'in-progress',
        endReason: null,
        days: 1,
        turns: 3,
        board: false,
      },
    ],
    totals: { runs: 3, wins: 1, longestDays: 2, bestStreak: 1 },
  };
  const href = (runId: string): string => `saves/runs/${runId}/board/evidence.html`;

  it('lists every run, the newest first, with its result and the totals', () => {
    const page = renderStatsPage(base, NO_GENERATION, href);

    expect(page.indexOf('An old case')).toBeLessThan(page.indexOf('The Vanishing Wheel'));
    expect(page).toContain('won · proven');
    expect(page).toContain('still going');
    expect(page).toContain('a run that cannot be read');
    expect(page).toContain('days in the longest run');
    expect(page).toContain('<a href="saves/runs/20261030-100000-a/board/evidence.html">Open the board</a>');
    expect(page.match(/<a href=/g)).toHaveLength(1);
  });

  it('is a page with no script and nothing loaded from outside', () => {
    const page = renderStatsPage(base, GENERATED, href);

    expect(page).not.toContain('<script');
    expect(page).toContain("default-src 'none'; style-src 'unsafe-inline'");
    expect(page).not.toMatch(/(?:src|href)="https?:/);
  });

  it('is told in the language of the newest run, and a reason with no word is shown as it is', () => {
    const page = renderStatsPage(
      { ...base, locale: 'ru', runs: [{ ...base.runs[0]!, endReason: 'something-new' }] },
      GENERATED,
      href,
    );

    expect(page).toContain('<html lang="ru">');
    expect(page).toContain('Все забеги');
    expect(page).toContain('выигран · something-new');
  });

  it('says so when there is no run, and escapes every text of a run', () => {
    expect(
      renderStatsPage({ ...base, runs: [], totals: { ...base.totals, runs: 0 } }, NO_GENERATION, href),
    ).toContain('No runs yet.');
    const evil = '<img src=x onerror=alert(1)>';
    const page = renderStatsPage(
      { ...base, runs: [{ ...base.runs[0]!, title: evil, hero: evil }] },
      { ...GENERATED, codes: [{ code: evil, count: 1 }] },
      (runId) => `x"y/${runId}`,
    );

    expect(page).not.toContain(evil);
    expect(page).toContain('&lt;img src=x');
    expect(page).toContain('href="x&quot;y/');
  });

  it('says so when no case has been generated, and shows no table of them', () => {
    const page = renderStatsPage(base, NO_GENERATION, href);

    expect(page).toContain('The case generator');
    expect(page).toContain('No case has been generated yet.');
    expect(page).not.toContain('Rules that rejected cases most often');
  });

  it('tells how the generator did: the share of runs with a case, each attempt and the rules that rejected most', () => {
    const page = renderStatsPage(base, GENERATED, href);

    expect(page).toContain('<strong>75%</strong>of runs got a case');
    expect(page).toContain('<tr><td>1</td><td>2</td></tr>');
    expect(page).toContain('<tr><td>2</td><td>1</td></tr>');
    expect(page.indexOf('unreachable-location')).toBeLessThan(page.indexOf('map-too-small'));
  });

  it('lists ten rules at most, and none when no case was rejected', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ code: `rule-${String(index)}`, count: 1 }));

    const page = renderStatsPage(base, { ...GENERATED, codes: many }, href);
    expect(page).toContain('rule-9');
    expect(page).not.toContain('rule-10');

    const clean = renderStatsPage(base, { ...GENERATED, codes: [] }, href);
    expect(clean).not.toContain('Rules that rejected cases most often');
  });

  it('shows a dash for the share when no run has been decided yet', () => {
    const page = renderStatsPage(
      base,
      { accepted: 0, failed: 0, acceptedOnAttempt: [0], codes: [{ code: 'schema', count: 1 }] },
      href,
    );

    expect(page).toContain('<strong>–</strong>of runs got a case');
  });

  it('is told in Russian when the runs are', () => {
    const page = renderStatsPage({ ...base, locale: 'ru' }, GENERATED, href);

    expect(page).toContain('Генератор дел');
    expect(page).toContain('забегов получили дело');
  });
});
