// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { runFiles } from '@the-race/saves';
import { describe, expect, it } from 'vitest';
import { HERO_CHOICES, call, gameContext, installCase, prepareHero } from '../../test/game.js';
import { pendingFile } from '../pending-run.js';
import { accuse } from './accuse.js';
import { act } from './act.js';
import { deduce } from './deduce.js';
import { question } from './question.js';
import { runGiveUp } from './run-give-up.js';
import { runNew } from './run-new.js';
import { runView } from './run-view.js';
import { heroCreate } from './hero-create.js';

async function activeRun() {
  const context = gameContext();
  await prepareHero(context);
  await installCase(context);
  return context;
}

function errorCode(result: { body: Record<string, unknown> }): unknown {
  return (result.body.error as { code: string }).code;
}

describe('run_new', () => {
  it('offers the public choices and waits for a hero', async () => {
    const context = gameContext();
    const result = await call(runNew, { locale: 'ru' }, context);
    expect(result.body).toMatchObject({
      status: 'awaiting-hero',
      locale: 'ru',
      skillPoints: 10,
      locales: ['ru', 'en'],
    });
    expect(result.body.backgrounds).toContain('police');
    expect(result.body.signals).toContainEqual(
      expect.objectContaining({ id: 'in-love', voice: expect.any(String) as unknown }),
    );
    expect(JSON.stringify(result.body)).not.toContain('traits');
    const view = await call(runView, {}, context);
    expect(view.body).toMatchObject({ status: 'awaiting-hero', locale: 'ru' });
  });

  it('is refused while a run is active, and allowed once it is over', async () => {
    const context = await activeRun();
    expect(errorCode(await call(runNew, { locale: 'en' }, context))).toBe('run-in-progress');
    await call(runGiveUp, { turn: 0 }, context);
    expect((await call(runNew, { locale: 'en' }, context)).isError).toBe(false);
  });

  it('does not start over a save it cannot read', async () => {
    const context = gameContext();
    context.fs.files.set(runFiles(context.saveDir).current, '{broken');
    expect(errorCode(await call(runNew, { locale: 'en' }, context))).toBe('save-unusable');
    expect(context.fs.files.has(pendingFile(context.saveDir))).toBe(false);
  });
});

describe('hero_create and run_view without a run', () => {
  it('needs a pending run', async () => {
    const context = gameContext();
    expect(errorCode(await call(heroCreate, HERO_CHOICES, context))).toBe('no-pending-run');
    expect((await call(runView, {}, context)).body).toEqual({ status: 'no-run' });
  });

  it('refuses a bad hero with reasons and does not store it', async () => {
    const context = gameContext();
    await call(runNew, { locale: 'en' }, context);
    const bad = await call(
      heroCreate,
      { ...HERO_CHOICES, skills: { ...HERO_CHOICES.skills, tech: 5 } },
      context,
    );
    expect(errorCode(bad)).toBe('invalid-hero');
    expect(JSON.stringify(bad.body)).toContain('add up');
    expect((await call(runView, {}, context)).body.status).toBe('awaiting-hero');
    const unsigned = await call(heroCreate, { ...HERO_CHOICES, signalId: 'nope' }, context);
    expect(errorCode(unsigned)).toBe('invalid-hero');
  });

  it('makes the same hero every time and shows only how many traits are hidden', async () => {
    const context = gameContext();
    await call(runNew, { locale: 'en', seed: 'again' }, context);
    const first = await call(heroCreate, HERO_CHOICES, context);
    const second = await call(heroCreate, HERO_CHOICES, context);
    expect(second).toEqual(first);
    expect(first.body).toMatchObject({ status: 'awaiting-case', hiddenTraitCount: 2 });
    expect(Object.keys(first.body).sort()).toEqual(['hero', 'hiddenTraitCount', 'status']);
    const withoutSignal = { ...HERO_CHOICES, signalId: undefined };
    expect((await call(heroCreate, withoutSignal, context)).isError).toBe(false);
    const view = await call(runView, {}, context);
    expect(view.body).toMatchObject({ status: 'awaiting-case', hiddenTraitCount: 2 });
    expect(view.body).not.toHaveProperty('traits');
  });
});

describe('run_view with a run', () => {
  it('shows an active run in preference to a pending one', async () => {
    const context = await activeRun();
    await call(runNew, { locale: 'en' }, context).catch(() => undefined);
    const view = await call(runView, {}, context);
    expect(view.body).toMatchObject({ status: 'active', turn: 0, endReason: null });
  });

  it('shows a finished run, and says so when the save is unusable', async () => {
    const context = await activeRun();
    await call(runGiveUp, { turn: 0 }, context);
    expect((await call(runView, {}, context)).body).toMatchObject({
      status: 'gave-up',
      endReason: 'gave-up',
    });
    context.fs.files.set(runFiles(context.saveDir).current, '{broken');
    context.fs.files.delete(runFiles(context.saveDir).previous);
    expect(errorCode(await call(runView, {}, context))).toBe('save-unusable');
  });
});

describe('the turn tools', () => {
  it('refuse with no run', async () => {
    const context = gameContext();
    expect(errorCode(await call(act, { turn: 0, intent: { kind: 'look' } }, context))).toBe('no-run');
    expect(errorCode(await call(runGiveUp, { turn: 0 }, context))).toBe('no-run');
  });

  it('refuse over a save that cannot be read', async () => {
    const context = gameContext();
    context.fs.files.set(runFiles(context.saveDir).current, '{broken');
    expect(errorCode(await call(act, { turn: 0, intent: { kind: 'look' } }, context))).toBe('save-unusable');
  });

  it('play a turn once, and refuse the same call again as stale', async () => {
    const context = await activeRun();
    const first = await call(act, { turn: 0, intent: { kind: 'look' } }, context);
    expect(first.body).toMatchObject({ outcome: { kind: 'look' }, view: { turn: 1, status: 'active' } });
    const again = await call(act, { turn: 0, intent: { kind: 'look' } }, context);
    expect(errorCode(again)).toBe('stale-turn');
    expect((await call(runView, {}, context)).body.turn).toBe(1);
  });

  it('pass an engine refusal on and change nothing', async () => {
    const context = await activeRun();
    const before = [...context.fs.files.entries()];
    const refused = await call(act, { turn: 0, intent: { kind: 'move', locationId: 'nowhere' } }, context);
    expect(errorCode(refused)).toBe('unknown-location');
    expect([...context.fs.files.entries()]).toEqual(before);
    const away = await call(question, { turn: 0, suspectId: 'postmaster', approach: 'social' }, context);
    expect(errorCode(away)).toBe('suspect-elsewhere');
    expect(errorCode(await call(deduce, { turn: 0, clueIds: ['a-clue', 'b-clue'] }, context))).toBe(
      'not-found',
    );
  });

  it('question a suspect of the place', async () => {
    const context = await activeRun();
    const result = await call(question, { turn: 0, suspectId: 'curator', approach: 'social' }, context);
    expect(result.body).toMatchObject({ outcome: { kind: 'interrogate' }, view: { turn: 1 } });
  });

  it('end the run with an accusation, once, and show the truth only then', async () => {
    const context = await activeRun();
    const choice = { turn: 0, culpritId: 'caterer', motiveInsightId: null, evidenceClueIds: [] };
    const result = await call(accuse, choice, context);
    expect(result.body).toMatchObject({
      outcome: { kind: 'accuse', verdict: 'wrong', truth: { culpritId: 'postmaster' } },
      view: { status: 'lost', endReason: 'wrong' },
    });
    expect(errorCode(await call(accuse, choice, context))).toBe('stale-turn');
    const over = await call(act, { turn: 1, intent: { kind: 'look' } }, context);
    expect(errorCode(over)).toBe('run-over');
    expect(errorCode(await call(runGiveUp, { turn: 1 }, context))).toBe('run-over');
  });

  it('give up once, and answer a retry with the same end', async () => {
    const context = await activeRun();
    await call(act, { turn: 0, intent: { kind: 'look' } }, context);
    const first = await call(runGiveUp, { turn: 1 }, context);
    expect(first.body).toMatchObject({
      view: { status: 'gave-up', endReason: 'gave-up', turn: 1 },
      stats: { turns: 1, minutes: 5 },
    });
    const retry = await call(runGiveUp, { turn: 1 }, context);
    expect(retry.isError).toBe(false);
    expect(retry.body).toMatchObject({ view: { status: 'gave-up', turn: 1 } });
    expect(errorCode(await call(runGiveUp, { turn: 0 }, context))).toBe('stale-turn');
  });
});
