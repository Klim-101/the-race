// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from '../assert-never.js';
import type { ClueMessage, MessageChannel } from './case-schema.js';
import { ABDUCTION_RULESET_VERSION, runMinuteOf } from './abduction.js';
import { findToldClue, type DetectiveRunState } from './run-state.js';

/** How long after its time a call can still be taken; a hero asleep or away for longer misses it for good. */
export const CALL_WINDOW_MINUTES = 60;

/** A message that reached the hero in a turn: the clue it is, and how it came. */
export interface ArrivedMessage {
  readonly clueId: string;
  readonly channel: MessageChannel;
}

/**
 * Whether a message that has not been read can still be, and is, read now: never before its time; a note once the hero
 * is at its place; a call only within `CALL_WINDOW_MINUTES` of its time; a text or a report at the first turn after its time.
 */
function reaches(run: DetectiveRunState, clue: { locationId: string }, message: ClueMessage): boolean {
  const late = runMinuteOf(run.clock) - message.arrivesAtMinute;
  if (late < 0) return false;
  switch (message.channel) {
    case 'note':
      return run.locationId === clue.locationId;
    case 'call':
      return late <= CALL_WINDOW_MINUTES;
    case 'text':
    case 'report':
      return true;
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(message.channel);
  }
}

/**
 * Hands the hero the messages whose time has come, at the end of a turn: each becomes a clue found where the hero stood.
 * A call that nobody took in time is not delivered, and is not again. Runs of a ruleset before abductions have none. A
 * report of a homicide comes as a text does: it waits for the hero's next turn.
 */
export function deliverMessages(run: DetectiveRunState): {
  readonly run: DetectiveRunState;
  readonly arrived: readonly ArrivedMessage[];
} {
  if (run.status !== 'active' || run.rulesetVersion < ABDUCTION_RULESET_VERSION) return { run, arrived: [] };
  const arrived: ArrivedMessage[] = [];
  let next = run;
  for (const clue of run.case.clues) {
    const { message } = clue;
    if (message === undefined || run.foundClueIds.includes(clue.id) || !reaches(run, clue, message)) continue;
    next = findToldClue(next, clue.id);
    arrived.push({ clueId: clue.id, channel: message.channel });
  }
  return { run: next, arrived };
}
