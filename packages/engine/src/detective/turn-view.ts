// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from '../assert-never.js';
import type { ConsumableId } from './consumables.js';
import type { LogEntry, RunLog } from './event-log.js';
import type { INTERROGATION_APPROACHES } from './interrogation.js';
import type { DetectiveRunState } from './run-state.js';
import type { ObstacleKind } from './case-schema.js';
import type { Shortfall, Verdict } from './verdict.js';

// The run log is engine-side only: its entries hold every check, the clues rolled for and, for an accusation,
// the truth. A turn is shown to the player as what they asked for and what they were told, nothing more, so the
// projection below names the fields it takes one by one and never passes an entry on.

export const DEFAULT_TURNS_SHOWN = 12;

/**
 * The closed file of a finished run, as the player is told it once the run is over: the truth of the case, the true
 * course of the crime, the clues of the nearest chain that were never found and the false clues that led astray, with
 * the names of people and places in place of ids. A log from before the epilogue has no course and nothing missed.
 */
export interface ClosedFile {
  readonly verdict: Verdict;
  readonly culpritRight: boolean;
  /** Only for an abduction: whether the hero named the place where the victim was kept. */
  readonly placeRight?: boolean;
  /** Only for a homicide: whether the hero named the means of the case. */
  readonly meansRight?: boolean;
  readonly culprit: string;
  readonly motive: string;
  readonly method: string;
  /** The place of the crime; for an abduction, the place where the victim was kept, which is what the hero was asked. */
  readonly place: string;
  readonly course: readonly {
    /** Minutes since the start of the crime day. */
    readonly atMinute: number;
    readonly actor: string;
    readonly place: string;
    readonly action: string;
  }[];
  readonly missed: readonly {
    readonly description: string;
    readonly place: string;
    /** What stood between the hero and it; `null` when nothing did. */
    readonly obstacle: ObstacleKind | null;
  }[];
  readonly misled: readonly { readonly number: string; readonly description: string }[];
}

export type TurnDetail =
  | { readonly kind: 'look'; readonly found: number; readonly trace?: string }
  | { readonly kind: 'move'; readonly to: string; readonly entered: boolean }
  | { readonly kind: 'search'; readonly found: number; readonly trace?: string }
  | { readonly kind: 'rest' }
  | { readonly kind: 'stay-up' }
  | { readonly kind: 'sit'; readonly restored: number }
  | { readonly kind: 'ask'; readonly succeeded: boolean }
  | { readonly kind: 'study'; readonly clue: string; readonly succeeded: boolean }
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
  | {
      readonly kind: 'take';
      readonly how: 'found' | 'sold';
      readonly itemKind: 'tool' | 'supply';
      readonly item: string;
    }
  | {
      readonly kind: 'accuse';
      /** What the proof lacked, when the right person was named and the proof fell short: told once the run is over. */
      readonly shortfall: Shortfall | null;
      /** The truth of the case, the course of the crime and what was missed, told once the run is over. */
      readonly file?: ClosedFile | null;
    };

/** One turn the player took, in the order of play, with the day and the hour it ended at. */
export type TurnView = { readonly turn: number; readonly day: number; readonly minute: number } & TurnDetail;

/** A suspect's name; the id of one the case does not list, which only a damaged log can name. */
const nameOf = (run: DetectiveRunState, id: string): string =>
  run.case.suspects.find((suspect) => suspect.id === id)?.name ?? id;

function detailOf(run: DetectiveRunState, entry: LogEntry): TurnDetail {
  const { outcome } = entry;
  const placeName = (id: string): string => run.case.locations.find((place) => place.id === id)?.name ?? id;
  switch (outcome.kind) {
    case 'look':
      return {
        kind: 'look',
        found: outcome.foundClueIds.length,
        ...(outcome.trace === undefined ? {} : { trace: outcome.trace }),
      };
    case 'move':
      return { kind: 'move', to: placeName(outcome.to), entered: outcome.entered };
    case 'search':
      return {
        kind: 'search',
        found: outcome.foundClueIds.length,
        ...(outcome.trace === undefined ? {} : { trace: outcome.trace }),
      };
    case 'rest':
      return { kind: 'rest' };
    case 'stay-up':
      return { kind: 'stay-up' };
    case 'sit':
      return { kind: 'sit', restored: outcome.nervesRestored };
    case 'ask':
      return { kind: 'ask', succeeded: outcome.succeeded };
    case 'study':
      return {
        kind: 'study',
        clue: run.case.clues
          .filter(({ id }) => id === outcome.clueId)
          .map(({ description }) => description)
          .join(''),
        succeeded: outcome.succeeded,
      };
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
    case 'take':
      return { kind: 'take', how: outcome.how, itemKind: outcome.itemKind, item: outcome.itemId };
    case 'accuse':
      return {
        kind: 'accuse',
        shortfall: outcome.shortfall ?? null,
        file: {
          verdict: outcome.verdict,
          culpritRight: outcome.culpritRight,
          ...(outcome.placeRight === undefined ? {} : { placeRight: outcome.placeRight }),
          ...(outcome.meansRight === undefined ? {} : { meansRight: outcome.meansRight }),
          culprit: nameOf(run, outcome.truth.culpritId),
          motive: outcome.truth.motive,
          method: outcome.truth.method,
          place: placeName(outcome.truth.whereaboutsId ?? outcome.truth.crimeLocationId),
          course: (outcome.epilogue?.course ?? []).map(({ atMinute, actorId, locationId, action }) => ({
            atMinute,
            actor: nameOf(run, actorId),
            place: placeName(locationId),
            action,
          })),
          missed: (outcome.epilogue?.missed ?? []).map(({ description, locationId, obstacle }) => ({
            description,
            place: placeName(locationId),
            obstacle,
          })),
          misled: (outcome.epilogue?.misled ?? []).map(({ number, description }) => ({
            number,
            description,
          })),
        },
      };
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(outcome);
  }
}

/**
 * The last turns the player took, newest first, as the player knows them. A deduction that reached nothing
 * says so; a conclusion is named only when it was drawn. The accusation says that it was made and, when the
 * right person was named and the proof fell short, what it lacked: the run is over by then, and the truth has
 * been told. The verdict itself is the run's end.
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
