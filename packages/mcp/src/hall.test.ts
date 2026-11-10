// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { ProfileRecordSchema, type ProfileRecord } from '@the-race/engine';
import { PROFILE_FILE, recordRun, runBoardFile } from '@the-race/saves';
import { describe, expect, it } from 'vitest';
import { TEST_PROFILE_DIR } from '../test/fake-context.js';
import { call, gameContext, installCase, prepareHero } from '../test/game.js';
import { hallFile } from './hall.js';
import { earnedByRun } from './play.js';
import { renderHallPage } from './hall-page.js';
import { accuse } from './tools/accuse.js';
import { act } from './tools/act.js';
import { profileView } from './tools/profile-tools.js';
import { runGiveUp } from './tools/run-give-up.js';

const record = (overrides: Partial<ProfileRecord> = {}): ProfileRecord => ({
  version: 1,
  runId: 'run-1',
  archetype: 'detective',
  theme: 'forgery',
  setting: { id: 'valdmark', name: { ru: 'Вальдмарк', en: 'Valdmark' } },
  locale: 'en',
  title: 'The Cheese Case',
  hero: { name: 'Mira Kos', background: 'police', lifeState: undefined },
  endReason: 'proven',
  won: true,
  days: 2,
  turns: 14,
  minutes: 135,
  cluesFound: 6,
  insights: 2,
  traitsRevealed: 1,
  traitsTotal: 2,
  ...overrides,
});

describe('the page of the hall', () => {
  it('shows a hero with the case, its kind, the country, the result and the time spent', () => {
    const page = renderHallPage([record()], '2026-10-31', () => undefined);

    expect(page).toContain('Hall of heroes');
    expect(page).toContain('Mira Kos');
    expect(page).toContain('a police officer');
    expect(page).toContain('The Cheese Case');
    expect(page).toContain('a forgery');
    expect(page).toContain('Valdmark');
    expect(page).toContain('proven');
    expect(page).toContain('2 h 15 min');
    expect(page).toContain('1/2');
  });

  it('lists the newest hero first and counts every one in the totals', () => {
    const page = renderHallPage(
      [
        record({ runId: 'a', hero: { name: 'First Hero', background: 'nurse', lifeState: undefined } }),
        record({
          runId: 'b',
          won: false,
          endReason: 'gave-up',
          minutes: 20,
          hero: { name: 'Second Hero', background: 'nurse', lifeState: undefined },
        }),
      ],
      '2026-10-31',
      () => undefined,
    );

    expect(page.indexOf('Second Hero')).toBeLessThan(page.indexOf('First Hero'));
    expect(page).toContain('given up');
    expect(page).toContain('20 min');
    expect(page).toContain('<strong>2</strong>heroes');
    expect(page).toContain('<strong>1</strong>cases won');
  });

  it('speaks the language of the last run and names the country in it', () => {
    const page = renderHallPage([record({ locale: 'ru' })], '2026-10-31', () => undefined);

    expect(page).toContain('Зал героев');
    expect(page).toContain('Вальдмарк');
    expect(page).toContain('2 ч 15 мин');
    expect(page).toContain('lang="ru"');
  });

  it('reads a record from before the kind of game was written as a detective run', () => {
    const dropped = ['archetype', 'theme', 'setting'];
    const old = ProfileRecordSchema.parse(
      Object.fromEntries(Object.entries(record()).filter(([key]) => !dropped.includes(key))),
    );

    const page = renderHallPage([old], '2026-10-31', () => undefined);

    expect(page).toContain('Detectives');
    expect(page).toContain('The Cheese Case');
  });

  it('links the board when there is one, and escapes what it is given', () => {
    const page = renderHallPage(
      [record({ title: '<script>alert(1)</script>', folder: 'run-1' })],
      '2026-10-31',
      () => '../saves/runs/run-1/board/board.html',
    );

    expect(page).toContain('href="../saves/runs/run-1/board/board.html"');
    expect(page).not.toContain('<script>');
  });

  it('says so when no hero has finished a case, and loads nothing from outside', () => {
    const page = renderHallPage([], '2026-10-31', () => undefined);

    expect(page).toContain('No hero has finished a case yet.');
    expect(page).toContain("default-src 'none'");
    expect(page).not.toMatch(/<script|https?:\/\//);
  });
});

async function activeRun() {
  const context = gameContext();
  await prepareHero(context);
  await installCase(context);
  return context;
}

const accusation = { turn: 0, culpritId: 'caterer', motiveInsightId: null, evidenceClueIds: [] };
const hallPath = hallFile(TEST_PROFILE_DIR);

describe('the hall is written when a run ends', () => {
  it('beside the profile, with the hero in it, and the accusation gives its link', async () => {
    const context = await activeRun();
    expect(context.fs.files.has(hallPath)).toBe(false);

    const result = await call(accuse, accusation, context);

    expect(context.fs.files.has(hallPath)).toBe(true);
    expect(hallPath).toBe(join(TEST_PROFILE_DIR, 'hall.html'));
    expect(context.fs.files.get(hallPath)).toContain('Mira Kos');
    expect(result.body).toMatchObject({ hall: { path: hallPath } });
    expect((result.body as { hall: { link: string } }).hall.link.startsWith('file://')).toBe(true);
  });

  it('is written when the player gives up, and the result gives its link', async () => {
    const context = await activeRun();

    const result = await call(runGiveUp, { turn: 0 }, context);

    expect(context.fs.files.get(hallPath)).toContain('given up');
    expect(result.body).toMatchObject({ hall: { path: hallPath } });
  });

  it('is written on demand by the profile, empty while no run has ended', async () => {
    const context = await activeRun();

    const view = await call(profileView, {}, context);

    expect(view.body).toMatchObject({ hall: { path: hallPath } });
    expect(context.fs.files.get(hallPath)).toContain('No hero has finished a case yet.');
  });

  it('never costs the player the turn, when the page cannot be written', async () => {
    const context = await activeRun();
    context.fs.failRename(hallPath);

    const result = await call(accuse, accusation, context);

    expect(result.isError).toBe(false);
    expect(result.body).toMatchObject({ view: { status: 'lost' } });
    expect(result.body).not.toHaveProperty('hall');
    expect(context.fs.files.has(join(TEST_PROFILE_DIR, PROFILE_FILE))).toBe(true);
  });

  it('is also kept for a player who gives up, and for one who asks for their heroes, when it cannot be written', async () => {
    const context = await activeRun();
    context.fs.failRename(hallPath);

    const gaveUp = await call(runGiveUp, { turn: 0 }, context);
    const view = await call(profileView, {}, context);

    expect(gaveUp.isError).toBe(false);
    expect(gaveUp.body).not.toHaveProperty('hall');
    expect(view.body).toMatchObject({ stats: { gaveUp: 1 } });
    expect(view.body).not.toHaveProperty('hall');
  });

  it('is written without the link of a board that cannot be read', async () => {
    const context = gameContext();
    await recordRun(TEST_PROFILE_DIR, record({ runId: 'no-folder' }), context.fs);
    await recordRun(TEST_PROFILE_DIR, record({ folder: 'run-1' }), context.fs);
    context.fs.failRead(runBoardFile(context.saveDir, 'run-1'));

    const view = await call(profileView, {}, context);

    expect(view.body).toMatchObject({ hall: { path: hallPath } });
    expect(context.fs.files.get(hallPath)).toContain('The Cheese Case');
    expect(context.fs.files.get(hallPath)).not.toContain('Open the board');
  });

  it('is not written, and not linked, from a profile that cannot be read', async () => {
    const context = await activeRun();
    context.fs.files.set(join(TEST_PROFILE_DIR, PROFILE_FILE), '{ not json');

    const result = await call(runGiveUp, { turn: 0 }, context);

    expect(result.isError).toBe(false);
    expect(result.body).not.toHaveProperty('hall');
    expect(context.fs.files.has(hallPath)).toBe(false);
  });
});

describe('achievements on the page', () => {
  it('tells the earned ones, shows the others as still to earn, and keeps a secret one secret', () => {
    const page = renderHallPage([record({ days: 3, turns: 40 })], '2026-10-31', () => undefined);

    expect(page).toContain('Achievements: 1/14');
    expect(page).toContain('First case');
    expect(page).toContain('Prove your first case.');
    expect(page).toContain('Swift hand');
    expect(page).toContain('Not earned yet');
    expect(page).toContain('A secret');
    expect(page).not.toContain('By the book');
    expect(page).not.toContain('Prove a case in ten turns or fewer.');
  });

  it('names a secret one once it is earned', () => {
    const page = renderHallPage([record({ days: 1, turns: 8 })], '2026-10-31', () => undefined);

    expect(page).toContain('By the book');
    expect(page).toContain('Prove a case in ten turns or fewer.');
  });

  it('is in Russian for a run played in Russian, and an empty hall still lists them to earn', () => {
    expect(renderHallPage([record({ locale: 'ru' })], '2026-10-31', () => undefined)).toContain(
      'Первое дело',
    );
    expect(renderHallPage([], '2026-10-31', () => undefined)).toContain('Achievements: 0/14');
  });
});

describe('what a run earned, told to the narrator', () => {
  const slow = (): ProfileRecord => record({ days: 3, turns: 40 });

  it('is what the run added to the profile, with its words in the language of the run', () => {
    expect(earnedByRun('en', [], [slow()])).toEqual([
      { id: 'first-case', name: 'First case', description: 'Prove your first case.' },
    ]);
    expect(earnedByRun('ru', [], [slow()])[0]).toMatchObject({
      id: 'first-case',
      name: 'Первое дело',
    });
    expect(earnedByRun('en', [slow()], [slow(), slow()])).toEqual([]);
  });

  it('is empty on every turn but the one that ends the run, and for a run that was lost', async () => {
    const context = await activeRun();

    const playing = await call(act, { turn: 0, intent: { kind: 'look' } }, context);
    const accused = await call(accuse, { ...accusation, turn: 1 }, context);

    expect(playing.body).toMatchObject({ achievements: [] });
    expect(accused.body).toMatchObject({ achievements: [] });
  });
});
