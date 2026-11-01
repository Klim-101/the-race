// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Rng } from '../dice.js';
import type { Weather } from '../world/climate.js';
import type { Location } from './case-schema.js';
import type { ConditionId } from './condition.js';
import { startCondition, strainNerves, type DetectiveRunState } from './run-state.js';
import { WEATHER_MINUTES, at, isActive, weatherOfDay } from './weather.js';

/** A walk in weather that slows it by this much or more is a bad day for the road. */
const BAD_WEATHER_MINUTES = 10;
/** The chance, in a hundred, that something happens on a walk outdoors: an ordinary day, and a bad one. */
export const MISHAP_CHANCE = 8;
export const BAD_WEATHER_MISHAP_CHANCE = 15;

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

/** Whether a place is out of doors; a place that does not say is, as every place of an older case was. */
export const isOutdoor = (location: Pick<Location, 'exposure'>): boolean => location.exposure !== 'indoor';

export interface Road {
  /** The weather the walk was in, when it was out of doors and the day has one. */
  readonly weather?: Weather;
  /** Minutes the weather added. */
  readonly extraMinutes: number;
  readonly mishap?: RoadMishap;
}

/**
 * What the road does to a walk from one place to another: nothing if both are indoors or the ruleset is older;
 * otherwise the weather's minutes, and a chance of one of the mishaps that fit the weather. The only draw on the
 * run's dice is the chance and the pick, made when the walk is out of doors.
 */
export function walk(run: DetectiveRunState, from: Location, to: Location, rng: Rng): Road {
  if (!isActive(run) || !(isOutdoor(from) || isOutdoor(to))) return { extraMinutes: 0 };
  const weather = weatherOfDay(run, run.clock.day);
  const extraMinutes = weather === undefined ? 0 : WEATHER_MINUTES[weather];
  const bad = extraMinutes >= BAD_WEATHER_MINUTES;
  const base = weather === undefined ? {} : { weather };
  if (rng.roll(100) > (bad ? BAD_WEATHER_MISHAP_CHANCE : MISHAP_CHANCE)) return { ...base, extraMinutes };
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
