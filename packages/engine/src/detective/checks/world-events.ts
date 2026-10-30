// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Trait } from '../../traits.js';
import type { DetectiveHero } from '../archetype.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import { canEverPass, canPassWithTrainedSkill, closedSources, computeObtainable } from '../obtainability.js';

/**
 * Scheduled events must fall inside the case's days, and no event may take the solution away.
 * The route check is deliberately pessimistic: it removes every place any event closes, as if all of them
 * had closed before the hero moved, and asks whether a whole evidence chain and the motive are still
 * within reach. It does not estimate whether the days suffice to get there; that stays with the generator.
 */
export function checkWorldEvents(
  detectiveCase: DetectiveCase,
  hero: DetectiveHero,
  traits: readonly Trait[],
): CaseIssue[] {
  const { days, worldEvents } = detectiveCase.clock;
  const issues: CaseIssue[] = [];
  const closing = new Set<string>();

  worldEvents.forEach((event, index) => {
    const path = `clock.worldEvents[${String(index)}]`;
    if (event.day > days) {
      issues.push({
        code: 'world-event-out-of-range',
        path: `${path}.day`,
        message: `The case lasts ${String(days)} days, so an event cannot fall on day ${String(event.day)}.`,
      });
    }
    if (event.effect?.kind === 'culprit-flees' && event.day < 2) {
      issues.push({
        code: 'world-event-out-of-range',
        path: `${path}.day`,
        message: 'The culprit cannot flee on the first day: the hero would lose before they could act.',
      });
    }
    if (event.effect?.kind === 'location-closes') {
      if (event.effect.locationId === detectiveCase.startLocationId) {
        issues.push({
          code: 'event-cuts-solution',
          path: `${path}.effect.locationId`,
          message: 'The place the hero starts in cannot close.',
        });
      }
      closing.add(event.effect.locationId);
    }
  });

  if (closing.size === 0) return issues;

  const open = {
    ...detectiveCase,
    locations: detectiveCase.locations.filter(({ id }) => !closing.has(id)),
  };
  const closed = closedSources(traits);
  const trained = computeObtainable(open, canPassWithTrainedSkill(hero, traits), closed);
  const possible = computeObtainable(open, canEverPass(hero, traits), closed);
  const { evidenceChains, motiveDeductionId } = detectiveCase.solution;
  const motiveClueIds = detectiveCase.deductions
    .filter(({ id }) => id === motiveDeductionId)
    .flatMap(({ clueIds }) => clueIds);
  const chainSurvives = evidenceChains.some((chain) => chain.every((id) => trained.clueIds.has(id)));
  if (!chainSurvives || !motiveClueIds.every((id) => possible.clueIds.has(id))) {
    issues.push({
      code: 'event-cuts-solution',
      path: 'clock.worldEvents',
      message: 'Once the places that events close are gone, this hero can no longer prove the case.',
    });
  }
  return issues;
}
