// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DETECTIVE_SKILL_PRESETS, DetectiveCaseSchema } from '@the-race/engine';
import { loadRun, runFiles } from '@the-race/saves';
import { describe, expect, it } from 'vitest';
import { TEST_BOARD_DIR } from '../../test/fake-context.js';
import { HERO_CHOICES, call, gameContext, installCase, prepareHero, sampleCase } from '../../test/game.js';
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

describe('the summary of a turn', () => {
  it('carries the known map, the title and the language, the same as run_view, after every kind of turn', async () => {
    const context = await activeRun();
    const first = (await call(runView, {}, context)).body as {
      title: string;
      locale: string;
      location: { exits: { id: string }[] };
    };
    const exit = first.location.exits[0]?.id ?? '';

    const looked = await call(act, { turn: 0, intent: { kind: 'look' } }, context);
    const moved = await call(act, { turn: 1, intent: { kind: 'move', locationId: exit } }, context);
    const after = (await call(runView, {}, context)).body as { map: unknown };

    for (const result of [looked, moved]) {
      expect(result.body).toMatchObject({ view: { title: first.title, locale: first.locale } });
    }
    expect((moved.body.view as { map: unknown }).map).toEqual(after.map);
    expect((looked.body.view as { map: { current: string } }).map.current).not.toBe(
      (moved.body.view as { map: { current: string } }).map.current,
    );
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
    // The chronicle tells what the player did, from the run's log.
    expect(page).toContain('Looked around');
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

  it('says in a way the player can act on that the board folder cannot be written', async () => {
    const context = await activeRun();
    const broken = {
      ...context,
      saveFs: {
        ...context.saveFs,
        mkdir: () => Promise.reject(new Error('EACCES: permission denied')),
      },
    };

    const result = await call(evidenceBoard, {}, broken);

    expect(result.isError).toBe(true);
    expect(result.body).toMatchObject({ error: { code: 'board-unwritable' } });
    expect(JSON.stringify(result.body)).not.toContain('EACCES');
    expect(JSON.stringify(result.body)).toContain('Game folder');
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

describe('the random events of a turn', () => {
  async function runOfSeed(seed: string) {
    const context = gameContext();
    await call(runNew, { locale: 'en', seed }, context);
    await call(heroCreate, HERO_CHOICES, context);
    await installCase(context);
    return context;
  }

  it('come back with the turn that brought them, also in the day, and the view tells them too', async () => {
    let seen = 0;
    for (let index = 0; index < 40; index += 1) {
      const context = await runOfSeed(`day-events-${String(index)}`);
      let turn = 0;
      for (let step = 0; step < 14; step += 1) {
        const result = await call(
          act,
          { turn, intent: { kind: step % 2 === 0 ? 'look' : 'search' } },
          context,
        );
        if (result.isError) break;
        turn += 1;
        const events = result.body.events as { description: string; effect: string }[];
        expect(Array.isArray(events)).toBe(true);
        if (events.length === 0) continue;
        const view = (await call(runView, {}, context)).body as { news: string[] };
        for (const { description, effect } of events) {
          expect(typeof effect).toBe('string');
          expect(view.news).toContain(description);
          seen += 1;
        }
        // A night would draw its own; the day's events come with no night in the turn.
        expect((result.body.outcome as { kind: string }).kind).not.toBe('rest');
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('are an empty list when nothing happened', async () => {
    const context = await activeRun();

    const result = await call(act, { turn: 0, intent: { kind: 'look' } }, context);

    expect(result.body.events).toEqual([]);
  });
});

describe('a case without a pool of events', () => {
  it('is played as before: nothing happens in the day, and the list of events stays empty', async () => {
    const context = gameContext();
    await call(runNew, { locale: 'en', seed: 'no-pool' }, context);
    await call(heroCreate, HERO_CHOICES, context);
    const bare = DetectiveCaseSchema.parse(
      Object.fromEntries(Object.entries(sampleCase()).filter(([key]) => key !== 'randomEvents')),
    );
    await installCase(context, bare);

    let turn = 0;
    for (let step = 0; step < 8; step += 1) {
      const result = await call(act, { turn, intent: { kind: 'look' } }, context);
      if (result.isError) break;
      turn += 1;
      expect(result.body.events).toEqual([]);
    }
    expect(turn).toBeGreaterThan(0);
  });
});

describe('what the character signal did in a turn', () => {
  async function talkTo(context: Awaited<ReturnType<typeof activeRun>>, approach: 'social' | 'pressure') {
    const view = (await call(runView, {}, context)).body as {
      turn: number;
      location: { id: string };
      suspects: { id: string; place: { id: string } | null }[];
    };
    const suspect = view.suspects.find(({ place }) => place === null || place.id === view.location.id);
    if (!suspect) throw new Error('The sample case has a suspect at the start.');
    return call(question, { turn: view.turn, suspectId: suspect.id, approach, clueIds: [] }, context);
  }

  it('is told in words: in love helped a social talk, and nothing for the other approach', async () => {
    const helped = await talkTo(await activeRun(), 'social');
    const plain = await talkTo(await activeRun(), 'pressure');

    expect(helped.body.felt).toEqual([{ signal: 'in-love', effect: 'helped', skill: 'social' }]);
    expect(plain.body.felt).toEqual([]);
    expect(JSON.stringify(helped.body.felt)).not.toMatch(/\d/);
  });

  it('is an empty list for a hero without a signal, and for a turn with no roll', async () => {
    const context = gameContext();
    await call(runNew, { locale: 'en', seed: 'no-signal' }, context);
    await call(
      heroCreate,
      Object.fromEntries(Object.entries(HERO_CHOICES).filter(([key]) => key !== 'signalId')),
      context,
    );
    await installCase(context);

    expect((await talkTo(context, 'social')).body.felt).toEqual([]);
    const look = await call(act, { turn: 1, intent: { kind: 'look' } }, context);
    expect(look.body.felt).toEqual([]);
  });
});

describe('the cost and the shield of a signal in a turn', () => {
  it('burnt out hinders a social talk always, and shields the nerves on a blunder', async () => {
    const effects = new Set<string>();
    for (let index = 0; index < 120 && !effects.has('shielded'); index += 1) {
      const context = gameContext();
      await call(runNew, { locale: 'en', seed: `burnt-${String(index)}` }, context);
      await call(heroCreate, { ...HERO_CHOICES, signalId: 'burnt-out' }, context);
      await installCase(context);
      const view = (await call(runView, {}, context)).body as {
        suspects: { id: string; place: { id: string } | null }[];
        location: { id: string };
      };
      const suspect = view.suspects.find(({ place }) => place === null || place.id === view.location.id);
      const result = await call(
        question,
        { turn: 0, suspectId: suspect?.id ?? '', approach: 'social', clueIds: [] },
        context,
      );
      const felt = result.body.felt as { signal: string; effect: string; skill?: string; meter?: string }[];

      expect(felt).toContainEqual({ signal: 'burnt-out', effect: 'hindered', skill: 'social' });
      for (const { effect, meter } of felt) {
        effects.add(effect);
        if (effect === 'shielded') expect(meter).toBe('nerves');
      }
    }
    expect([...effects].toSorted()).toEqual(['hindered', 'shielded']);
  });
});

describe('the size of a link', () => {
  /** A case whose first clues lie in plain sight at the start, so that one look finds them. */
  async function withFoundClues(count: number) {
    const context = gameContext();
    await call(runNew, { locale: 'en', seed: 'links' }, context);
    await call(heroCreate, HERO_CHOICES, context);
    const base = sampleCase();
    const clues = base.clues.slice(0, count).map(({ id }) => id);
    await installCase(context, {
      ...base,
      clues: base.clues.map((clue) =>
        clues.includes(clue.id) ? { ...clue, locationId: base.startLocationId, discovery: null } : clue,
      ),
    });
    if (count > 0) await call(act, { turn: 0, intent: { kind: 'look' } }, context);
    return { context, clues };
  }

  it('is in the view as numbers only, smallest first', async () => {
    const { context } = await withFoundClues(0);

    const view = (await call(runView, {}, context)).body as { openLinks: number[] };

    expect(view.openLinks.length).toBeGreaterThan(0);
    expect(view.openLinks.every((size) => Number.isInteger(size) && size >= 2)).toBe(true);
    expect(view.openLinks).toEqual(view.openLinks.toSorted((a, b) => a - b));
  });

  it('refuses a set of another size before any time is spent, and names the sizes and no clue', async () => {
    const { context, clues } = await withFoundClues(6);
    const before = (await call(runView, {}, context)).body as {
      turn: number;
      openLinks: number[];
      clock: { minute: number };
    };
    const wrong = [2, 3, 4, 5, 6].find((size) => !before.openLinks.includes(size)) ?? 6;

    const refused = await call(deduce, { turn: before.turn, clueIds: clues.slice(0, wrong) }, context);

    expect(refused.isError).toBe(true);
    expect(refused.body).toMatchObject({ error: { code: 'wrong-link-size' } });
    expect(JSON.stringify(refused.body)).toContain([...new Set(before.openLinks)].join(' or '));
    for (const id of clues) expect(JSON.stringify(refused.body)).not.toContain(id);
    const after = (await call(runView, {}, context)).body as { turn: number; clock: { minute: number } };
    expect(after).toMatchObject({ turn: before.turn, clock: { minute: before.clock.minute } });
  });
});

describe('the hidden traits a turn showed', () => {
  it('tells each trait once, and the view then holds it in the open and counts one fewer hidden', async () => {
    const context = await activeRun();
    const before = (await call(runView, {}, context)).body as { hiddenTraitCount: number };
    const told: { trait: string; polarity: string; reason: string }[] = [];
    let turn = 0;
    for (const intent of [{ kind: 'look' }, { kind: 'search' }, { kind: 'rest' }, { kind: 'rest' }]) {
      const result = await call(act, { turn, intent }, context);
      expect(result.isError).toBe(false);
      turn += 1;
      told.push(...(result.body.revealed as typeof told));
    }

    const ids = told.map(({ trait }) => trait);
    expect(new Set(ids).size).toBe(ids.length);
    const after = (await call(runView, {}, context)).body as {
      hiddenTraitCount: number;
      revealedTraits: { id: string }[];
    };
    expect(after.revealedTraits.map(({ id }) => id).sort()).toEqual([...ids].sort());
    expect(after.hiddenTraitCount).toBe(before.hiddenTraitCount - ids.length);
    for (const entry of told) expect(['positive', 'negative', 'mixed']).toContain(entry.polarity);
  });

  it('is an empty list on a turn that showed nothing', async () => {
    const result = await call(act, { turn: 0, intent: { kind: 'look' } }, await activeRun());

    expect(result.body.revealed).toEqual([]);
  });
});

describe('the count of hidden traits in the short view of a turn', () => {
  it('is the same number run_view gives, a count and no more', async () => {
    const context = await activeRun();
    const full = (await call(runView, {}, context)).body as { hiddenTraitCount: number };
    const result = await call(act, { turn: 0, intent: { kind: 'look' } }, context);

    expect((result.body.view as { hiddenTraitCount: number }).hiddenTraitCount).toBe(full.hiddenTraitCount);
    expect(Object.keys(result.body.view as object)).not.toContain('traits');
  });
});
