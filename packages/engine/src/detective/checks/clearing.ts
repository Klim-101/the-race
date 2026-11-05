// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import type { Obtainable } from '../obtainability.js';

/**
 * The culprit can never be cleared, and the innocent can: every other suspect has a conclusion that clears them
 * and that the hero can reach, and every red herring that points at a suspect is part of the conclusion that clears
 * them, so that what looked like guilt has its innocent explanation to be earned. Clearing is always the hero's own
 * reasoning; nothing here gives it away.
 *
 * A suspect a red herring points at also has a thread of their own: a lie, broken by a clue of the conclusion that
 * clears them (or by that conclusion put to them), with an admission that says what they hid and why. Without it the
 * herring shows up, breaks a lie or does nothing, and the player never learns why it was there.
 */
export function checkClearing(
  detectiveCase: DetectiveCase,
  obtainable: Obtainable,
  required: boolean,
): CaseIssue[] {
  const { culpritId } = detectiveCase.truth;
  const issues: CaseIssue[] = [];

  detectiveCase.deductions.forEach((deduction, index) => {
    if (deduction.clears === culpritId) {
      issues.push({
        code: 'culprit-cleared',
        path: `deductions[${String(index)}].clears`,
        message: `Deduction "${deduction.id}" clears "${culpritId}", who is the culprit: only the innocent can be cleared.`,
      });
    }
  });
  if (!required) return issues;

  const clearing = (suspectId: string) =>
    detectiveCase.deductions.filter(({ clears }) => clears === suspectId);
  detectiveCase.suspects.forEach((suspect, index) => {
    if (suspect.id === culpritId) return;
    const reachable = clearing(suspect.id).some(({ clueIds }) =>
      clueIds.every((clueId) => obtainable.clueIds.has(clueId)),
    );
    if (!reachable) {
      issues.push({
        code: 'suspect-cannot-be-cleared',
        path: `suspects[${String(index)}]`,
        message: `"${suspect.id}" is innocent, so a deduction that "clears" them, from clues the hero can find, must exist.`,
      });
    }
  });
  detectiveCase.clues.forEach((clue, index) => {
    if (!clue.isRedHerring) return;
    const unexplained = clue.pointsTo.filter(
      (suspectId) =>
        suspectId !== culpritId && !clearing(suspectId).some(({ clueIds }) => clueIds.includes(clue.id)),
    );
    if (unexplained.length > 0) {
      issues.push({
        code: 'red-herring-unexplained',
        path: `clues[${String(index)}]`,
        message: `Red herring "${clue.id}" points at ${unexplained.map((id) => `"${id}"`).join(', ')}: it must be a clue of the deduction that clears them, which is its innocent explanation.`,
      });
    }
  });

  const pointedAt = new Set(detectiveCase.clues.flatMap((clue) => (clue.isRedHerring ? clue.pointsTo : [])));
  detectiveCase.suspects.forEach((suspect, index) => {
    if (suspect.id === culpritId || !pointedAt.has(suspect.id)) return;
    const threaded = clearing(suspect.id).some(
      (deduction) =>
        suspect.lies.some(
          (lie) =>
            lie.admission !== undefined &&
            [...lie.brokenBy, ...(lie.gives === undefined ? [] : [lie.gives])].some((clueId) =>
              deduction.clueIds.includes(clueId),
            ),
        ) ||
        suspect.lies.some(
          (lie) => lie.admission !== undefined && (lie.brokenByInsights ?? []).includes(deduction.id),
        ),
    );
    if (!threaded) {
      issues.push({
        code: 'red-herring-without-thread',
        path: `suspects[${String(index)}]`,
        message: `A red herring points at "${suspect.id}", so a lie of theirs, with an "admission" (what they hid and why), must be broken by a clue of the deduction that clears them, or by that deduction put to them.`,
      });
    }
  });
  return issues;
}
