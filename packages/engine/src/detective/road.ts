// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Rng } from '../dice.js';
import type { Hazard, Weather } from '../world/climate.js';
import type { Location } from './case-schema.js';
import type { ConditionId } from './condition.js';
import { startCondition, strainNerves, type DetectiveRunState } from './run-state.js';
import { WEATHER_MINUTES, at, hazardOfDay, isActive, weatherOfDay } from './weather.js';

/** A walk in weather that slows it by this much or more is a bad day for the road. */
const BAD_WEATHER_MINUTES = 10;
/** The chance, in a hundred, that something happens on a walk outdoors: an ordinary day, and a bad one. */
export const MISHAP_CHANCE = 8;
export const BAD_WEATHER_MISHAP_CHANCE = 15;
/** A day on which a hazard of the country is out: the walk is longer by this much, and something happens more often. */
export const HAZARD_EXTRA_MINUTES = 5;
export const HAZARD_MISHAP_CHANCE = 25;

export interface RoadMishap {
  readonly id: string;
  /** The weather it needs; without one it can happen on any day. */
  readonly weather?: readonly Weather[];
  readonly minutes?: number;
  /** Points of nerves it costs; none is more than one. */
  readonly nerves?: 1;
  /** A short condition it starts: only the mild ones, never an injury. */
  readonly condition?: Extract<ConditionId, 'exhausted' | 'shaken'>;
}

/** The small, comic things that can happen on the road. Each costs a little time or a little nerve, never more. */
export const ROAD_MISHAPS: readonly RoadMishap[] = [
  { id: 'wrong-turn', minutes: 15 },
  { id: 'missed-bus', minutes: 20 },
  { id: 'stranger-asks-directions', minutes: 10 },
  { id: 'dog-follows', nerves: 1 },
  { id: 'pigeon-incident', nerves: 1 },
  { id: 'deep-puddle', weather: ['cold-rain', 'storms', 'snow'], minutes: 10 },
  { id: 'umbrella-inside-out', weather: ['cold-rain', 'storms', 'windy'], nerves: 1 },
  { id: 'hat-in-the-wind', weather: ['windy', 'storms'], minutes: 10 },
  { id: 'icy-step', weather: ['frost', 'snow'], minutes: 10, nerves: 1 },
  { id: 'lost-in-the-fog', weather: ['fog'], minutes: 20 },
  { id: 'heat-and-no-shade', weather: ['hot', 'dry-heat', 'humid'], condition: 'exhausted' },
  { id: 'shaken-by-a-bicycle-bell', condition: 'shaken' },
];

/** A mishap that belongs to a hazard of the climate and happens only on a day when that hazard is out. */
export interface HazardMishap extends RoadMishap {
  readonly hazard: Hazard;
}

/**
 * What a hazard does to a walk, one for each: a slip on ice that costs a fall and a point of nerves, drifts, a
 * downpour. They cost a little more than the ordinary ones, and no more than that: never an injury.
 */
export const HAZARD_MISHAPS: readonly HazardMishap[] = [
  { id: 'slip-and-fall', hazard: 'ice', minutes: 15, nerves: 1 },
  { id: 'drift-in-the-way', hazard: 'blizzard', minutes: 20 },
  { id: 'caught-in-a-downpour', hazard: 'heavy-rain', minutes: 15, nerves: 1 },
  { id: 'dizzy-in-the-heat', hazard: 'heatwave', minutes: 10, condition: 'exhausted' },
  { id: 'dust-and-thirst', hazard: 'drought', condition: 'exhausted' },
  { id: 'gale-takes-the-papers', hazard: 'gale', minutes: 15, nerves: 1 },
  { id: 'fog-so-thick-it-hums', hazard: 'fog', minutes: 20 },
  { id: 'dust-in-the-eyes', hazard: 'dust-wind', minutes: 10, nerves: 1 },
];

/** Whether a place is out of doors; a place that does not say is, as every place of an older case was. */
export const isOutdoor = (location: Pick<Location, 'exposure'>): boolean => location.exposure !== 'indoor';

export interface Road {
  /** The weather the walk was in, when it was out of doors and the day has one. */
  readonly weather?: Weather;
  /** The hazard of the country that the weather of the day brought out. */
  readonly hazard?: Hazard;
  /** Minutes the weather added. */
  readonly extraMinutes: number;
  readonly mishap?: RoadMishap;
}

/**
 * What the road does to a walk from one place to another: nothing if both are indoors or the ruleset is older;
 * otherwise the weather's minutes, and a chance of one of the mishaps that fit the weather. On a day when a hazard of
 * the country is out the walk is longer still, something happens more often, and half of what happens is the
 * hazard's own. The only draws on the run's dice are the chance and the pick, made when the walk is out of doors.
 */
export function walk(run: DetectiveRunState, from: Location, to: Location, rng: Rng): Road {
  if (!isActive(run) || !(isOutdoor(from) || isOutdoor(to))) return { extraMinutes: 0 };
  const weather = weatherOfDay(run, run.clock.day);
  const hazard = weather === undefined ? undefined : hazardOfDay(run, weather);
  const extraMinutes =
    (weather === undefined ? 0 : WEATHER_MINUTES[weather]) +
    (hazard === undefined ? 0 : HAZARD_EXTRA_MINUTES);
  const bad = extraMinutes >= BAD_WEATHER_MINUTES;
  const base = {
    ...(weather === undefined ? {} : { weather }),
    ...(hazard === undefined ? {} : { hazard }),
  };
  const chance =
    hazard !== undefined ? HAZARD_MISHAP_CHANCE : bad ? BAD_WEATHER_MISHAP_CHANCE : MISHAP_CHANCE;
  if (rng.roll(100) > chance) return { ...base, extraMinutes };
  // The hazard's own mishap, on a coin: the rest of the time it is whatever the weather brings, as on any day.
  const own =
    hazard === undefined || rng.roll(2) !== 1 ? undefined : HAZARD_MISHAPS.find((m) => m.hazard === hazard);
  if (own !== undefined) return { ...base, extraMinutes, mishap: own };
  const fitting = ROAD_MISHAPS.filter(
    (mishap) => mishap.weather === undefined || (weather !== undefined && mishap.weather.includes(weather)),
  );
  return { ...base, extraMinutes, mishap: at(fitting, rng.roll(fitting.length) - 1) };
}

/** What a mishap does to the hero beside the minutes it costs: a point of nerves, or a short mild condition. */
export function applyMishap(run: DetectiveRunState, mishap: RoadMishap): DetectiveRunState {
  const strained = mishap.nerves === undefined ? run : strainNerves(run, 'event');
  return mishap.condition === undefined ? strained : startCondition(strained, mishap.condition);
}
