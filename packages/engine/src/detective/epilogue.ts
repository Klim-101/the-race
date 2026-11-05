// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { clueNumber } from './clue-number.js';
import type { ObstacleKind, TimelineEntry } from './case-schema.js';
import type { DetectiveRunState } from './run-state.js';
import type { Shortfall } from './verdict.js';

// The closing story is told by the narrator, and it may say nothing that the outcome does not hold. The
// epilogue is that: the facts a story needs, in order, built only once the run is over, so that it may show the
// truth. It adds no fact of its own; each entry is a field of the case or of the run.

/** A clue of the chain the hero came nearest to that was never found, and how it could have been had. */
export interface MissedClue {
  readonly clueId: string;
  readonly description: string;
  readonly locationId: string;
  /** The thing in the place that held it; `null` for a clue given by talking, asking or looking about. */
  readonly partId: string | null;
  /** What stood between the hero and it; `null` for a part that lay open or a clue with no part. */
  readonly obstacle: ObstacleKind | null;
}

/** A false clue the hero found that pointed at the person they accused. */
export interface MisleadingClue {
  readonly clueId: string;
  readonly description: string;
  readonly number: string;
}

/** What the narrator has to tell the closing story from. */
export interface Epilogue {
  /** The true course of the crime, in the order it happened. */
  readonly course: readonly TimelineEntry[];
  /** For an unproven accusation: the clues never found. Empty otherwise. */
  readonly missed: readonly MissedClue[];
  /** For a wrong accusation: the false clues that led the hero to the person they named. Empty otherwise. */
  readonly misled: readonly MisleadingClue[];
}

export function epilogueOf(
  run: DetectiveRunState,
  accusedId: string,
  shortfall: Shortfall | undefined,
): Epilogue {
  const { truth, clues, locations } = run.case;
  const course = truth.timeline.toSorted((a, b) => a.atMinute - b.atMinute);
  const neverFound = new Set(
    (shortfall?.evidence.clues ?? [])
      .filter(({ state }) => state === 'never-found')
      .map(({ clueId }) => clueId),
  );
  const missed = clues
    .filter(({ id }) => neverFound.has(id))
    .map((clue) => {
      const place = locations.find(({ id }) => id === clue.locationId);
      const part = place?.parts?.find(({ holds }) => holds === clue.id);
      return {
        clueId: clue.id,
        description: clue.description,
        locationId: clue.locationId,
        partId: part?.id ?? null,
        obstacle: part?.obstacle ?? null,
      };
    });
  const misled =
    accusedId === truth.culpritId
      ? []
      : clues
          .filter(
            ({ id, isRedHerring, pointsTo }) =>
              isRedHerring && pointsTo.includes(accusedId) && run.foundClueIds.includes(id),
          )
          .map(({ id, description }) => ({
            clueId: id,
            description,
            number: clueNumber(run.hero.name, run.foundClueIds.indexOf(id)),
          }));
  return { course, missed, misled };
}
