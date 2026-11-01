// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from '../assert-never.js';
import type { Rng } from '../dice.js';
import { MINUTES_PER_DAY, type RunClock } from '../run.js';
import { closedSources } from './obtainability.js';
import { isLastingEffect, type RandomEvent, type RandomEventEffect, type Suspect } from './case-schema.js';
import {
  recordDrawnEvent,
  spendTime,
  startCondition,
  strainNerves,
  type DetectiveRunState,
  type DrawnEvent,
} from './run-state.js';
import { isSolvable, scheduledClosures, withEffect, type Standing } from './solvability.js';

// Random events are the small troubles of the world: a road is dug up, a witness moves, an hour is lost.
// The case writes the pool and the engine draws from it, once a night, on the run's dice. An event never
// touches the truth or the content of a clue, and the engine re-checks before applying one that it cannot
// cut the hero off from the solution, so a draw can make a case harder but never unsolvable.

/** At most this many harmful events fall on one day. */
export const MAX_HARMFUL_EVENTS_PER_DAY = 1;
/** A draw tries this many times to bring an event about. */
export const EVENT_SLOTS_PER_DRAW = 2;
/** The chance of an event in one slot at the start of the case, in percent. */
export const BASE_EVENT_CHANCE_PERCENT = 35;
/** The first ruleset in which events are also drawn in the day. */
export const DAY_EVENTS_RULESET_VERSION = 6;
/** The first ruleset in which each day is promised an event and the night leaves the pool for the days to come. */
export const EVERY_DAY_RULESET_VERSION = 10;
/** The clock marks at which the day may bring an event: midday and the evening. */
export const DAY_EVENT_MARKS = [12 * 60, 18 * 60] as const;
/** The chance of an event at one mark of the day, in percent, before the growth towards the deadline. */
export const DAY_EVENT_CHANCE_PERCENT = 25;
/** The extra percentage points of chance on the last day; it grows in a straight line from the first. */
export const DEADLINE_CHANCE_GROWTH_PERCENT = 15;
/** Harmful events weigh up to this much more on the last day, as a fraction of their weight. */
export const DEADLINE_HARM_WEIGHT_GROWTH = 0.5;
/** An event weighs this many times more when a trait of the hero is one it names. */
export const TRAIT_WEIGHT_FACTOR = 2;

/** An effect is harmful unless it is only news. */
export function isHarmfulEffect(effect: RandomEventEffect): boolean {
  return effect.kind !== 'flavor';
}

function poolOf(run: DetectiveRunState): readonly RandomEvent[] {
  return run.case.randomEvents ?? [];
}

function eventById(run: DetectiveRunState, eventId: string): RandomEvent[] {
  return poolOf(run).filter(({ id }) => id === eventId);
}

/** Effects that still hold on the day the run is at, in the order they happened. */
export function activeEffects(run: DetectiveRunState): RandomEventEffect[] {
  return run.drawnEvents.flatMap(({ eventId }) =>
    eventById(run, eventId).flatMap(({ effect, duration }) => {
      if (duration.kind === 'permanent') return [effect];
      return duration.kind === 'until-day' && duration.day > run.clock.day ? [effect] : [];
    }),
  );
}

/** A place that a scheduled event or a random event has shut. */
export function isLocationClosed(run: DetectiveRunState, locationId: string): boolean {
  return (
    run.closedLocationIds.includes(locationId) ||
    activeEffects(run).some((effect) => effect.kind === 'location-closes' && effect.locationId === locationId)
  );
}

/** Information sources shut to the hero: by their traits, and by random events that still hold. */
export function closedSourcesOf(run: DetectiveRunState): ReadonlySet<string> {
  return new Set([
    ...closedSources(run.traits),
    ...activeEffects(run).flatMap((effect) => (effect.kind === 'source-closes' ? [effect.source] : [])),
  ]);
}

/** Where the suspect can be found now: where a random event moved them, or where the case puts them. */
export function suspectPlace(run: DetectiveRunState, suspect: Suspect): string | undefined {
  return activeEffects(run).reduce<string | undefined>(
    (place, effect) =>
      effect.kind === 'suspect-moves' && effect.suspectId === suspect.id ? effect.locationId : place,
    suspect.locationId,
  );
}

/** What stands in the hero's way: every scheduled closure, pessimistically, and the random events that hold. */
export function standingOf(run: DetectiveRunState): Standing {
  const base: Standing = {
    closedLocationIds: new Set([...scheduledClosures(run.case), ...run.closedLocationIds]),
    closedSources: new Set(),
    suspectPlaces: new Map(),
  };
  return activeEffects(run).reduce(withEffect, base);
}

interface Candidate {
  readonly event: RandomEvent;
  /** Weight in hundredths, so that a draw on integer dice stays exact. */
  readonly share: number;
}

/** How far the case has gone, from 0 on the first day to 1 on the last. */
function pressureOf(run: DetectiveRunState): number {
  const { days } = run.case.clock;
  return days <= 1 ? 0 : Math.min(1, Math.max(0, (run.clock.day - 1) / (days - 1)));
}

function harmfulToday(run: DetectiveRunState): number {
  return run.drawnEvents.filter(
    ({ eventId, day }) =>
      day === run.clock.day && eventById(run, eventId).some(({ effect }) => isHarmfulEffect(effect)),
  ).length;
}

/** The events that may happen now, with their share of the draw. */
function candidatesOf(run: DetectiveRunState): Candidate[] {
  const day = run.clock.day;
  const pressure = pressureOf(run);
  const atCap = harmfulToday(run) >= MAX_HARMFUL_EVENTS_PER_DAY;
  const standing = standingOf(run);
  const drawnIds = new Set(run.drawnEvents.map(({ eventId }) => eventId));
  const candidates: Candidate[] = [];
  for (const event of poolOf(run)) {
    const harmful = isHarmfulEffect(event.effect);
    if (drawnIds.has(event.id) || (harmful && atCap)) continue;
    if (event.tones.length > 0 && !event.tones.includes(run.case.tone)) continue;
    if (day < event.fromDay || (event.untilDay !== null && day > event.untilDay)) continue;
    if (event.duration.kind === 'until-day' && event.duration.day <= day) continue;
    // The check that matters most: whatever the dice say, an event that would cut the last route is out.
    if (
      isLastingEffect(event.effect) &&
      !isSolvable(run.case, run.hero, run.traits, withEffect(standing, event.effect))
    ) {
      continue;
    }
    const isLikely = run.traits.some(({ trigger }) => event.traitTriggers.includes(trigger));
    const factor =
      (isLikely ? TRAIT_WEIGHT_FACTOR : 1) * (harmful ? 1 + DEADLINE_HARM_WEIGHT_GROWTH * pressure : 1);
    candidates.push({ event, share: Math.round(event.weight * factor * 100) });
  }
  return candidates;
}

function pick(first: Candidate, others: readonly Candidate[], rng: Rng): RandomEvent {
  const all = [first, ...others];
  let rolled = rng.roll(all.reduce((sum, { share }) => sum + share, 0));
  let chosen = first;
  for (const candidate of all) {
    chosen = candidate;
    rolled -= candidate.share;
    if (rolled <= 0) break;
  }
  return chosen.event;
}

/** Applies what happens once; what lasts is read from `drawnEvents` and needs nothing more. */
function applyEffect(run: DetectiveRunState, effect: RandomEventEffect): DetectiveRunState {
  switch (effect.kind) {
    case 'flavor':
    case 'location-closes':
    case 'suspect-moves':
    case 'source-closes':
      return run;
    case 'time-lost': {
      // The night is not this event's to end: the loss stops short of midnight.
      const minutes = Math.min(effect.minutes, Math.max(0, MINUTES_PER_DAY - 1 - run.clock.minute));
      return minutes === 0 ? run : spendTime(run, minutes);
    }
    case 'nerves-cost': {
      // Never the last point: an event frays the nerves but does not break the hero.
      let strained = run;
      for (let point = 0; point < effect.points && strained.condition.nerves > 1; point += 1) {
        strained = strainNerves(strained, 'event');
      }
      return strained;
    }
    case 'condition':
      return startCondition(run, effect.condition);
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(effect);
  }
}

export interface EventDraw {
  /** The run with the drawn events recorded and their effects applied. */
  readonly run: DetectiveRunState;
  /** What was drawn, in order; empty when nothing happened. */
  readonly events: readonly DrawnEvent[];
}

/**
 * The one entry point for random events: the night calls it once, with the run's dice. Each of a few slots
 * may bring an event, more likely as the deadline nears, picked from the pool by weight among those that
 * fit the day, the tone and the hero's traits. An event happens once per run, harmful ones are capped per
 * day, and one that would cut the hero off from the solution is never a candidate, so the draw is
 * deterministic in the run and the dice. A run that is over, or a case without a pool, draws nothing.
 */
export function drawEvents(run: DetectiveRunState, rng: Rng): EventDraw {
  return drawSlots(run, rng, EVENT_SLOTS_PER_DRAW, BASE_EVENT_CHANCE_PERCENT, 'night');
}

/** The days of the case from this one to the last, this one included. */
function daysLeftOf(run: DetectiveRunState): number {
  return Math.max(1, run.case.clock.days - run.clock.day + 1);
}

/** Events of the pool that have not happened yet. */
function eventsLeftOf(run: DetectiveRunState): number {
  const drawn = new Set(run.drawnEvents.map(({ eventId }) => eventId));
  return poolOf(run).filter(({ id }) => !drawn.has(id)).length;
}

/** Whether the day has had an event at a mark of the clock already. */
function dayEventToday(run: DetectiveRunState): boolean {
  return run.drawnEvents.some(({ day, phase }) => day === run.clock.day && phase === 'day');
}

/**
 * The events of the day: one slot for each mark of the clock (midday, the evening) that the turn carried the
 * hero past without a night, on the same pool and with the same limits as the night's. `before` is the clock
 * at the start of the turn; a run of a ruleset from before the day's events draws none.
 */
export function drawDayEvents(run: DetectiveRunState, before: RunClock, rng: Rng): EventDraw {
  const sameDay = run.clock.day === before.day;
  const crossed = DAY_EVENT_MARKS.filter((mark) => before.minute < mark && run.clock.minute >= mark).length;
  if (!sameDay || crossed === 0 || run.rulesetVersion < DAY_EVENTS_RULESET_VERSION)
    return { run, events: [] };
  // From the ruleset of the daily event, an evening with none drawn that day brings one for certain.
  const promised =
    run.rulesetVersion >= EVERY_DAY_RULESET_VERSION &&
    before.minute < DAY_EVENT_MARKS[1] &&
    run.clock.minute >= DAY_EVENT_MARKS[1];
  const drawn = drawSlots(run, rng, crossed, DAY_EVENT_CHANCE_PERCENT, 'day', promised);
  // The dice rolled for a slot that brought nothing are spent all the same: the run must carry on from here.
  return { ...drawn, run: { ...drawn.run, rngState: rng.state() } };
}

/**
 * The event a day is owed when the hero turns in before the evening mark was reached (a rest, or a collapse):
 * it comes as they lie down, on the day that is closing, so a day cut short is not a day without one. From the
 * ruleset of the daily event only, and only for a day that has had none at a mark of the clock.
 */
export function drawOwedDayEvent(run: DetectiveRunState, rng: Rng): EventDraw {
  if (run.rulesetVersion < EVERY_DAY_RULESET_VERSION || dayEventToday(run)) return { run, events: [] };
  const drawn = drawSlots(run, rng, 1, DAY_EVENT_CHANCE_PERCENT, 'day', true);
  return { ...drawn, run: { ...drawn.run, rngState: rng.state() } };
}

function drawSlots(
  run: DetectiveRunState,
  rng: Rng,
  slots: number,
  baseChance: number,
  phase: 'day' | 'night',
  promiseLast = false,
): EventDraw {
  let current = run;
  const events: DrawnEvent[] = [];
  if (run.status !== 'active') return { run, events };
  const reserving = run.rulesetVersion >= EVERY_DAY_RULESET_VERSION;
  for (let slot = 0; slot < slots; slot += 1) {
    if (poolOf(current).length === 0) break;
    const owed = promiseLast && slot === slots - 1 && !dayEventToday(current);
    // Each day to come keeps one event of the pool. The night is for the morning of a day that is still owed
    // its own, so it keeps one more; a day's chance draw leaves what the days after it are owed.
    const spare = eventsLeftOf(current) - daysLeftOf(current);
    if (reserving && phase === 'night' && spare < 1) break;
    if (reserving && phase === 'day' && !owed && spare < 0) continue;
    const chance = owed ? 100 : baseChance + Math.round(pressureOf(current) * DEADLINE_CHANCE_GROWTH_PERCENT);
    if (rng.roll(100) > chance) continue;
    const [first, ...others] = candidatesOf(current);
    if (first === undefined) continue;
    const { id, effect } = pick(first, others, rng);
    current = applyEffect(recordDrawnEvent(current, id, phase), effect);
    events.push({ eventId: id, day: current.clock.day, phase });
  }
  return { run: current, events };
}
