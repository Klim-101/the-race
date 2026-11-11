// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from '../assert-never.js';
import { DAY_START_MINUTE, MINUTES_PER_DAY } from '../run.js';
import type { LogEntry, RunLog } from './event-log.js';
import type { DetectiveRunState } from './run-state.js';

// The turns of a run as they sit on the hours of the days, for a picture of each day. Like `viewTurns`, it names
// the fields it takes from a log entry one by one: the entry holds the rolls and, for an accusation, the truth.

export const STRIP_KINDS = [
  'move',
  'look',
  'search',
  'ask',
  'study',
  'talk',
  'deduce',
  'reread',
  'sit',
  'use',
  'take',
  'rest',
  'stay-up',
  'accuse',
] as const;
export type StripKind = (typeof STRIP_KINDS)[number];

/** What a turn touched, by ids the hero already knows: the clues found or read, the place, the person. */
export interface StripTouched {
  readonly clueIds: readonly string[];
  readonly placeId: string | null;
  readonly suspectId: string | null;
}

/** One turn on the hours of its day. */
export interface StripTurn {
  readonly turn: number;
  readonly kind: StripKind;
  /** The day the turn began on, and the minute of that day. */
  readonly day: number;
  readonly startMinute: number;
  /** Where the turn ends on that day: at most midnight, so a turn that ran past it ends at the edge of the day. */
  readonly endMinute: number;
  /** The turn ran past midnight; the rest of it is the night. */
  readonly crossedMidnight: boolean;
  /** The turn ended in a night: the active hours were spent, and the hero slept or was woken. */
  readonly endedInNight: boolean;
  /** The minutes the police held the hero, already part of the turn; `null` when they did not. */
  readonly detainedMinutes: number | null;
  readonly touched: StripTouched;
}

const NOTHING: StripTouched = { clueIds: [], placeId: null, suspectId: null };

const KIND_OF: Record<LogEntry['outcome']['kind'], StripKind> = {
  move: 'move',
  look: 'look',
  search: 'search',
  ask: 'ask',
  study: 'study',
  interrogate: 'talk',
  deduce: 'deduce',
  reread: 'reread',
  sit: 'sit',
  use: 'use',
  take: 'take',
  rest: 'rest',
  'stay-up': 'stay-up',
  accuse: 'accuse',
};

/** The minutes an outcome took; resting has none of its own and runs to the end of the day. */
function minutesOf(outcome: LogEntry['outcome'], startMinute: number): number {
  return outcome.kind === 'rest'
    ? MINUTES_PER_DAY - startMinute
    : outcome.kind === 'accuse' || outcome.kind === 'stay-up'
      ? 0
      : outcome.minutes;
}

function touchedOf(outcome: LogEntry['outcome'], placeId: string): StripTouched {
  switch (outcome.kind) {
    case 'look':
    case 'search':
      return { clueIds: outcome.foundClueIds, placeId, suspectId: null };
    case 'move':
      return { ...NOTHING, placeId: outcome.entered ? outcome.to : outcome.from };
    case 'study':
    case 'reread':
      return { clueIds: [outcome.clueId], placeId, suspectId: null };
    case 'interrogate':
      return {
        clueIds: outcome.presented.map(({ clueId }) => clueId),
        placeId,
        suspectId: outcome.suspectId,
      };
    case 'ask':
    case 'sit':
    case 'deduce':
    case 'use':
    case 'take':
    case 'rest':
    case 'stay-up':
    case 'accuse':
      return { ...NOTHING, placeId };
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(outcome);
  }
}

/**
 * Each turn with the place the hero was at, found backwards from where they stand now: a walk that was made moved
 * them, every other turn left them where they were.
 */
function placed(run: DetectiveRunState, log: RunLog): { entry: LogEntry; place: string }[] {
  const out: { entry: LogEntry; place: string }[] = [];
  let at = run.locationId;
  for (const entry of log.toReversed()) {
    const { outcome } = entry;
    if (outcome.kind === 'move' && outcome.entered) {
      out.push({ entry, place: outcome.to });
      at = outcome.from;
    } else {
      out.push({ entry, place: outcome.kind === 'move' ? outcome.from : at });
    }
  }
  return out.reverse();
}

/**
 * Every turn of the run on the hour it began, oldest first. The first turn begins at the start of the first day;
 * each later one where the one before left the clock.
 */
export function viewDayStrip(run: DetectiveRunState, log: RunLog): StripTurn[] {
  return placed(run, log).map(({ entry, place }, index) => {
    const before = log[index - 1]?.clock ?? { day: 1, minute: DAY_START_MINUTE };
    const minutes = minutesOf(entry.outcome, before.minute);
    const reach = before.minute + minutes;
    const detained = entry.outcome.kind === 'search' ? (entry.outcome.detainedMinutes ?? null) : null;
    return {
      turn: entry.turn,
      kind: KIND_OF[entry.outcome.kind],
      day: before.day,
      startMinute: before.minute,
      endMinute: Math.min(reach, MINUTES_PER_DAY),
      crossedMidnight: reach > MINUTES_PER_DAY,
      endedInNight: entry.night !== null,
      detainedMinutes: detained,
      touched: touchedOf(entry.outcome, place),
    };
  });
}
