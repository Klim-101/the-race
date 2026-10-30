// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, type Rng } from '../dice.js';
import { MINUTES_PER_DAY } from '../run.js';
import type { Trait } from '../traits.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema, type RandomEvent } from './case-schema.js';
import {
  BASE_EVENT_CHANCE_PERCENT,
  DEADLINE_CHANCE_GROWTH_PERCENT,
  MAX_HARMFUL_EVENTS_PER_DAY,
  activeEffects,
  closedSourcesOf,
  drawEvents,
  isHarmfulEffect,
  isLocationClosed,
  standingOf,
  suspectPlace,
} from './random-events.js';
import { createDetectiveRun, endRun, viewRun, type DetectiveRunState } from './run-state.js';
import { isSolvable } from './solvability.js';

type EventInput = Partial<RandomEvent> & Pick<RandomEvent, 'id' | 'effect' | 'duration'>;

const ALLEY = {
  id: 'side-alley',
  name: 'Side alley',
  description: 'A narrow alley that leads nowhere in particular.',
  connections: [] as string[],
  access: { kind: 'open' },
};

function event(input: EventInput): Record<string, unknown> {
  return { description: `Something happens: ${input.id}.`, weight: 1, ...input };
}

const FLAVOR = event({ id: 'fair-music', effect: { kind: 'flavor' }, duration: { kind: 'instant' } });
const TIME = event({
  id: 'lost-bus',
  effect: { kind: 'time-lost', minutes: 60 },
  duration: { kind: 'instant' },
});

function runWith(
  events: readonly Record<string, unknown>[],
  options: { days?: number; traits?: readonly Trait[]; tone?: string } = {},
): DetectiveRunState {
  const raw = buildCheeseCase();
  raw.locations.push(ALLEY);
  (raw.locations[0]?.connections as string[]).push('side-alley');
  raw.clock.days = options.days ?? 3;
  if (options.tone !== undefined) raw.tone = options.tone;
  raw.randomEvents = [...events];
  return createDetectiveRun({
    hero: buildHero(),
    traits: options.traits ?? [],
    case: DetectiveCaseSchema.parse(raw),
    seed: 'events',
    rngState: 1,
    locale: 'en',
  });
}

/** Dice that give the values the test names, in order, whatever the sides. */
function scripted(...values: number[]): Rng {
  let index = 0;
  const next = (): number => values[index++] ?? 1;
  return { next: () => 0, roll: (sides) => Math.min(sides, next()), state: () => index };
}

/** A draw that always brings an event (the first roll is a sure hit) and takes the first candidate. */
const SURE = (slots = 1): Rng => scripted(...Array.from({ length: slots }, () => [1, 1]).flat());

function onDay(run: DetectiveRunState, day: number): DetectiveRunState {
  return { ...run, clock: { day, minute: 8 * 60 } };
}

describe('drawEvents', () => {
  it('draws nothing, and rolls nothing, from a case without a pool', () => {
    const run = runWith([]);
    const rng = createRng('x');
    const before = rng.state();
    expect(drawEvents(run, rng)).toEqual({ run, events: [] });
    expect(rng.state()).toBe(before);
  });

  it('draws nothing once the run is over', () => {
    const over = endRun(runWith([FLAVOR]), 'lost');
    expect(drawEvents(over, SURE())).toEqual({ run: over, events: [] });
  });

  it('brings no event when the chance roll misses', () => {
    const run = runWith([FLAVOR]);
    expect(
      drawEvents(run, scripted(BASE_EVENT_CHANCE_PERCENT + 1, BASE_EVENT_CHANCE_PERCENT + 1)).events,
    ).toEqual([]);
  });

  it('brings an event when the chance roll hits, and records it with its day', () => {
    const drawn = drawEvents(runWith([FLAVOR]), SURE());
    expect(drawn.events).toEqual([{ eventId: 'fair-music', day: 1 }]);
    expect(drawn.run.drawnEvents).toEqual(drawn.events);
    expect(viewRun(drawn.run).news).toContain('Something happens: fair-music.');
  });

  it('leaves the old run alone', () => {
    const run = runWith([FLAVOR]);
    drawEvents(run, SURE());
    expect(run.drawnEvents).toEqual([]);
  });

  it('draws an event at most once per run', () => {
    const drawn = drawEvents(runWith([FLAVOR]), SURE(2));
    expect(drawn.events).toHaveLength(1);
  });

  it('takes a second event in the second slot', () => {
    const other = event({ id: 'quiet-hour', effect: { kind: 'flavor' }, duration: { kind: 'instant' } });
    const drawn = drawEvents(runWith([FLAVOR, other]), SURE(2));
    expect(drawn.events.map(({ eventId }) => eventId)).toEqual(['fair-music', 'quiet-hour']);
  });

  it('picks among the events by weight', () => {
    const heavy = event({
      id: 'heavy',
      weight: 3,
      effect: { kind: 'flavor' },
      duration: { kind: 'instant' },
    });
    const run = runWith([FLAVOR, heavy]);
    // 100 + 300 hundredths: a roll of 101 is the first one past the first event
    expect(drawEvents(run, scripted(1, 100)).events[0]?.eventId).toBe('fair-music');
    expect(drawEvents(run, scripted(1, 101)).events[0]?.eventId).toBe('heavy');
    expect(drawEvents(run, scripted(1, 400)).events[0]?.eventId).toBe('heavy');
  });

  describe('which events fit the moment', () => {
    it('keeps to the tone of the case', () => {
      const wry = event({ ...FLAVOR, tones: ['wry'] } as EventInput);
      expect(drawEvents(runWith([wry], { tone: 'serious' }), SURE()).events).toEqual([]);
      expect(drawEvents(runWith([wry], { tone: 'wry' }), SURE()).events).toHaveLength(1);
    });

    it('keeps to its days', () => {
      const window = event({ ...FLAVOR, fromDay: 2, untilDay: 2 } as EventInput);
      const run = runWith([window]);
      expect(drawEvents(onDay(run, 1), SURE()).events).toEqual([]);
      expect(drawEvents(onDay(run, 2), SURE()).events).toHaveLength(1);
      expect(drawEvents(onDay(run, 3), SURE()).events).toEqual([]);
    });

    it('has no last day unless it names one', () => {
      const from = event({ ...FLAVOR, fromDay: 2 } as EventInput);
      expect(drawEvents(onDay(runWith([from]), 3), SURE()).events).toHaveLength(1);
    });

    it('does not start an effect that would already be over', () => {
      const over = event({
        id: 'short',
        effect: { kind: 'location-closes', locationId: 'side-alley' },
        duration: { kind: 'until-day', day: 2 },
      });
      expect(drawEvents(onDay(runWith([over]), 2), SURE()).events).toEqual([]);
      expect(drawEvents(onDay(runWith([over]), 1), SURE()).events).toHaveLength(1);
    });
  });

  describe('the effects', () => {
    it('loses time, but stops short of midnight', () => {
      const run = runWith([TIME]);
      expect(drawEvents(run, SURE()).run.clock.minute).toBe(run.clock.minute + 60);
      const late = { ...run, clock: { day: 1, minute: MINUTES_PER_DAY - 10 } };
      expect(drawEvents(late, SURE()).run.clock).toEqual({ day: 1, minute: MINUTES_PER_DAY - 1 });
      const midnight = { ...run, clock: { day: 1, minute: MINUTES_PER_DAY - 1 } };
      expect(drawEvents(midnight, SURE()).run.clock).toEqual(midnight.clock);
    });

    it('costs nerves, but never the last one', () => {
      const cost = event({
        id: 'bad-news',
        effect: { kind: 'nerves-cost', points: 2 },
        duration: { kind: 'instant' },
      });
      const run = runWith([cost]);
      expect(drawEvents(run, SURE()).run.condition.nerves).toBe(run.condition.nerves - 2);
      const frayed = { ...run, condition: { ...run.condition, nerves: 2 } };
      expect(drawEvents(frayed, SURE()).run.condition.nerves).toBe(1);
      const last = { ...run, condition: { ...run.condition, nerves: 1 } };
      expect(drawEvents(last, SURE()).run.condition.nerves).toBe(1);
    });

    it('puts a condition on the hero', () => {
      const shaken = event({
        id: 'loud-noise',
        effect: { kind: 'condition', condition: 'shaken' },
        duration: { kind: 'instant' },
      });
      expect(drawEvents(runWith([shaken]), SURE()).run.condition.active).toEqual([
        { id: 'shaken', remaining: 120 },
      ]);
    });

    it('closes a place until a day, and for good', () => {
      const until = event({
        id: 'road-works',
        effect: { kind: 'location-closes', locationId: 'side-alley' },
        duration: { kind: 'until-day', day: 3 },
      });
      const drawn = drawEvents(runWith([until]), SURE()).run;
      expect(isLocationClosed(drawn, 'side-alley')).toBe(true);
      expect(isLocationClosed(onDay(drawn, 2), 'side-alley')).toBe(true);
      expect(isLocationClosed(onDay(drawn, 3), 'side-alley')).toBe(false);
      expect(isLocationClosed(drawn, 'cheese-stall')).toBe(false);
      const refused = resolveIntent(
        { ...drawn, locationId: 'market-square' },
        { kind: 'move', locationId: 'side-alley' },
        createRng('m'),
      );
      expect(refused).toMatchObject({ ok: false, refusal: { code: 'location-closed' } });

      const forever = event({ ...until, duration: { kind: 'permanent' } } as EventInput);
      expect(isLocationClosed(onDay(drawEvents(runWith([forever]), SURE()).run, 9), 'side-alley')).toBe(true);
    });

    it('does not count a place the case closed as closed by an event', () => {
      const run = { ...runWith([]), closedLocationIds: ['cheese-stall'] };
      expect(isLocationClosed(run, 'cheese-stall')).toBe(true);
    });

    it('moves a suspect to another place', () => {
      const moves = event({
        id: 'baker-leaves',
        effect: { kind: 'suspect-moves', suspectId: 'baker', locationId: 'side-alley' },
        duration: { kind: 'permanent' },
      });
      const run = runWith([moves]);
      const baker = run.case.suspects.find(({ id }) => id === 'baker');
      const mayor = run.case.suspects.find(({ id }) => id === 'mayor');
      if (!baker || !mayor) throw new Error('The fixture lost a suspect.');
      expect(suspectPlace(run, baker)).toBe('cheese-stall');

      const drawn = drawEvents(run, SURE()).run;
      expect(suspectPlace(drawn, baker)).toBe('side-alley');
      expect(suspectPlace(drawn, mayor)).toBeUndefined();
      const atStall = { ...drawn, locationId: 'cheese-stall' };
      const asked = resolveIntent(
        atStall,
        { kind: 'interrogate', suspectId: 'baker', approach: 'social', clueIds: [] },
        createRng('q'),
      );
      expect(asked).toMatchObject({ ok: false, refusal: { code: 'suspect-elsewhere' } });
    });

    it('shuts a source of information', () => {
      const shut = event({
        id: 'records-down',
        effect: { kind: 'source-closes', source: 'police-data' },
        duration: { kind: 'until-day', day: 2 },
      });
      const run = runWith([shut]);
      const drawn = drawEvents(run, SURE()).run;
      expect([...closedSourcesOf(drawn)]).toEqual(['police-data']);
      expect([...closedSourcesOf(onDay(drawn, 2))]).toEqual([]);
    });

    it('is harmful unless it is only news', () => {
      expect(isHarmfulEffect({ kind: 'flavor' })).toBe(false);
      expect(isHarmfulEffect({ kind: 'time-lost', minutes: 15 })).toBe(true);
    });
  });

  describe('what an event may never do', () => {
    const cutters = [
      event({
        id: 'stall-closed',
        effect: { kind: 'location-closes', locationId: 'cheese-stall' },
        duration: { kind: 'permanent' },
      }),
      event({
        id: 'square-closed',
        effect: { kind: 'location-closes', locationId: 'market-square' },
        duration: { kind: 'permanent' },
      }),
    ];

    it('is skipped when it would remove the last route to the solution', () => {
      for (const seed of Array.from({ length: 50 }, (_, index) => `cut-${String(index)}`)) {
        expect(drawEvents(runWith(cutters), createRng(seed)).events).toEqual([]);
      }
    });

    it('is skipped when it would leave a suspect nowhere reachable', () => {
      const run = runWith([
        event({
          id: 'alley-closes',
          effect: { kind: 'location-closes', locationId: 'side-alley' },
          duration: { kind: 'permanent' },
        }),
        event({
          id: 'baker-hides',
          effect: { kind: 'suspect-moves', suspectId: 'baker', locationId: 'side-alley' },
          duration: { kind: 'permanent' },
        }),
      ]);
      const closed = drawEvents(run, SURE()).run;
      expect(closed.drawnEvents.map(({ eventId }) => eventId)).toEqual(['alley-closes']);
      // the baker's new place is shut, so that event is out; and nothing else is left to draw
      expect(drawEvents(onDay(closed, 2), SURE()).events).toEqual([]);
    });

    it('is skipped when it would shut the only source of a needed clue', () => {
      const raw = buildCheeseCase();
      const cartTracks = raw.clues.find(({ id }) => id === 'cart-tracks');
      if (!cartTracks) throw new Error('The fixture lost a clue.');
      cartTracks.source = 'police-data';
      raw.randomEvents = [
        event({
          id: 'records-down',
          effect: { kind: 'source-closes', source: 'police-data' },
          duration: { kind: 'permanent' },
        }),
      ];
      const run = createDetectiveRun({
        hero: buildHero(),
        traits: [],
        case: DetectiveCaseSchema.parse(raw),
        seed: 'events',
        rngState: 1,
        locale: 'en',
      });
      expect(drawEvents(run, SURE()).events).toEqual([]);
    });
  });

  describe('the harm cap', () => {
    it('lets one harmful event fall on a day, and news besides', () => {
      expect(MAX_HARMFUL_EVENTS_PER_DAY).toBe(1);
      const run = runWith([TIME, event({ ...TIME, id: 'lost-key' } as EventInput), FLAVOR]);
      const drawn = drawEvents(run, scripted(1, 1, 1, 1));
      expect(drawn.events.map(({ eventId }) => eventId)).toEqual(['lost-bus', 'fair-music']);
      // the next day the cap is fresh
      expect(drawEvents(onDay(drawn.run, 2), SURE()).events.map(({ eventId }) => eventId)).toEqual([
        'lost-key',
      ]);
    });

    it('holds over many seeds and many days, and the case stays solvable', () => {
      const pool = [
        TIME,
        event({ ...TIME, id: 'lost-key' } as EventInput),
        event({ ...TIME, id: 'lost-map' } as EventInput),
        event({
          id: 'alley-closes',
          effect: { kind: 'location-closes', locationId: 'side-alley' },
          duration: { kind: 'until-day', day: 3 },
        }),
        event({
          id: 'baker-moves',
          effect: { kind: 'suspect-moves', suspectId: 'baker', locationId: 'side-alley' },
          duration: { kind: 'permanent' },
        }),
        event({
          id: 'stall-closes',
          effect: { kind: 'location-closes', locationId: 'cheese-stall' },
          duration: { kind: 'permanent' },
        }),
        event({
          id: 'nerves',
          effect: { kind: 'nerves-cost', points: 1 },
          duration: { kind: 'instant' },
        }),
        FLAVOR,
      ];
      const harmful = new Set([
        'lost-bus',
        'lost-key',
        'lost-map',
        'alley-closes',
        'baker-moves',
        'nerves',
        'stall-closes',
      ]);
      for (let index = 0; index < 150; index += 1) {
        const rng = createRng(`property-${String(index)}`);
        let run = runWith(pool, { days: 6 });
        for (let day = 1; day <= 6; day += 1) {
          run = onDay(run, day);
          const drawn = drawEvents(run, rng);
          run = drawn.run;
          expect(drawn.events.filter(({ eventId }) => harmful.has(eventId)).length).toBeLessThanOrEqual(
            MAX_HARMFUL_EVENTS_PER_DAY,
          );
          expect(isSolvable(run.case, run.hero, run.traits, standingOf(run))).toBe(true);
          expect(
            activeEffects(run).every(
              (effect) => effect.kind !== 'location-closes' || effect.locationId !== 'cheese-stall',
            ),
          ).toBe(true);
          expect(run.drawnEvents.filter(({ day: drawnDay }) => drawnDay === day).length).toBeLessThanOrEqual(
            2,
          );
        }
        expect(new Set(run.drawnEvents.map(({ eventId }) => eventId)).size).toBe(run.drawnEvents.length);
      }
    });
  });

  describe('towards the deadline', () => {
    function frequency(run: DetectiveRunState, pick: (events: readonly string[]) => boolean): number {
      let hits = 0;
      for (let index = 0; index < 1500; index += 1) {
        const ids = drawEvents(run, createRng(`freq-${String(index)}`)).events.map(({ eventId }) => eventId);
        if (pick(ids)) hits += 1;
      }
      return hits / 1500;
    }

    it('is a little likelier on the last day than on the first, never a flood', () => {
      const run = runWith([FLAVOR], { days: 5 });
      const first = frequency(onDay(run, 1), (ids) => ids.length > 0);
      const last = frequency(onDay(run, 5), (ids) => ids.length > 0);
      expect(last).toBeGreaterThan(first);
      // two slots at the peak chance, and the one event can happen only once
      const peak = (BASE_EVENT_CHANCE_PERCENT + DEADLINE_CHANCE_GROWTH_PERCENT) / 100;
      expect(last).toBeLessThanOrEqual(1 - (1 - peak) ** 2 + 0.05);
    });

    it('makes the chance roll the growth of the base and no more', () => {
      const run = runWith([FLAVOR], { days: 5 });
      const edge = BASE_EVENT_CHANCE_PERCENT + DEADLINE_CHANCE_GROWTH_PERCENT;
      expect(drawEvents(onDay(run, 1), scripted(edge, edge)).events).toEqual([]);
      expect(drawEvents(onDay(run, 5), scripted(edge, edge)).events).toHaveLength(1);
      expect(drawEvents(onDay(run, 5), scripted(edge + 1, edge + 1)).events).toEqual([]);
    });

    it('has a single-day case at its base chance', () => {
      const run = runWith([FLAVOR], { days: 1 });
      expect(drawEvents(run, scripted(BASE_EVENT_CHANCE_PERCENT, 1)).events).toHaveLength(1);
      expect(drawEvents(run, scripted(BASE_EVENT_CHANCE_PERCENT + 1, 100)).events).toEqual([]);
    });

    it('weighs harmful events a little more on the last day', () => {
      const run = runWith([FLAVOR, TIME], { days: 5 });
      const asHarm = (ids: readonly string[]): boolean => ids.includes('lost-bus');
      const first = frequency(onDay(run, 1), asHarm);
      const last = frequency(onDay(run, 5), asHarm);
      expect(last).toBeGreaterThan(first);
    });
  });

  it('favours events that name a trait of the hero', () => {
    const night: Trait = {
      id: 'night-owl',
      polarity: 'mixed',
      trigger: 'night',
      effects: [
        { kind: 'modifier', skills: 'all', amount: 1 },
        { kind: 'lock-out', source: 'police-data' },
      ],
      excludes: [],
    };
    const liked = event({ ...FLAVOR, id: 'owl-call', traitTriggers: ['night'] } as EventInput);
    const other = event({ ...FLAVOR, id: 'plain' } as EventInput);
    const share = (traits: readonly Trait[]): number => {
      let hits = 0;
      for (let index = 0; index < 1500; index += 1) {
        const run = runWith([liked, other], { traits });
        if (drawEvents(run, createRng(`owl-${String(index)}`)).events[0]?.eventId === 'owl-call') hits += 1;
      }
      return hits;
    };
    expect(share([night])).toBeGreaterThan(share([]));
  });

  it('is the same for the same run and dice', () => {
    const run = runWith([TIME, FLAVOR]);
    expect(drawEvents(run, createRng('same'))).toEqual(drawEvents(run, createRng('same')));
  });
});
