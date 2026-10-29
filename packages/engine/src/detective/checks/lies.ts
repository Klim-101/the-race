// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import type { Obtainable } from '../obtainability.js';

/** A lie the hero can never break turns an interrogation into a wall. */
export function checkLies(detectiveCase: DetectiveCase, obtainable: Obtainable): CaseIssue[] {
  return detectiveCase.suspects.flatMap((suspect, suspectIndex) =>
    suspect.lies
      .map((lie, lieIndex) => ({ lie, path: `suspects[${String(suspectIndex)}].lies[${String(lieIndex)}]` }))
      .filter(({ lie }) => !lie.brokenBy.some((clueId) => obtainable.clueIds.has(clueId)))
      .map(({ lie, path }) => ({
        code: 'unbreakable-lie' as const,
        path,
        message: `Lie "${lie.id}" of "${suspect.id}" is broken only by clues this hero can never find.`,
      })),
  );
}
