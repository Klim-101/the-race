// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Trait } from '../../traits.js';
import type { DetectiveHero } from '../archetype.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import { canEverPass, closedSources } from '../obtainability.js';
import { minutesToGather } from './flee-deadline.js';

/**
 * The fewest minutes the cheapest chain of proof may take by the plan of `minutesToGather`, for a case the generator
 * writes. The plan counts only walking, looking and searching: no talk, no conclusion, no failed roll, no night. In the
 * runs it was measured against, a hero played about three times what it counts, so 240 here is about twelve hours of
 * the hero's day, which is more than the first day gives: the events of the second day (a flight, a shut place) then
 * press on a case that is not yet proven, and a whodunit is no longer won from the first rooms alone.
 */
export const MIN_PROOF_MINUTES = 240;

/**
 * A whodunit whose proof can be gathered at once is won before the case has begun to press. Only a whodunit is judged:
 * an abduction has its deadline and a homicide its reports at set times. A case with no chain that can be gathered is
 * left to the checks that say so.
 */
export function checkProofLength(
  detectiveCase: DetectiveCase,
  hero: DetectiveHero,
  traits: readonly Trait[],
  minimum: number,
): CaseIssue[] {
  if ((detectiveCase.form ?? 'whodunit') !== 'whodunit') return [];
  const { evidenceChains, motiveDeductionId } = detectiveCase.solution;
  const motiveClueIds = detectiveCase.deductions
    .filter(({ id }) => id === motiveDeductionId)
    .flatMap(({ clueIds }) => clueIds);
  const gathered = evidenceChains.flatMap((chain) => {
    const minutes = minutesToGather(detectiveCase, new Set([...chain, ...motiveClueIds]), {
      canPass: canEverPass(hero, traits),
      closed: closedSources(traits),
      closures: [],
    });
    return minutes === null ? [] : [minutes];
  });
  const cheapest = Math.min(...gathered);
  if (gathered.length === 0 || cheapest >= minimum) return [];
  return [
    {
      code: 'proof-too-quick',
      path: 'solution.evidenceChains',
      message: `The cheapest chain of proof and the motive can be gathered in about ${String(cheapest)} minutes (walking, looking and searching only), and a case needs at least ${String(minimum)}: the hero must not be able to prove it from the first rooms. Put the clues of every chain farther apart, in places several steps from the start and from each other, with the nearest places holding only red herrings and traces.`,
    },
  ];
}
