// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import type { Obtainable } from '../obtainability.js';

/** Content the hero can never reach is dead weight, and usually a sign of a broken graph. */
export function checkReachability(detectiveCase: DetectiveCase, obtainable: Obtainable): CaseIssue[] {
  const issues: CaseIssue[] = [];
  detectiveCase.locations.forEach((location, index) => {
    if (!obtainable.locationIds.has(location.id)) {
      issues.push({
        code: 'unreachable-location',
        path: `locations[${String(index)}]`,
        message: `Location "${location.id}" cannot be reached from "${detectiveCase.startLocationId}".`,
      });
    }
  });
  detectiveCase.clues.forEach((clue, index) => {
    if (!obtainable.clueIds.has(clue.id)) {
      issues.push({
        code: 'unobtainable-clue',
        path: `clues[${String(index)}]`,
        message: `Clue "${clue.id}" can never be found by this hero.`,
      });
    }
  });
  return issues;
}
