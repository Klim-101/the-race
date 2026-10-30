// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import type { Obtainable } from '../obtainability.js';

/** A suspect nobody can walk up to can never be questioned, so their lies can never be broken. */
export function checkSuspectReachability(detectiveCase: DetectiveCase, obtainable: Obtainable): CaseIssue[] {
  const issues: CaseIssue[] = [];
  detectiveCase.suspects.forEach((suspect, index) => {
    // A suspect without a place is not tied to the map, so there is nothing to reach.
    if (suspect.locationId === undefined || obtainable.locationIds.has(suspect.locationId)) return;
    issues.push({
      code: 'unreachable-suspect',
      path: `suspects[${String(index)}].locationId`,
      message: `Suspect "${suspect.id}" is at "${suspect.locationId}", which this hero cannot reach.`,
    });
  });
  return issues;
}
