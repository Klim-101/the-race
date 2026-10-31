// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DETECTIVE_SKILL_PRESETS } from '@the-race/engine';
import { loadRun, runFiles } from '@the-race/saves';
import { describe, expect, it } from 'vitest';
import { TEST_BOARD_DIR } from '../../test/fake-context.js';
import { HERO_CHOICES, call, gameContext, installCase, prepareHero } from '../../test/game.js';
import { escapeHtml } from '../board/render-board.js';
import { pendingFile } from '../pending-run.js';
import { accuse } from './accuse.js';
import { act } from './act.js';
import { deduce } from './deduce.js';
import { evidenceBoard } from './evidence-board.js';
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

  it('offers ready-made builds of the points, each one a hero the engine accepts', async () => {
    const context = gameContext();
    const result = await call(runNew, { locale: 'en' }, context);
    const presets = result.body.skillPresets as { id: string; skills: Record<string, number> }[];
    expect(presets.map(({ id }) => id)).toEqual(DETECTIVE_SKILL_PRESETS.map(({ id }) => id));
    for (const { skills } of presets) {
      const made = await call(heroCreate, { ...HERO_CHOICES, skills }, context);
      expect(made.isError).toBe(false);
    }
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
    // What the suspect said is kept with the run, so it replays and shows in the view after a reload.
    const reloaded = await call(runView, {}, context);
    const curator = (reloaded.body.suspects as { id: string; statements: { kind: string }[] }[]).find(
      ({ id }) => id === 'curator',
    );
    expect(curator?.statements[0]?.kind).toBe('alibi');
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

describe('evidence_board', () => {
  it('writes a page of the public view and returns where it is', async () => {
    const context = await activeRun();
    await call(act, { turn: 0, intent: { kind: 'look' } }, context);

    const result = await call(evidenceBoard, {}, context);

    expect(result.isError).toBe(false);
    const path = result.body.path as string;
    expect(path).toBe(join(TEST_BOARD_DIR, 'evidence.html'));
    expect(result.body).toMatchObject({ clueCount: expect.any(Number) as unknown, insightCount: 0 });
    const page = context.fs.files.get(path) ?? '';
    expect(page).toContain('<!doctype html>');
    expect(page).toContain('Last seen');
  });

  it('is written outside the save directory, with a file:// link to the same page', async () => {
    const context = await activeRun();

    const result = await call(evidenceBoard, {}, context);

    const path = result.body.path as string;
    expect(path.startsWith(context.saveDir)).toBe(false);
    expect(path.startsWith(context.boardDir)).toBe(true);
    expect(result.body.link).toBe(pathToFileURL(path).href);
    expect(result.body.link).toMatch(/^file:\/\/\/.*evidence\.html$/);
    expect([...context.fs.files.keys()].filter((file) => file.startsWith(context.saveDir))).not.toContain(
      path,
    );
  });

  it('keeps one file between calls, so a tab left open follows the run', async () => {
    const context = await activeRun();

    const first = await call(evidenceBoard, {}, context);
    await call(act, { turn: 0, intent: { kind: 'look' } }, context);
    const second = await call(evidenceBoard, {}, context);

    expect(second.body.path).toBe(first.body.path);
    expect(second.body.link).toBe(first.body.link);
    const boards = [...context.fs.files.keys()].filter((file) => file.startsWith(context.boardDir));
    expect(boards).toEqual([first.body.path]);
  });

  it('holds nothing beyond what run_view shows: no truth, no hidden trait, no clue not yet found', async () => {
    const context = await activeRun();
    await call(act, { turn: 0, intent: { kind: 'look' } }, context);
    const view = (await call(runView, {}, context)).body as {
      clues: { description: string }[];
      suspects: { name: string; persona: string }[];
    };
    const board = (await call(evidenceBoard, {}, context)).body.path as string;
    const page = context.fs.files.get(board) ?? '';
    const run = await loadRun(context.saveDir, context.saveFs);
    if (!run.ok) throw new Error('The run must load.');
    const sealed = run.run.case;
    const shown = new Set(view.clues.map(({ description }) => description));

    // What the player may see is on the page, as the view has it.
    for (const description of shown) expect(page).toContain(escapeHtml(description));
    for (const { name, persona } of view.suspects) {
      expect(page).toContain(escapeHtml(name));
      expect(page).toContain(escapeHtml(persona));
    }
    // What the sealed case keeps back is not.
    const hidden = [
      sealed.truth.motive,
      sealed.truth.method,
      ...sealed.truth.timeline.map(({ action }) => action),
      ...sealed.suspects.flatMap(({ secret, alibi, lies }) => [
        secret,
        alibi,
        ...lies.map((lie) => lie.statement),
      ]),
      ...sealed.clues.map(({ description }) => description).filter((text) => !shown.has(text)),
      ...run.run.traits.map(({ id }) => id),
    ];
    expect(hidden.length).toBeGreaterThan(10);
    for (const text of hidden) expect(page).not.toContain(escapeHtml(text));
    expect(page).not.toMatch(/culprit|isRedHerring|pointsTo|rngState|caseSeal/);
  });

  it('is refused when there is no run', async () => {
    const result = await call(evidenceBoard, {}, gameContext());
    expect(errorCode(result)).toBe('no-run');
  });
});
