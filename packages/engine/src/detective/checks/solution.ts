// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Hero } from '../../hero.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import { canPassWithTrainedSkill, computeObtainable, type Obtainable } from '../obtainability.js';

export const MIN_EVIDENCE_CHAINS = 2;

/** The case has at least two independent, genuine ways to prove the culprit, and a findable motive. */
export function checkSolution(detectiveCase: DetectiveCase, hero: Hero, obtainable: Obtainable): CaseIssue[] {
  const { evidenceChains, motiveDeductionId } = detectiveCase.solution;
  const { culpritId } = detectiveCase.truth;
  const redHerringIds = new Set(
    detectiveCase.clues.filter((clue) => clue.isRedHerring).map((clue) => clue.id),
  );
  const culpritClueIds = new Set(
    detectiveCase.clues.filter((clue) => clue.pointsTo.includes(culpritId)).map((clue) => clue.id),
  );
  const issues: CaseIssue[] = [];

  if (evidenceChains.length < MIN_EVIDENCE_CHAINS) {
    issues.push({
      code: 'too-few-evidence-chains',
      path: 'solution.evidenceChains',
      message: `Provide at least ${String(MIN_EVIDENCE_CHAINS)} independent evidence chains.`,
    });
  }

  const chainIndexByClueId = new Map<string, number>();
  evidenceChains.forEach((chain, chainIndex) => {
    const path = `solution.evidenceChains[${String(chainIndex)}]`;
    for (const clueId of chain) {
      const ownerIndex = chainIndexByClueId.get(clueId);
      if (ownerIndex !== undefined && ownerIndex !== chainIndex) {
        issues.push({
          code: 'overlapping-evidence-chains',
          path,
          message: `Clue "${clueId}" is also in chain ${String(ownerIndex)}; chains must not share clues.`,
        });
      }
      chainIndexByClueId.set(clueId, chainIndex);
      if (redHerringIds.has(clueId)) {
        issues.push({
          code: 'red-herring-in-evidence-chain',
          path,
          message: `Clue "${clueId}" is a red herring and cannot prove anything.`,
        });
      }
      if (!obtainable.clueIds.has(clueId)) {
        issues.push({
          code: 'unobtainable-evidence',
          path,
          message: `Clue "${clueId}" can never be found by this hero.`,
        });
      }
    }
    if (!chain.some((clueId) => culpritClueIds.has(clueId))) {
      issues.push({
        code: 'evidence-chain-misses-culprit',
        path,
        message: `No clue in this chain points to the culprit "${culpritId}".`,
      });
    }
  });

  const trained = computeObtainable(detectiveCase, canPassWithTrainedSkill(hero));
  if (!evidenceChains.some((chain) => chain.every((clueId) => trained.clueIds.has(clueId)))) {
    issues.push({
      code: 'no-chain-without-untrained-skill',
      path: 'solution.evidenceChains',
      message:
        'Every chain needs a check in a skill the hero has no points in; add a chain this hero can follow.',
    });
  }

  const motiveClueIds = detectiveCase.deductions
    .filter((deduction) => deduction.id === motiveDeductionId)
    .flatMap((deduction) => deduction.clueIds);
  if (!motiveClueIds.every((clueId) => obtainable.clueIds.has(clueId))) {
    issues.push({
      code: 'unobtainable-motive',
      path: 'solution.motiveDeductionId',
      message: `The motive deduction "${motiveDeductionId}" needs a clue this hero can never find.`,
    });
  }
  return issues;
}
