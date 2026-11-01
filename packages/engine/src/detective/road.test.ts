// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, type Rng } from '../dice.js';
import { WEATHERS, ZONE_PROFILES } from '../world/climate.js';
import type { Setting } from '../world/setting.js';
import { resolveIntent, type Resolution } from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { CONDITION_IDS } from './condition.js';
import {
  BAD_WEATHER_MISHAP_CHANCE,
  MISHAP_CHANCE,
  ROAD_MISHAPS,
  applyMishap,
  isOutdoor,
  walk,
} from './road.js';
import { createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';
import { ROAD_RULESET_VERSION, WEATHER_MINUTES, weatherOfDay } from './weather.js';

const SETTING: Setting = {
  id: 'valdmark',
  name: { en: 'Valdmark', ru: 'Вальдмарк' },
  climate: ZONE_PROFILES.continental,
};

function runOf(
  options: { seed?: string; setting?: Setting | null; edit?: (detectiveCase: DetectiveCase) => void } = {},
): DetectiveRunState {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  options.edit?.(detectiveCase);
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: options.seed ?? 'road',
    rngState: 1,
    locale: 'en',
    setting: options.setting === undefined ? SETTING : options.setting,
  });
}

/** Dice that answer d100 and the pick from a script. */
function scripted(...rolls: number[]): Rng {
  const queue = [...rolls];
  return {
    next: () => 0,
    roll: () => queue.shift() ?? 1,
    state: () => 1,
  };
}

const ok = (resolution: Resolution): Extract<Resolution, { ok: true }> => {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
};

const place = (run: DetectiveRunState, id: string) => {
  const found = run.case.locations.find((location) => location.id === id);
  if (!found) throw new Error(`No place ${id}`);
  return found;
};

describe('the weather of a day', () => {
  it('is the same for the same run and day, and is one of the weathers', () => {
    const run = runOf();

    for (let day = 1; day <= 14; day += 1) {
      const weather = weatherOfDay(run, day);
      expect(weather).toBe(weatherOfDay(run, day));
      expect(WEATHERS).toContain(weather);
    }
  });

  it('is mostly the weather of the season, now and then mild, and now and then that of another season', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 300; index += 1) {
      const run = runOf({ seed: `run-${String(index)}` });
      for (let day = 1; day <= 5; day += 1) seen.add(weatherOfDay(run, day) ?? 'none');
    }

    // The continental profile has snow, cold rain and warm weather; mild is the drawn-in fair day.
    expect([...seen].sort()).toEqual(['cold-rain', 'mild', 'snow', 'warm']);
  });

  it('differs between days and between runs', () => {
    const days = new Set(Array.from({ length: 14 }, (_, day) => weatherOfDay(runOf(), day + 1)));
    const runs = new Set(
      Array.from({ length: 40 }, (_, run) => weatherOfDay(runOf({ seed: `r${String(run)}` }), 1)),
    );

    expect(days.size).toBeGreaterThan(1);
    expect(runs.size).toBeGreaterThan(1);
  });

  it('is none for a case set nowhere and for a run of the ruleset before the road', () => {
    expect(weatherOfDay(runOf({ setting: null }), 1)).toBeUndefined();
    expect(weatherOfDay({ ...runOf(), rulesetVersion: ROAD_RULESET_VERSION - 1 }, 1)).toBeUndefined();
  });

  it('is shown in the view as an id, or null, with the exposure of the place the hero is in', () => {
    expect(viewRun(runOf()).location.exposure).toBe('outdoor');
    expect(
      viewRun(
        runOf({
          edit: (detectiveCase) => {
            const start = detectiveCase.locations.find(({ id }) => id === detectiveCase.startLocationId);
            if (start) start.exposure = 'indoor';
          },
        }),
      ).location.exposure,
    ).toBe('indoor');
    expect(WEATHERS).toContain(viewRun(runOf()).weather);
    expect(viewRun(runOf({ setting: null })).weather).toBeNull();
    expect(viewRun({ ...runOf(), rulesetVersion: 7 }).weather).toBeNull();
  });

  it('adds minutes to a walk by how bad it is, and nothing on a mild or a warm day', () => {
    expect(WEATHER_MINUTES.mild).toBe(0);
    expect(WEATHER_MINUTES.warm).toBe(0);
    expect(WEATHER_MINUTES.storms).toBeGreaterThan(WEATHER_MINUTES.windy);
    for (const weather of WEATHERS) expect(WEATHER_MINUTES[weather]).toBeLessThanOrEqual(15);
  });
});

describe('indoors and out of doors', () => {
  it('counts a place that does not say as out of doors, as every case before it was', () => {
    expect(isOutdoor({ exposure: 'outdoor' })).toBe(true);
    expect(isOutdoor({ exposure: 'indoor' })).toBe(false);
    expect(DetectiveCaseSchema.parse(buildCheeseCase()).locations.every(isOutdoor)).toBe(true);
  });

  it('touches a walk that starts or ends out of doors, and no walk between two indoor places', () => {
    const run = runOf({
      edit: (detectiveCase) => {
        for (const location of detectiveCase.locations) location.exposure = 'indoor';
        const square = detectiveCase.locations.find(({ id }) => id === 'market-square');
        if (square) square.exposure = 'outdoor';
      },
    });
    const dice = () => scripted(100);

    expect(walk(run, place(run, 'cheese-stall'), place(run, 'mayor-office'), dice()).extraMinutes).toBe(0);
    expect(walk(run, place(run, 'cheese-stall'), place(run, 'mayor-office'), dice()).weather).toBeUndefined();
    expect(walk(run, place(run, 'market-square'), place(run, 'cheese-stall'), dice()).weather).toBeDefined();
    expect(walk(run, place(run, 'cheese-stall'), place(run, 'market-square'), dice()).weather).toBeDefined();
  });
});

describe('a move on the road', () => {
  const moveOutdoors = (run: DetectiveRunState, rng: Rng) =>
    ok(resolveIntent(run, { kind: 'move', locationId: 'cheese-stall' }, rng));

  it("takes the weather's minutes more than a quarter of an hour, and says the weather", () => {
    for (let index = 0; index < 60; index += 1) {
      const run = runOf({ seed: `walk-${String(index)}` });
      const weather = weatherOfDay(run, 1);
      if (weather === undefined) throw new Error('The run has a setting.');

      const result = moveOutdoors(run, scripted(100));

      expect(result.outcome).toMatchObject({ kind: 'move', entered: true, weather });
      expect((result.outcome as { minutes: number }).minutes).toBe(15 + WEATHER_MINUTES[weather]);
    }
  });

  it('takes a flat quarter of an hour between two places indoors and draws nothing', () => {
    const run = runOf({
      edit: (detectiveCase) => {
        for (const location of detectiveCase.locations) location.exposure = 'indoor';
      },
    });
    const rng = createRng(5);
    const before = rng.state();

    const result = moveOutdoors(run, rng);

    expect(result.outcome).toMatchObject({ kind: 'move', minutes: 15 });
    expect(result.outcome).not.toHaveProperty('weather');
    expect(rng.state()).toBe(before);
  });

  it('plays a run of the ruleset before the road as it was: a flat quarter of an hour, no dice, no weather', () => {
    const rng = createRng(5);
    const before = rng.state();

    const result = moveOutdoors({ ...runOf(), rulesetVersion: ROAD_RULESET_VERSION - 1 }, rng);

    expect(result.outcome).toMatchObject({ kind: 'move', minutes: 15 });
    expect(result.outcome).not.toHaveProperty('weather');
    expect(rng.state()).toBe(before);
  });

  it('does not walk when the door was not opened, and so has no weather and no mishap', () => {
    const run = runOf({
      edit: (detectiveCase) => {
        const stall = detectiveCase.locations.find(({ id }) => id === 'cheese-stall');
        if (stall) stall.access = { kind: 'skill', check: { skill: 'perception', difficulty: 30 } };
      },
    });

    const result = moveOutdoors(run, scripted(1, 1));

    expect(result.outcome).toMatchObject({ kind: 'move', entered: false });
    expect(result.outcome).not.toHaveProperty('weather');
    expect(result.outcome).not.toHaveProperty('roadMishap');
  });

  it('can bring a small mishap, named by id, which costs what the mishap costs and no more', () => {
    const run = runOf({ setting: null });
    // d100 of 1 is a mishap; the pick is the first that fits.
    const result = moveOutdoors(run, scripted(1, 1));

    expect(result.outcome).toMatchObject({ kind: 'move', roadMishap: ROAD_MISHAPS[0]?.id });
    expect((result.outcome as { minutes: number }).minutes).toBe(15 + (ROAD_MISHAPS[0]?.minutes ?? 0));
  });

  it('is a mishap on one walk in a dozen on a fair day and one in seven on a bad one, over many runs', () => {
    expect(MISHAP_CHANCE).toBe(8);
    expect(BAD_WEATHER_MISHAP_CHANCE).toBe(15);
    let mishaps = 0;
    const total = 600;
    for (let index = 0; index < total; index += 1) {
      const run = runOf({ seed: `chance-${String(index)}`, setting: null });
      const outcome = moveOutdoors(run, createRng(`dice-${String(index)}`)).outcome;
      if ('roadMishap' in outcome) mishaps += 1;
    }

    expect(mishaps / total).toBeGreaterThan(0.04);
    expect(mishaps / total).toBeLessThan(0.14);
  });
});

describe('the mishaps of the road', () => {
  it('number at least eight, with distinct ids, and none that needs a weather no climate has', () => {
    expect(ROAD_MISHAPS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ROAD_MISHAPS.map(({ id }) => id)).size).toBe(ROAD_MISHAPS.length);
    for (const { weather } of ROAD_MISHAPS)
      for (const entry of weather ?? []) expect(WEATHERS).toContain(entry);
  });

  it('cost a little time or a little nerve and never more, and none is an injury or ends a run', () => {
    for (const mishap of ROAD_MISHAPS) {
      expect(mishap.minutes ?? 0).toBeLessThanOrEqual(20);
      expect(mishap.nerves ?? 1).toBe(1);
      expect(
        mishap.minutes !== undefined || mishap.nerves !== undefined || mishap.condition !== undefined,
      ).toBe(true);
      if (mishap.condition !== undefined) {
        expect(CONDITION_IDS).toContain(mishap.condition);
        expect(mishap.condition).not.toBe('injured');
        expect(['exhausted', 'shaken']).toContain(mishap.condition);
      }
      expect(mishap.id).not.toMatch(/bite|attack|hit|injur|blood|knife|gun|dead|death|kill/);
    }
  });

  it('fit the weather: a puddle needs rain or snow, and none that needs a weather comes on a day without it', () => {
    const puddle = ROAD_MISHAPS.find(({ id }) => id === 'deep-puddle');
    expect(puddle?.weather).toEqual(['cold-rain', 'storms', 'snow']);

    const seen = new Map<string, Set<string>>();
    for (let index = 0; index < 800; index += 1) {
      const run = runOf({ seed: `fit-${String(index)}` });
      const weather = weatherOfDay(run, 1) ?? 'none';
      const road = walk(
        run,
        place(run, 'market-square'),
        place(run, 'cheese-stall'),
        scripted(1, 1 + (index % 12)),
      );
      if (road.mishap !== undefined) {
        seen.set(road.mishap.id, new Set([...(seen.get(road.mishap.id) ?? []), weather]));
      }
    }
    for (const mishap of ROAD_MISHAPS) {
      for (const weather of seen.get(mishap.id) ?? []) {
        expect(mishap.weather === undefined || mishap.weather.includes(weather as never)).toBe(true);
      }
    }
  });

  it('spend a point of nerves or start a mild condition on the hero, and nothing else', () => {
    const run = runOf();
    const nerve = ROAD_MISHAPS.find(({ nerves }) => nerves !== undefined);
    const mild = ROAD_MISHAPS.find(({ condition }) => condition !== undefined);
    const timeOnly = ROAD_MISHAPS.find(({ id }) => id === 'wrong-turn');
    if (!nerve || !mild || !timeOnly) throw new Error('The set has each kind.');

    expect(applyMishap(run, nerve).condition.nerves).toBeLessThan(run.condition.nerves);
    expect(applyMishap(run, mild).condition.active.map(({ id }) => id)).toContain(mild.condition);
    expect(applyMishap(run, timeOnly)).toEqual(run);
    expect(applyMishap(run, mild).reputation).toBe(run.reputation);
    expect(applyMishap(run, mild).status).toBe('active');
  });
});
