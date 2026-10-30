// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from '../assert-never.js';
import type { Rng } from '../dice.js';
import { MINUTES_PER_DAY } from '../run.js';
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
  let current = run;
  const events: DrawnEvent[] = [];
  if (run.status !== 'active') return { run, events };
  for (let slot = 0; slot < EVENT_SLOTS_PER_DRAW; slot += 1) {
    if (poolOf(current).length === 0) break;
    const chance =
      BASE_EVENT_CHANCE_PERCENT + Math.round(pressureOf(current) * DEADLINE_CHANCE_GROWTH_PERCENT);
    if (rng.roll(100) > chance) continue;
    const [first, ...others] = candidatesOf(current);
    if (first === undefined) continue;
    const { id, effect } = pick(first, others, rng);
    current = applyEffect(recordDrawnEvent(current, id), effect);
    events.push({ eventId: id, day: current.clock.day });
  }
  return { run: current, events };
}
