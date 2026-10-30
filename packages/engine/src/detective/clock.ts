// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from '../assert-never.js';
import { DAY_START_MINUTE, MINUTES_PER_DAY, statusOfEndReason, type EndReason } from '../run.js';
import type { DetectiveCase } from './case-schema.js';
import { closeLocation, endRun, type DetectiveRunState } from './run-state.js';

// Time is a resource and it flows only by the player's actions. A day has active hours; when an action
// carries the clock past them the night passes and the next day begins. What the next day brings (its
// scheduled events, or the end of the case) is decided here, from the case and the days alone, so the
// log can recompute it and a replay agrees with the run.

/** From the start of a day at 08:00 to midnight: 16 hours of work, then the night. */
export const ACTIVE_MINUTES_PER_DAY = MINUTES_PER_DAY - DAY_START_MINUTE;

export interface DaysPassed {
  /** Indices into `clock.worldEvents` of the events that fired, in the order they fired. */
  readonly firedEventIndexes: readonly number[];
  /** Places that the fired events closed. */
  readonly closedLocationIds: readonly string[];
  /** Set when the days ran out or the culprit fled; processing stops there. */
  readonly endReason: Extract<EndReason, 'time-ran-out' | 'culprit-fled'> | null;
}

/**
 * What happens as the clock goes from `fromDay` to `toDay`: each day entered is dealt with in turn, its
 * events firing in the order the case lists them. The first day past the last one ends the run, as does a
 * culprit who flees; nothing after that fires.
 */
export function daysPassed(detectiveCase: DetectiveCase, fromDay: number, toDay: number): DaysPassed {
  const { days, worldEvents } = detectiveCase.clock;
  const firedEventIndexes: number[] = [];
  const closedLocationIds: string[] = [];
  for (let day = fromDay + 1; day <= toDay; day += 1) {
    if (day > days) return { firedEventIndexes, closedLocationIds, endReason: 'time-ran-out' };
    for (const [index, event] of worldEvents.entries()) {
      if (event.day !== day) continue;
      firedEventIndexes.push(index);
      const { effect } = event;
      if (effect === undefined) continue;
      switch (effect.kind) {
        case 'culprit-flees':
          return { firedEventIndexes, closedLocationIds, endReason: 'culprit-fled' };
        case 'location-closes':
          closedLocationIds.push(effect.locationId);
          break;
        /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
        default:
          return assertNever(effect);
      }
    }
  }
  return { firedEventIndexes, closedLocationIds, endReason: null };
}

/**
 * Settles the clock of a turn that has just been carried out, `previousDay` being the day the turn began
 * on: the night passes if the active hours are spent, the days entered fire their events, and then the
 * run ends if time ran out, the culprit fled or reputation is gone. A run that is already over (the
 * accusation ended it) is left alone.
 */
export function settleClock(run: DetectiveRunState, previousDay: number): DetectiveRunState {
  if (run.status !== 'active') return run;
  // The active hours end at midnight, where the clock itself turns the day; the night then passes and
  // the morning is always 08:00, whatever part of the night the action ran into.
  const rested =
    run.clock.day > previousDay ? { ...run, clock: { day: run.clock.day, minute: DAY_START_MINUTE } } : run;
  const passed = daysPassed(run.case, previousDay, rested.clock.day);
  const closed = passed.closedLocationIds.reduce(closeLocation, rested);
  const reason = passed.endReason ?? (closed.reputation === 0 ? 'reputation-zero' : null);
  return reason === null ? closed : endRun(closed, statusOfEndReason(reason), reason);
}
