// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { DAY_START_MINUTE, MINUTES_PER_DAY } from '../../run.js';
import type { Trait } from '../../traits.js';
import type { DetectiveHero } from '../archetype.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase, LeadWindow } from '../case-schema.js';
import { inWindow } from '../leads.js';
import {
  canBreakLie,
  canEverPass,
  canPassWithTrainedSkill,
  closedSources,
  computeObtainable,
} from '../obtainability.js';

/** Whether a place with these hours is open at some moment of the working day, which every hero has, 08:00 to midnight. */
function opensInTheDay(hours: LeadWindow): boolean {
  for (let minute = DAY_START_MINUTE; minute < MINUTES_PER_DAY; minute += 1) {
    if (inWindow(hours, minute)) return true;
  }
  return false;
}

/**
 * A place open only at night, in the hours after midnight, can be entered by a hero who has chosen to stay up and by no one
 * else, and a hero may never be made to. So the night may hold extras (a second route, a confirmation, a person who is not
 * there by day) and never the only way to what the solution needs: with every such place shut, each evidence chain, the
 * motive, every suspect and every lie must be as reachable as they were with the place open.
 */
export function checkNight(
  detectiveCase: DetectiveCase,
  hero: DetectiveHero,
  traits: readonly Trait[],
): CaseIssue[] {
  const nightOnly = new Set(
    detectiveCase.locations.flatMap(({ id, hours }) =>
      hours !== undefined && !opensInTheDay(hours) ? [id] : [],
    ),
  );
  if (nightOnly.size === 0) return [];
  const issues: CaseIssue[] = [];
  const needs = (path: string, what: string): void => {
    issues.push({
      code: 'solution-needs-night',
      path,
      message: `${what} needs a place that is open only at night (${[...nightOnly].join(', ')}). The night may hold extras, never the only way to what the solution needs.`,
    });
  };
  if (nightOnly.has(detectiveCase.startLocationId)) {
    needs('startLocationId', 'The place the hero starts in');
    return issues;
  }

  const day = {
    ...detectiveCase,
    locations: detectiveCase.locations.filter(({ id }) => !nightOnly.has(id)),
  };
  const shut = closedSources(traits);
  const trained = canPassWithTrainedSkill(hero, traits);
  const ever = canEverPass(hero, traits);
  const trainedAll = computeObtainable(detectiveCase, trained, shut);
  const trainedDay = computeObtainable(day, trained, shut);
  const everAll = computeObtainable(detectiveCase, ever, shut);
  const everDay = computeObtainable(day, ever, shut);

  const { evidenceChains, motiveDeductionId } = detectiveCase.solution;
  evidenceChains.forEach((chain, index) => {
    if (chain.every((id) => trainedAll.clueIds.has(id)) && !chain.every((id) => trainedDay.clueIds.has(id))) {
      needs(`solution.evidenceChains[${String(index)}]`, `Evidence chain ${String(index + 1)}`);
    }
  });
  const motiveClueIds = detectiveCase.deductions
    .filter(({ id }) => id === motiveDeductionId)
    .flatMap(({ clueIds }) => clueIds);
  if (
    motiveClueIds.every((id) => everAll.clueIds.has(id)) &&
    !motiveClueIds.every((id) => everDay.clueIds.has(id))
  ) {
    needs('solution.motiveDeductionId', 'The motive');
  }
  detectiveCase.suspects.forEach((suspect, index) => {
    if (suspect.locationId !== undefined && nightOnly.has(suspect.locationId)) {
      needs(`suspects[${String(index)}].locationId`, `Suspect "${suspect.id}"`);
    }
    suspect.lies.forEach((lie, lieIndex) => {
      if (
        canBreakLie(detectiveCase, lie, everAll.clueIds) &&
        !canBreakLie(detectiveCase, lie, everDay.clueIds)
      ) {
        needs(`suspects[${String(index)}].lies[${String(lieIndex)}]`, `Breaking the lie "${lie.id}"`);
      }
    });
  });
  return issues;
}
