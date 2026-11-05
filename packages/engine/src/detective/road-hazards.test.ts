// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import type { Rng } from '../dice.js';
import { HAZARDS, WEATHERS, ZONE_PROFILES, type Hazard } from '../world/climate.js';
import type { Setting } from '../world/setting.js';
import { resolveIntent, type Resolution } from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { HAZARD_EXTRA_MINUTES, HAZARD_MISHAPS, HAZARD_MISHAP_CHANCE, walk } from './road.js';
import { createDetectiveRun, type DetectiveRunState } from './run-state.js';
import {
  HAZARD_RULESET_VERSION,
  HAZARD_WEATHERS,
  WEATHER_MINUTES,
  hazardOfDay,
  weatherOfDay,
} from './weather.js';

const SETTING: Setting = {
  id: 'valdmark',
  name: { en: 'Valdmark', ru: 'Вальдмарк' },
  climate: ZONE_PROFILES.continental,
};

const withHazards = (hazards: Hazard[]): Setting => ({
  ...SETTING,
  climate: { ...SETTING.climate, hazards },
});

type DayWeather = 'snow' | 'frost' | 'cold-rain';

/** A run whose first day has the given weather, named by a world event. */
function runOf(
  options: { seed?: string; weather?: DayWeather; setting?: Setting | null; ruleset?: number } = {},
): DetectiveRunState {
  const detectiveCase: DetectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  if (options.weather !== undefined) {
    detectiveCase.clock.worldEvents = [
      { day: 1, description: 'The weather turns.', weather: options.weather },
    ];
  }
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: options.seed ?? 'hazards',
    rngState: 1,
    locale: 'en',
    setting: options.setting === undefined ? SETTING : options.setting,
  });
  return options.ruleset === undefined ? run : { ...run, rulesetVersion: options.ruleset };
}

/** Dice that answer each roll from a script. */
function scripted(...rolls: number[]): Rng {
  const queue = [...rolls];
  return { next: () => 0, roll: () => queue.shift() ?? 1, state: () => 1 };
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

const icy = (): DetectiveRunState => runOf({ weather: 'frost', setting: withHazards(['ice']) });
const stroll = (run: DetectiveRunState, rng: Rng) =>
  walk(run, place(run, 'market-square'), place(run, 'cheese-stall'), rng);

describe('the hazards of the climate on the road', () => {
  it('name, for each hazard, weather that is in the list of weathers', () => {
    expect(Object.keys(HAZARD_WEATHERS).sort()).toEqual([...HAZARDS].sort());
    for (const hazard of HAZARDS) {
      expect(HAZARD_WEATHERS[hazard].length).toBeGreaterThan(0);
      for (const weather of HAZARD_WEATHERS[hazard]) expect(WEATHERS).toContain(weather);
    }
  });

  it('are out on a day of the weather they come with, the first of the climate that fits', () => {
    const snow = runOf({ weather: 'snow', setting: withHazards(['ice', 'blizzard']) });
    const frost = runOf({ weather: 'frost', setting: withHazards(['blizzard', 'ice']) });
    const rain = runOf({ weather: 'cold-rain', setting: withHazards(['blizzard', 'ice']) });

    expect(hazardOfDay(snow, 'snow')).toBe('ice');
    expect(hazardOfDay(frost, 'frost')).toBe('ice');
    expect(hazardOfDay(rain, 'cold-rain')).toBeUndefined();
    expect(hazardOfDay(runOf({ weather: 'snow', setting: null }), 'snow')).toBeUndefined();
    expect(hazardOfDay({ ...snow, rulesetVersion: HAZARD_RULESET_VERSION - 1 }, 'snow')).toBeUndefined();
  });

  it('make the walk longer and say the hazard, and do not touch a day without one', () => {
    const dry = runOf({ weather: 'cold-rain', setting: withHazards(['ice']) });

    const slow = stroll(icy(), scripted(100));
    const plain = stroll(dry, scripted(100));

    expect(slow).toMatchObject({ weather: 'frost', hazard: 'ice', extraMinutes: WEATHER_MINUTES.frost + 5 });
    expect(plain).toMatchObject({ weather: 'cold-rain', extraMinutes: WEATHER_MINUTES['cold-rain'] });
    expect(plain).not.toHaveProperty('hazard');
  });

  it("bring the hazard's own mishap on a coin, and the weather's the rest of the time", () => {
    // d100 of 1 is a mishap; then the coin: 1 is the hazard's own, 2 leaves the pick among the weather's.
    expect(stroll(icy(), scripted(1, 1)).mishap?.id).toBe('slip-and-fall');
    const other = stroll(icy(), scripted(1, 2, 1)).mishap;
    expect(other).toBeDefined();
    expect(HAZARD_MISHAPS.map(({ id }) => id)).not.toContain(other?.id);
  });

  it('happen more often than on an ordinary bad day: one walk in four', () => {
    expect(HAZARD_MISHAP_CHANCE).toBe(25);
    expect(stroll(icy(), scripted(HAZARD_MISHAP_CHANCE, 2, 1)).mishap).toBeDefined();
    expect(stroll(icy(), scripted(HAZARD_MISHAP_CHANCE + 1)).mishap).toBeUndefined();
  });

  it('cost a fall a point of nerves and the minutes of the walk, in a move that is made', () => {
    const run = icy();

    const result = ok(resolveIntent(run, { kind: 'move', locationId: 'cheese-stall' }, scripted(1, 1)));

    expect(result.outcome).toMatchObject({
      kind: 'move',
      hazard: 'ice',
      roadMishap: 'slip-and-fall',
      minutes: 15 + WEATHER_MINUTES.frost + HAZARD_EXTRA_MINUTES + 15,
    });
    expect(result.run.condition.nerves).toBeLessThan(run.condition.nerves);
  });

  it('are as they were for a run of the ruleset before them', () => {
    const old = runOf({
      weather: 'frost',
      setting: withHazards(['ice']),
      ruleset: HAZARD_RULESET_VERSION - 1,
    });

    const road = stroll(old, scripted(100));

    expect(road).toMatchObject({ weather: 'frost', extraMinutes: WEATHER_MINUTES.frost });
    expect(road).not.toHaveProperty('hazard');
  });

  it('have one mishap each, mild like the others: a little time or nerve, never an injury', () => {
    expect(new Set(HAZARD_MISHAPS.map(({ hazard }) => hazard))).toEqual(new Set(HAZARDS));
    expect(new Set(HAZARD_MISHAPS.map(({ id }) => id)).size).toBe(HAZARD_MISHAPS.length);
    for (const mishap of HAZARD_MISHAPS) {
      expect(mishap.minutes ?? 0).toBeLessThanOrEqual(20);
      expect(mishap.nerves ?? 1).toBe(1);
      expect(
        mishap.minutes !== undefined || mishap.nerves !== undefined || mishap.condition !== undefined,
      ).toBe(true);
      if (mishap.condition !== undefined) expect(['exhausted', 'shaken']).toContain(mishap.condition);
      expect(mishap.id).not.toMatch(/bite|attack|hit|injur|blood|knife|gun|dead|death|kill/);
    }
  });

  it("never bring the mishap of a hazard that is not the day's, over many seeds", () => {
    const own = new Map(HAZARD_MISHAPS.map(({ id, hazard }) => [id, hazard]));
    let hazardous = 0;
    for (let index = 0; index < 300; index += 1) {
      const run = runOf({ seed: `hazard-${String(index)}`, setting: withHazards(['ice', 'heatwave']) });
      const hazard = hazardOfDay(run, weatherOfDay(run, 1) ?? 'mild');
      const { mishap } = stroll(run, scripted(1, 1 + (index % 2), 1 + (index % 7)));
      if (hazard !== undefined) hazardous += 1;
      if (mishap !== undefined && own.has(mishap.id)) expect(own.get(mishap.id)).toBe(hazard);
    }
    expect(hazardous).toBeGreaterThan(0);
  });
});
