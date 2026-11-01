// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { createRng } from '../dice.js';
import type { Weather } from '../world/climate.js';
import type { DetectiveRunState } from './run-state.js';

// The road is part of the game. The weather of the day, drawn from the climate of the country the case is set in,
// makes a walk outdoors take longer, and now and then something small and comic happens on the way. It costs
// time and nerves and nothing else: a mishap is never an injury, never violence and never anything that could
// end a run on its own. Runs of an older ruleset play as before: a flat fifteen minutes and no mishaps.

/** Runs started before this version have no weather and no mishaps on the road. */
export const ROAD_RULESET_VERSION = 8;

/** What the weather adds to a walk outdoors, in minutes. */
export const WEATHER_MINUTES: Readonly<Record<Weather, number>> = {
  mild: 0,
  warm: 0,
  hot: 5,
  humid: 5,
  windy: 5,
  fog: 5,
  'dry-heat': 10,
  'cold-rain': 10,
  snow: 10,
  frost: 10,
  storms: 15,
};

export const isActive = (run: Pick<DetectiveRunState, 'rulesetVersion'>): boolean =>
  run.rulesetVersion >= ROAD_RULESET_VERSION;

// Every index used here is inside its list: a die has one face per item, and a run that has a setting has at
// least two seasons (the schema says so).
export function at<T>(items: readonly T[], index: number): T {
  return items[index] as T;
}

/**
 * The weather of a day of the run: mostly that of the season the run is in (drawn once on the run's seed from the
 * seasons of the country's climate), now and then a mild day or a day from another season, drawn on dice of the
 * day, so a run always has the same days. None for a run of an older ruleset and for a case set nowhere.
 */
export function weatherOfDay(run: DetectiveRunState, day: number): Weather | undefined {
  if (!isActive(run) || run.setting === null) return undefined;
  const { seasons } = run.setting.climate;
  const index = createRng(`${run.seed}:season`).roll(seasons.length) - 1;
  const roll = createRng(`${run.seed}:weather:${String(day)}`).roll(10);
  if (roll <= 6) return at(seasons, index).weather;
  if (roll <= 8) return 'mild';
  return at(seasons, (index + 1) % seasons.length).weather;
}
