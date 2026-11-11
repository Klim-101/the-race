// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { MINUTES_PER_DAY } from '../../run.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import { namesOf } from './abduction.js';

/**
 * The fairness rules of a homicide, on top of those every case passes (two independent chains, no free culprit, a fair
 * route to every chain, the night and the traces):
 * - the first release is an attempt, so a case that says the victim was killed is not yet accepted;
 * - the means is a conclusion of the solution (`solution.meansDeductionId`), as the motive is; that the hero can draw it is
 *   checked with the clues the case leans on (see `checkReachability`);
 * - the victim of an attempt is a witness who lies at a place that keeps hours, so the hero has to come at the right time;
 *   what they saw never names the culprit, which the engine makes true by cutting it;
 * - at least two suspects were at the scene, so that the means and the opportunity alone do not give the culprit away and
 *   the hero has to tell them apart by what they find;
 * - every report arrives before the case ends, and none names the culprit. What a report says is judged only once it is
 *   written (`content`).
 * A case of another form has none of this to judge.
 */
export function checkHomicide(detectiveCase: DetectiveCase, content: boolean): CaseIssue[] {
  const { homicide, culpritId, crimeLocationId, timeline } = detectiveCase.truth;
  if (homicide === undefined) return [];
  const issues: CaseIssue[] = [];

  if (homicide.fate !== 'attempt') {
    issues.push({
      code: 'homicide-death-not-ready',
      path: 'truth.homicide.fate',
      message: 'Only an attempt is written for now: the victim was hurt and lives. Set "fate" to "attempt".',
    });
  }

  if (detectiveCase.solution.meansDeductionId === undefined) {
    issues.push({
      code: 'homicide-without-means',
      path: 'solution.meansDeductionId',
      message:
        'A homicide needs a conclusion about what it was done with: set "solution.meansDeductionId" to a deduction that links clues about the means.',
    });
  }

  if (homicide.fate === 'attempt') {
    const witnesses = detectiveCase.witnesses ?? [];
    const witness = witnesses.find(({ victim }) => victim === true);
    if (witness === undefined) {
      issues.push({
        code: 'attempt-without-victim-witness',
        path: 'witnesses',
        message: `The victim of an attempt lives and can be asked: add a witness named "${homicide.victim.name}" with "victim": true, at the place where they lie.`,
      });
    } else if (
      !detectiveCase.locations.some(({ id, hours }) => id === witness.locationId && hours !== undefined)
    ) {
      issues.push({
        code: 'victim-place-without-hours',
        path: `witnesses[${String(witnesses.indexOf(witness))}].locationId`,
        message: `"${witness.locationId}", where the victim lies, keeps no hours: give it "hours" (the hours of visiting), so the hero has to come at the right time.`,
      });
    }
  }

  const atTheScene = new Set(
    timeline.filter(({ locationId }) => locationId === crimeLocationId).map(({ actorId }) => actorId),
  );
  const suspectsAtTheScene = detectiveCase.suspects.filter(({ id }) => atTheScene.has(id));
  if (suspectsAtTheScene.length < 2) {
    issues.push({
      code: 'homicide-opportunity-single',
      path: 'truth.timeline',
      message: `Only ${String(suspectsAtTheScene.length)} suspect is at the scene ("${crimeLocationId}") in the timeline: put at least two there, the culprit and another, so that the hero has to tell them apart by evidence.`,
    });
  }

  const endOfCase = detectiveCase.clock.days * MINUTES_PER_DAY;
  const culpritNames = detectiveCase.suspects
    .filter(({ id }) => id === culpritId)
    .flatMap(({ name, id }) => namesOf(name, id));
  detectiveCase.clues.forEach((clue, index) => {
    if (clue.message === undefined) return;
    const path = `clues[${String(index)}]`;
    if (clue.message.arrivesAtMinute >= endOfCase) {
      issues.push({
        code: 'message-after-deadline',
        path: `${path}.message.arrivesAtMinute`,
        message: `Report "${clue.id}" arrives at ${String(clue.message.arrivesAtMinute)}, not before the case ends (${String(endOfCase)}).`,
      });
    }
    if (content && culpritNames.some((name) => clue.description.toLowerCase().includes(name))) {
      issues.push({
        code: 'message-names-culprit',
        path: `${path}.description`,
        message: `Report "${clue.id}" names the culprit; a report narrows the time of the event and leaves the culprit to be found.`,
      });
    }
  });
  return issues;
}
