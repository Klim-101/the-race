// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import type { Obtainable } from '../obtainability.js';

/**
 * The things to look at in a place keep every clue within reach of any hero, whatever the kit: a clue behind
 * an obstacle has a way round it that needs no tool. The kit is never known here, so the way round must be
 * there for every hero, and a hero with the right tool only has it easier.
 *
 * With `requireParts` a place that holds a clue must be split into parts; without it a place may stay whole,
 * as in the cases of before the parts.
 */
export function checkParts(
  detectiveCase: DetectiveCase,
  obtainable: Obtainable,
  requireParts: boolean,
): CaseIssue[] {
  const issues: CaseIssue[] = [];
  const suspectsById = new Map(detectiveCase.suspects.map((suspect) => [suspect.id, suspect]));
  const cluesById = new Map(detectiveCase.clues.map((clue) => [clue.id, clue]));
  const holdingPart = new Map<string, string>();

  detectiveCase.locations.forEach((location, locationIndex) => {
    const parts = location.parts ?? [];
    const placeHoldsClue = detectiveCase.clues.some((clue) => clue.locationId === location.id);
    if (requireParts && parts.length === 0 && placeHoldsClue) {
      issues.push({
        code: 'parts-missing',
        path: `locations[${String(locationIndex)}].parts`,
        message: `Place "${location.id}" holds a clue, so split it into the things to look at.`,
      });
    }

    parts.forEach((part, partIndex) => {
      const path = `locations[${String(locationIndex)}].parts[${String(partIndex)}]`;
      const clue = part.holds === null ? undefined : cluesById.get(part.holds);
      if (part.holds !== null && clue !== undefined) {
        if (clue.locationId !== location.id) {
          issues.push({
            code: 'part-in-wrong-place',
            path: `${path}.holds`,
            message: `Part "${part.id}" is in "${location.id}", but clue "${clue.id}" lies in "${clue.locationId}".`,
          });
        }
        const other = holdingPart.get(clue.id);
        if (other !== undefined) {
          issues.push({
            code: 'clue-in-two-parts',
            path: `${path}.holds`,
            message: `Clue "${clue.id}" is already held by part "${other}"; a clue lies in one part.`,
          });
        }
        holdingPart.set(clue.id, part.id);
      }

      if (part.obstacle !== null && part.holds !== null && part.fallback === null) {
        issues.push({
          code: 'part-without-fallback',
          path: `${path}.fallback`,
          message: `Part "${part.id}" holds a clue behind an obstacle: give a way round it that needs no tool.`,
        });
      }
      if (part.fallback?.kind === 'ask') {
        const person = suspectsById.get(part.fallback.suspectId);
        // A person without a place is not tied to the map, so there is nothing to reach.
        if (person?.locationId !== undefined && !obtainable.locationIds.has(person.locationId)) {
          issues.push({
            code: 'fallback-unreachable',
            path: `${path}.fallback`,
            message: `Part "${part.id}" falls back on "${person.id}", whom this hero cannot reach.`,
          });
        }
      }
      if (!part.inQuickLook && part.requiresLead === null) {
        issues.push({
          code: 'part-never-shown',
          path,
          message: `Part "${part.id}" is neither in a quick look nor behind a lead, so nothing would show it.`,
        });
      }
    });
  });

  detectiveCase.clues.forEach((clue, clueIndex) => {
    const location = detectiveCase.locations.find(({ id }) => id === clue.locationId);
    if ((location?.parts?.length ?? 0) > 0 && !holdingPart.has(clue.id)) {
      issues.push({
        code: 'clue-without-part',
        path: `clues[${String(clueIndex)}]`,
        message: `Clue "${clue.id}" lies in "${clue.locationId}", which has parts, but no part holds it.`,
      });
    }
  });
  return issues;
}
