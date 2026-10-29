// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';

// Past this share the case stops being a puzzle and becomes noise the player cannot sort.
export const MAX_RED_HERRING_SHARE = 0.4;

export function checkRedHerrings(detectiveCase: DetectiveCase): CaseIssue[] {
  const redHerringCount = detectiveCase.clues.filter((clue) => clue.isRedHerring).length;
  if (redHerringCount / detectiveCase.clues.length <= MAX_RED_HERRING_SHARE) return [];
  return [
    {
      code: 'too-many-red-herrings',
      path: 'clues',
      message: `${String(redHerringCount)} of ${String(detectiveCase.clues.length)} clues are red herrings; keep it at most ${String(MAX_RED_HERRING_SHARE * 100)}%.`,
    },
  ];
}
