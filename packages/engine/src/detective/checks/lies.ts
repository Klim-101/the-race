// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import { canBreakLie, type Obtainable } from '../obtainability.js';

/** A lie the hero can never break turns an interrogation into a wall. */
export function checkLies(
  detectiveCase: DetectiveCase,
  obtainable: Obtainable,
  requireTies = false,
): CaseIssue[] {
  const unbreakable = detectiveCase.suspects.flatMap((suspect, suspectIndex) =>
    suspect.lies
      .map((lie, lieIndex) => ({ lie, path: `suspects[${String(suspectIndex)}].lies[${String(lieIndex)}]` }))
      .filter(({ lie }) => !canBreakLie(detectiveCase, lie, obtainable.clueIds))
      .map(({ lie, path }) => ({
        code: 'unbreakable-lie' as const,
        path,
        message: `Lie "${lie.id}" of "${suspect.id}" is broken only by clues this hero can never find.`,
      })),
  );
  return [...unbreakable, ...(requireTies ? checkTies(detectiveCase) : [])];
}

/**
 * A clue that breaks a lie is about the one who told it: the suspect reacts to what bears on them, and the
 * narrator has a reaction to play. A clue that points at a suspect is about them as well.
 */
function checkTies(detectiveCase: DetectiveCase): CaseIssue[] {
  const cluesById = new Map(detectiveCase.clues.map((clue) => [clue.id, clue]));
  return detectiveCase.suspects.flatMap((suspect, suspectIndex) =>
    suspect.lies.flatMap((lie, lieIndex) =>
      lie.brokenBy.flatMap((clueId, clueIndex) => {
        const clue = cluesById.get(clueId);
        const tied = clue !== undefined && [...(clue.about ?? []), ...clue.pointsTo].includes(suspect.id);
        return tied
          ? []
          : [
              {
                code: 'clue-not-tied' as const,
                path: `suspects[${String(suspectIndex)}].lies[${String(lieIndex)}].brokenBy[${String(clueIndex)}]`,
                message: `Clue "${clueId}" breaks a lie of "${suspect.id}", so it must be about them: list them in its "about".`,
              },
            ];
      }),
    ),
  );
}
