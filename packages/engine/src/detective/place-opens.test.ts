// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema, RandomEventSchema } from './case-schema.js';
import { drawEvents, isHarmfulEffect, isOpenedByEvent } from './random-events.js';
import { createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';

const at = (hour: number, minute = 0): number => hour * 60 + minute;
const NIGHT_HOURS = { fromMinute: at(22), untilMinute: at(2) };

const DOOR = {
  id: 'door-left-open',
  description: 'The night watchman has left the back door of the stall ajar.',
  weight: 3,
  effect: { kind: 'place-opens', locationId: 'cheese-stall' },
  duration: { kind: 'until-day', day: 3 },
};

/** Events that are only news, so that the pool is larger than the days still owed an event and the night may draw. */
const NEWS = Array.from({ length: 5 }, (_, index) => ({
  id: `news-${String(index)}`,
  description: `A small piece of news number ${String(index)} goes round the square.`,
  weight: 2,
  effect: { kind: 'flavor' },
  duration: { kind: 'instant' },
}));

/** The cheese case whose stall opens only at night, with a pool that holds the door left open. */
function newRun(pool: readonly Record<string, unknown>[] = [DOOR, ...NEWS]): DetectiveRunState {
  const raw = buildCheeseCase();
  const parsed = DetectiveCaseSchema.parse({ ...raw, randomEvents: pool });
  const detectiveCase = {
    ...parsed,
    locations: parsed.locations.map((place) =>
      place.id === 'cheese-stall' ? { ...place, hours: NIGHT_HOURS } : place,
    ),
  };
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: 'opens',
    rngState: createRng('opens').state(),
    locale: 'en',
  });
}

const at14 = (run: DetectiveRunState, day = 2): DetectiveRunState => ({
  ...run,
  clock: { day, minute: at(14) },
});
const opened = (run: DetectiveRunState, day: number): DetectiveRunState => ({
  ...run,
  drawnEvents: [{ eventId: 'door-left-open', day }],
});
const move = (run: DetectiveRunState) =>
  resolveIntent(run, { kind: 'move', locationId: 'cheese-stall' }, restoreRng(run.rngState));

describe('the event that leaves a place open', () => {
  it('is a lasting effect: it needs a day it lasts until, or for good, and is no harm to the hero', () => {
    expect(RandomEventSchema.safeParse(DOOR).success).toBe(true);
    expect(RandomEventSchema.safeParse({ ...DOOR, duration: { kind: 'instant' } }).success).toBe(false);
    expect(RandomEventSchema.safeParse({ ...DOOR, duration: { kind: 'permanent' } }).success).toBe(true);
    expect(isHarmfulEffect(DOOR.effect as never)).toBe(false);
  });

  it('lifts the hours of the place while it holds, and the hours come back when its day is over', () => {
    const shut = at14(newRun());
    const door = at14(opened(newRun(), 2));
    const later = at14(opened(newRun(), 2), 3);

    expect(move(shut)).toMatchObject({ ok: false, refusal: { code: 'closed-hours' } });
    expect(move(door).ok).toBe(true);
    expect(move(later)).toMatchObject({ ok: false, refusal: { code: 'closed-hours' } });
    expect(isOpenedByEvent(door, 'cheese-stall')).toBe(true);
    expect(isOpenedByEvent(later, 'cheese-stall')).toBe(false);
  });

  it('shows the way as open in the view while it holds, with the hours still on the sign', () => {
    const exit = (run: DetectiveRunState) =>
      viewRun(run).location.exits.find(({ id }) => id === 'cheese-stall');

    expect(exit(at14(newRun()))).toMatchObject({ blocked: 'closed-hours', hours: NIGHT_HOURS });
    expect(exit(at14(opened(newRun(), 2)))).toMatchObject({ blocked: null, hours: NIGHT_HOURS });
  });

  it('opens only the place it names, and shows no clue by itself', () => {
    const run = at14(opened(newRun(), 2));

    expect(isOpenedByEvent(run, 'storage-cellar')).toBe(false);
    expect(viewRun(run).clues).toEqual([]);
    expect(run.foundClueIds).toEqual([]);
  });

  it('comes from the draw of the night on the dice of the seed: the same seed, the same opening', () => {
    const drawnFor = (seed: string) => {
      const run = { ...newRun(), clock: { day: 2, minute: at(8) } };
      return drawEvents(run, createRng(seed));
    };
    const seeds = Array.from({ length: 80 }, (_, index) => `night-${String(index)}`);

    const first = seeds.map((seed) => drawnFor(seed).events.map(({ eventId }) => eventId));
    const second = seeds.map((seed) => drawnFor(seed).events.map(({ eventId }) => eventId));

    expect(second).toEqual(first);
    expect(first.some((ids) => ids.includes('door-left-open'))).toBe(true);
    expect(first.some((ids) => ids.length === 0)).toBe(true);
    for (const seed of seeds) {
      const { run, events } = drawnFor(seed);
      expect(isOpenedByEvent(run, 'cheese-stall')).toBe(
        events.some(({ eventId }) => eventId === 'door-left-open'),
      );
    }
  });
});
