// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { PROFILE_FILE, PROFILE_IMPORT_FILE, recordRun } from '@the-race/saves';
import { describe, expect, it } from 'vitest';
import { TEST_PROFILE_DIR } from '../../test/fake-context.js';
import { call, gameContext, installCase, prepareHero } from '../../test/game.js';
import { accuse } from './accuse.js';
import { act } from './act.js';
import { profileExport, profileImport, profileView } from './profile-tools.js';
import { runGiveUp } from './run-give-up.js';

async function activeRun() {
  const context = gameContext();
  await prepareHero(context);
  await installCase(context);
  return context;
}

const profileFile = join(TEST_PROFILE_DIR, PROFILE_FILE);
const accusation = { turn: 0, culpritId: 'caterer', motiveInsightId: null, evidenceClueIds: [] };

describe('the profile fills as runs end', () => {
  it('is empty before any run has ended, and a run in play adds nothing', async () => {
    const context = await activeRun();
    await call(act, { turn: 0, intent: { kind: 'look' } }, context);

    const view = await call(profileView, {}, context);

    expect(view.body).toMatchObject({ stats: { runs: 0, won: 0, winRate: 0 }, recent: [] });
    expect(context.fs.files.has(profileFile)).toBe(false);
  });

  it('takes a record when an accusation ends the run, with the hero, the title and the cause', async () => {
    const context = await activeRun();
    await call(accuse, accusation, context);

    const view = await call(profileView, {}, context);

    expect(view.body).toMatchObject({
      stats: { runs: 1, won: 0, lost: 1, byReason: { wrong: 1 } },
      recent: [{ hero: 'Mira Kos', background: 'police', endReason: 'wrong', won: false }],
    });
    expect(JSON.stringify(view.body)).not.toMatch(/postmaster|motive|culpritId/);
  });

  it('takes a record when the player gives up, once however often the end is asked for', async () => {
    const context = await activeRun();
    await call(runGiveUp, { turn: 0 }, context);
    await call(runGiveUp, { turn: 0 }, context);

    const view = await call(profileView, {}, context);

    expect(view.body).toMatchObject({ stats: { runs: 1, gaveUp: 1, lost: 0 } });
  });

  it('never costs the player the turn that ended the run, when the profile cannot be written', async () => {
    const context = await activeRun();
    context.fs.failRename(profileFile);

    const result = await call(accuse, accusation, context);

    expect(result.isError).toBe(false);
    expect(result.body).toMatchObject({ view: { status: 'lost' } });
    expect(context.fs.files.has(profileFile)).toBe(false);
  });
});

describe('profile_view', () => {
  it('lists the last five runs, the latest first, and every end reason there is', async () => {
    const context = gameContext();
    for (let run = 0; run < 7; run += 1) {
      await recordRun(
        TEST_PROFILE_DIR,
        {
          version: 1,
          runId: `run-${String(run)}`,
          locale: 'en',
          title: `Case ${String(run)}`,
          hero: { name: 'Mira', background: 'police', lifeState: undefined },
          endReason: 'gave-up',
          won: false,
          days: 1,
          turns: 1,
          minutes: 1,
          cluesFound: 0,
          insights: 0,
          traitsRevealed: 0,
          traitsTotal: 2,
        },
        context.fs,
      );
    }

    const view = await call(profileView, {}, context);

    expect((view.body.recent as { title: string }[]).map(({ title }) => title)).toEqual([
      'Case 6',
      'Case 5',
      'Case 4',
      'Case 3',
      'Case 2',
    ]);
    expect(view.body.reasons).toContain('gave-up');
    expect(view.body).toMatchObject({ stats: { runs: 7, gaveUp: 7 } });
  });

  it('says the profile is unusable, and changes nothing, when its file is damaged', async () => {
    const context = gameContext();
    context.fs.files.set(profileFile, 'garbage');

    const view = await call(profileView, {}, context);

    expect(view.isError).toBe(true);
    expect((view.body.error as { code: string }).code).toBe('profile-unusable');
    expect(context.fs.files.get(profileFile)).toBe('garbage');
  });
});

describe('profile_export and profile_import', () => {
  it('export a profile that import takes in again on a clean one, without doubling it', async () => {
    const from = await activeRun();
    await call(accuse, accusation, from);
    const exported = await call(profileExport, {}, from);
    const path = exported.body.path as string;
    const text = from.fs.files.get(path) ?? '';

    const to = gameContext();
    to.fs.files.set(join(TEST_PROFILE_DIR, PROFILE_IMPORT_FILE), text);
    expect((await call(profileImport, {}, to)).body).toEqual({ added: 1, skipped: 0 });
    expect((await call(profileImport, {}, to)).body).toEqual({ added: 0, skipped: 1 });
    expect((await call(profileView, {}, to)).body).toMatchObject({ stats: { runs: 1 } });
  });

  it('refuse in a sentence when there is no file, when it is not a profile and when the profile is damaged', async () => {
    const context = gameContext();
    const code = async () => ((await call(profileImport, {}, context)).body.error as { code: string }).code;

    expect(await code()).toBe('no-import-file');
    context.fs.files.set(join(TEST_PROFILE_DIR, PROFILE_IMPORT_FILE), '{"hello":1}');
    expect(await code()).toBe('invalid-import-file');
    context.fs.files.set(profileFile, 'garbage');
    expect(await code()).toBe('profile-unusable');
    expect(((await call(profileExport, {}, context)).body.error as { code: string }).code).toBe(
      'profile-unusable',
    );
  });
});
