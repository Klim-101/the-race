// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { call, gameContext, installCase, partedSampleCase, prepareHero } from '../../test/game.js';
import { act } from './act.js';
import { TOOLS } from './index.js';
import { question } from './question.js';
import { runView } from './run-view.js';

// What the narrator reads is the input of every turn it takes, so it is kept small and kept from growing. These limits
// sit a little above what the tools give today: a change that makes a result fatter has to say so here, in a number.
// The sizes are the characters of the JSON the narrator is sent.
const TURN_RESULT_MAX = 3_000;
const RUN_VIEW_MAX = 12_000;
const CATALOGUE_MAX = 40_000;
/** The few characters a longer run may add to the result of a turn that says the same: a turn number with more digits. */
const SAME_STATE_SLACK = 50;
/**
 * What the view of the run may add in a day on top of that: an event the world brought (a line of the chronicle). It
 * comes with the clock and the case and is bounded by them, not by the number of turns the player takes.
 */
const WORLD_EVENT_ALLOWANCE = 400;

const size = (value: unknown): number => JSON.stringify(value).length;

interface View {
  readonly status: string;
  readonly turn: number;
  readonly clock: { readonly day: number };
  readonly location: { readonly id: string };
  readonly map: { readonly places: readonly { readonly id: string }[] };
}

async function newRun() {
  const context = gameContext();
  await prepareHero(context);
  const sample = partedSampleCase();
  // Ten days, so that a run of a hundred turns never ends on the way.
  await installCase(context, { ...sample, clock: { ...sample.clock, days: 10 } });
  return context;
}

const viewOf = async (context: Awaited<ReturnType<typeof newRun>>): Promise<View> =>
  (await call(runView, {}, context)).body as unknown as View;

describe('the size of what the narrator reads', () => {
  it('keeps every result of a long, varied run within its limit', async () => {
    const context = await newRun();
    const turnResults: number[] = [];
    const views: number[] = [];

    for (let step = 0; step < 120; step += 1) {
      const view = await viewOf(context);
      views.push(size(view));
      if (view.status !== 'active') break;
      const elsewhere = view.map.places.map(({ id }) => id).filter((id) => id !== view.location.id);
      const intents = [
        { kind: 'look' },
        { kind: 'search' },
        { kind: 'look' },
        { kind: 'move', locationId: elsewhere[step % elsewhere.length] },
      ];
      const result =
        step % 6 === 5
          ? await call(question, { turn: view.turn, suspectId: 'curator', approach: 'social' }, context)
          : await call(act, { turn: view.turn, intent: intents[step % 4] }, context);
      if (!result.isError) turnResults.push(size(result.body));
    }

    // The run must be long enough to mean something, or the test would pass by playing nothing.
    expect(turnResults.length).toBeGreaterThan(60);
    expect(Math.max(...turnResults)).toBeLessThanOrEqual(TURN_RESULT_MAX);
    expect(Math.max(...views)).toBeLessThanOrEqual(RUN_VIEW_MAX);
  });

  it('gives a result no larger late in a day than early in it, however many turns have passed', async () => {
    const context = await newRun();
    // The result of a turn must not grow at all; the view may grow only by what the world did meanwhile.
    const firstDay: { turn: number; result: number; view: number }[] = [];

    for (let turn = 0; turn <= 100; turn += 1) {
      const result = await call(act, { turn, intent: { kind: 'look' } }, context);
      expect(result.isError).toBe(false);
      const view = await viewOf(context);
      if (view.clock.day === 1) firstDay.push({ turn, result: size(result.body), view: size(view) });
    }

    const early = firstDay[10];
    const late = firstDay.at(-1);
    expect(early).toBeDefined();
    expect(late).toBeDefined();
    // Far enough apart to mean something.
    expect((late?.turn ?? 0) - (early?.turn ?? 0)).toBeGreaterThan(50);
    expect((late?.result ?? Infinity) - (early?.result ?? 0)).toBeLessThanOrEqual(SAME_STATE_SLACK);
    expect((late?.view ?? Infinity) - (early?.view ?? 0)).toBeLessThanOrEqual(WORLD_EVENT_ALLOWANCE);
  });

  it('keeps the words of the tools, which every turn carries, within one limit', () => {
    const words = TOOLS.map(
      ({ description, inputSchema }) =>
        description.length + size(z.toJSONSchema(inputSchema, { io: 'input', unrepresentable: 'any' })),
    );

    expect(words.reduce((sum, length) => sum + length, 0)).toBeLessThanOrEqual(CATALOGUE_MAX);
  });
});
