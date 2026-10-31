// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng } from '../dice.js';
import { resolveIntent, type Resolution } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import {
  DetectiveRunStateSchema,
  createDetectiveRun,
  findClue,
  moveTo,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';

function runOf(): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'history',
    rngState: 1,
    locale: 'en',
  });
}

function ok(resolution: Resolution): Extract<Resolution, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

const play = (run: DetectiveRunState, intent: unknown, seed = 3) =>
  ok(resolveIntent(run, intent, createRng(seed))).run;

describe('where each clue was found', () => {
  it('starts empty, and a look writes down the clues in plain sight, with their place and the turn', () => {
    expect(runOf().history).toEqual({ finds: [], shown: [], links: [] });

    const looked = play(runOf(), { kind: 'look' });

    expect(looked.history.finds).toEqual([{ clueId: 'cellar-key', locationId: 'market-square', turn: 1 }]);
  });

  it('writes a clue down once, in the order found, and a clue found again changes nothing', () => {
    const run = findClue(findClue(runOf(), 'cellar-key'), 'blue-glove');

    expect(run.history.finds.map(({ clueId }) => clueId)).toEqual(['cellar-key', 'blue-glove']);
    expect(findClue(run, 'cellar-key')).toBe(run);
  });

  it('is the place of the clue, not the place the hero happens to stand in', () => {
    const away = moveTo(runOf(), 'cheese-stall');

    expect(findClue(away, 'oven-receipt').history.finds).toEqual([
      { clueId: 'oven-receipt', locationId: 'mayor-office', turn: 1 },
    ]);
  });
});

describe('to whom each clue was shown', () => {
  const talk = (run: DetectiveRunState, clueIds: string[]) =>
    play(run, { kind: 'interrogate', suspectId: 'rival', approach: 'social', clueIds });

  it('writes down each clue shown to the suspect, with what the showing did', () => {
    const ready = findClue(findClue(runOf(), 'blue-glove'), 'cellar-key');

    const talked = talk(ready, ['blue-glove', 'cellar-key']);

    expect(talked.history.shown).toHaveLength(2);
    const byClue = Object.fromEntries(talked.history.shown.map(({ clueId, effect }) => [clueId, effect]));
    expect(byClue['cellar-key']).toBe('no-effect');
    expect(talked.history.shown.every(({ suspectId, turn }) => suspectId === 'rival' && turn === 1)).toBe(
      true,
    );
  });

  it('writes down a showing that broke a lie as such', () => {
    const ready = findClue(runOf(), 'blue-glove');
    let broke = false;
    for (let seed = 0; seed < 40 && !broke; seed += 1) {
      const talked = play(
        ready,
        { kind: 'interrogate', suspectId: 'rival', approach: 'pressure', clueIds: ['blue-glove'] },
        seed,
      );
      broke = talked.history.shown.some(({ effect }) => effect === 'breaks-lie');
    }
    expect(broke).toBe(true);
  });

  it('writes nothing for a talk in which nothing was shown', () => {
    expect(talk(runOf(), []).history.shown).toEqual([]);
  });
});

describe('the links the hero tried', () => {
  const ready = () =>
    ['cellar-key', 'blue-glove', 'cart-tracks', 'flour-crumbs', 'debt-ledger'].reduce(findClue, runOf());

  it('writes down a link that came to nothing, and says nothing of how close it was', () => {
    const run = ready();
    const sizes = viewRun(run).openLinks;
    const size = sizes[0] ?? 2;
    const pool = ['cellar-key', 'blue-glove', 'cart-tracks', 'flour-crumbs', 'debt-ledger'];
    // Every set of the allowed size is tried until one comes to nothing.
    let nothing: DetectiveRunState | undefined;
    for (let start = 0; start < pool.length && nothing === undefined; start += 1) {
      const clueIds = [...pool.slice(start), ...pool.slice(0, start)].slice(0, size);
      const resolution = resolveIntent(run, { kind: 'deduce', clueIds }, createRng(2));
      if (resolution.ok && resolution.outcome.kind === 'deduce' && resolution.outcome.result === 'nothing') {
        nothing = resolution.run;
      }
    }
    expect(nothing?.history.links).toHaveLength(1);
    expect(nothing?.history.links[0]).toMatchObject({ result: 'nothing', turn: 1 });
    expect(JSON.stringify(nothing?.history.links)).not.toMatch(/close|almost|near/);
  });

  it('writes down a conclusion drawn and one already known', () => {
    const run = ready();
    const wanted = run.case.deductions[0];
    if (!wanted) throw new Error('The sample case has a deduction.');
    const withAll = wanted.clueIds.reduce(findClue, run);

    const first = play(withAll, { kind: 'deduce', clueIds: wanted.clueIds });
    const again = play(first, { kind: 'deduce', clueIds: wanted.clueIds });

    expect(first.history.links.at(-1)).toMatchObject({ result: 'insight' });
    expect(again.history.links.at(-1)).toMatchObject({ result: 'already-known' });
    expect(again.history.links).toHaveLength(2);
  });

  it('writes down nothing for a link refused before any time is spent', () => {
    const run = ready();
    const refused = resolveIntent(run, { kind: 'deduce', clueIds: ['cellar-key', 'unknown'] }, createRng(1));

    expect(refused.ok).toBe(false);
    expect(run.history.links).toEqual([]);
  });
});

describe('the history in the view and in an old save', () => {
  it('is in the public view, and holds no key of the sealed truth', () => {
    const run = findClue(runOf(), 'cellar-key');
    const view = viewRun(run);

    expect(view.history).toBe(run.history);
    expect(JSON.stringify(view.history)).not.toMatch(/culprit|motive|isRedHerring|solution/);
  });

  it('is empty for a save made before it existed', () => {
    const old: Record<string, unknown> = JSON.parse(JSON.stringify(runOf())) as Record<string, unknown>;
    delete old.history;

    expect(DetectiveRunStateSchema.parse(old).history).toEqual({ finds: [], shown: [], links: [] });
  });
});
