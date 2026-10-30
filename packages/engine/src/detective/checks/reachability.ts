// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import type { Obtainable } from '../obtainability.js';

/** The clues the case leans on: those of every evidence chain, of a lie's refutation and of the motive. */
function requiredClueIds(detectiveCase: DetectiveCase): ReadonlySet<string> {
  const { evidenceChains, motiveDeductionId } = detectiveCase.solution;
  return new Set([
    ...evidenceChains.flat(),
    ...detectiveCase.suspects.flatMap(({ lies }) => lies.flatMap(({ brokenBy }) => brokenBy)),
    ...detectiveCase.deductions
      .filter(({ id }) => id === motiveDeductionId)
      .flatMap(({ clueIds }) => clueIds),
  ]);
}

/**
 * Content the hero can never reach is dead weight, and usually a sign of a broken graph. A clue the case
 * does not lean on is an optional extra: if this hero cannot obtain it, it is simply unavailable to them.
 */
export function checkReachability(detectiveCase: DetectiveCase, obtainable: Obtainable): CaseIssue[] {
  const issues: CaseIssue[] = [];
  const required = requiredClueIds(detectiveCase);
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
    if (required.has(clue.id) && !obtainable.clueIds.has(clue.id)) {
      issues.push({
        code: 'unobtainable-clue',
        path: `clues[${String(index)}]`,
        message: `Clue "${clue.id}" can never be found by this hero.`,
      });
    }
  });
  return issues;
}
