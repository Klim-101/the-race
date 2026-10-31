// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from '../assert-never.js';
import type { ConsumableId } from './consumables.js';
import type { LogEntry, RunLog } from './event-log.js';
import type { INTERROGATION_APPROACHES } from './interrogation.js';
import type { DetectiveRunState } from './run-state.js';

// The run log is engine-side only: its entries hold every check, the clues rolled for and, for an accusation,
// the truth. A turn is shown to the player as what they asked for and what they were told, nothing more, so the
// projection below names the fields it takes one by one and never passes an entry on.

export const DEFAULT_TURNS_SHOWN = 12;

export type TurnDetail =
  | { readonly kind: 'look'; readonly found: number }
  | { readonly kind: 'move'; readonly to: string; readonly entered: boolean }
  | { readonly kind: 'search'; readonly found: number }
  | { readonly kind: 'rest' }
  | {
      readonly kind: 'interrogate';
      readonly suspect: string;
      readonly approach: (typeof INTERROGATION_APPROACHES)[number];
      readonly showed: number;
    }
  | {
      readonly kind: 'deduce';
      readonly result: 'insight' | 'already-known' | 'nothing';
      /** The conclusion, only when the turn reached it. */
      readonly insight: string | null;
    }
  | { readonly kind: 'reread'; readonly clue: string }
  | { readonly kind: 'use'; readonly item: ConsumableId }
  | { readonly kind: 'accuse' };

/** One turn the player took, in the order of play, with the day and the hour it ended at. */
export type TurnView = { readonly turn: number; readonly day: number; readonly minute: number } & TurnDetail;

function detailOf(run: DetectiveRunState, entry: LogEntry): TurnDetail {
  const { outcome } = entry;
  const placeName = (id: string): string => run.case.locations.find((place) => place.id === id)?.name ?? id;
  switch (outcome.kind) {
    case 'look':
      return { kind: 'look', found: outcome.foundClueIds.length };
    case 'move':
      return { kind: 'move', to: placeName(outcome.to), entered: outcome.entered };
    case 'search':
      return { kind: 'search', found: outcome.foundClueIds.length };
    case 'rest':
      return { kind: 'rest' };
    case 'interrogate':
      return {
        kind: 'interrogate',
        suspect: run.case.suspects.find(({ id }) => id === outcome.suspectId)?.name ?? outcome.suspectId,
        approach: outcome.approach,
        showed: outcome.presented.length,
      };
    case 'deduce':
      return {
        kind: 'deduce',
        result: outcome.result,
        insight:
          outcome.result === 'insight'
            ? (run.case.deductions.find(({ id }) => id === outcome.deductionId)?.insight ?? null)
            : null,
      };
    case 'reread':
      return {
        kind: 'reread',
        clue: run.case.clues.find(({ id }) => id === outcome.clueId)?.description ?? outcome.clueId,
      };
    case 'use':
      return { kind: 'use', item: outcome.itemId };
    case 'accuse':
      return { kind: 'accuse' };
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(outcome);
  }
}

/**
 * The last turns the player took, newest first, as the player knows them. A deduction that reached nothing
 * says so; a conclusion is named only when it was drawn. The accusation says that it was made and not what
 * came of it: the run's end already tells that.
 */
export function viewTurns(
  run: DetectiveRunState,
  log: RunLog,
  limit: number = DEFAULT_TURNS_SHOWN,
): TurnView[] {
  return log
    .slice(Math.max(0, log.length - limit))
    .reverse()
    .map((entry) => ({
      turn: entry.turn,
      day: entry.clock.day,
      minute: entry.clock.minute,
      ...detailOf(run, entry),
    }));
}
