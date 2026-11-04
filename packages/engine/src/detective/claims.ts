// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveCase, Suspect } from './case-schema.js';
import type { DetectiveRunState } from './run-state.js';

/** The first ruleset in which a suspect makes claims the hero can see, and see caught. */
export const CLAIMS_RULESET_VERSION = 21;

/** A fixed number from the words, so the order of the claims is the same every time and tells nothing. */
function orderOf(suspectId: string, text: string): number {
  let hash = 2166136261;
  const words = `${suspectId}:${text}`;
  for (let index = 0; index < words.length; index += 1) {
    hash = Math.imul(hash ^ words.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
}

/** In an order that is the same every time and that does not put the true ones before the lies, nor after. */
function scrambled(suspectId: string, texts: readonly string[]): string[] {
  return [...new Set(texts)].toSorted((a, b) => orderOf(suspectId, a) - orderOf(suspectId, b));
}

/**
 * What the suspect says at the first talk: the true claims the case gives them and the statement of each lie they
 * tell from the start. A lie that follows another is not told yet. The player is not told which are which.
 */
export function openingClaims(suspect: Suspect): string[] {
  return scrambled(suspect.id, [
    ...(suspect.claims ?? []),
    ...suspect.lies.filter(({ after }) => after === undefined).map(({ statement }) => statement),
  ]);
}

/** What the suspect claims once those lies have fallen: the lies that follow them. */
export function followUpClaims(suspect: Suspect, fallenLieIds: readonly string[]): string[] {
  return scrambled(
    suspect.id,
    suspect.lies
      .filter(({ after }) => after !== undefined && fallenLieIds.includes(after))
      .map(({ statement }) => statement),
  );
}

/**
 * The suspect's claims as the hero knows them, each with the clues that broke it once it has fallen. A claim whose
 * lie has fallen is marked; one that is true, or a lie that still stands, looks the same as the day it was made.
 */
export function viewClaims(
  run: DetectiveRunState,
  detectiveCase: DetectiveCase,
  suspectId: string,
): { day: number; text: string; broken: { clueIds: string[] } | null }[] {
  const suspect = detectiveCase.suspects.find(({ id }) => id === suspectId);
  return run.claims
    .filter((claim) => claim.suspectId === suspectId)
    .map(({ day, text }) => {
      const lie = suspect?.lies.find(({ statement }) => statement === text);
      const fell = lie !== undefined && run.concededLieIds.includes(lie.id);
      return {
        day,
        text,
        broken: fell
          ? {
              clueIds: [
                ...new Set(
                  run.history.shown
                    .filter(
                      (shown) =>
                        shown.suspectId === suspectId &&
                        shown.effect === 'breaks-lie' &&
                        lie.brokenBy.includes(shown.clueId),
                    )
                    .map(({ clueId }) => clueId),
                ),
              ],
            }
          : null,
      };
    });
}
