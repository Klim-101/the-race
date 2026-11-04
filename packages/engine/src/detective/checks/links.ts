// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';

/**
 * A chain of evidence of two clues or more is proof the hero builds by reasoning, so the case must hold a
 * conclusion that is drawn from some of its clues: a chain none of whose clues can be linked is a pile that the
 * player can only lay out and hope. The conclusion may be a part of the chain (a motive, an alibi, a place), and
 * may hold clues from outside it too, since a link takes a clue too many.
 */
export function checkLinkable(detectiveCase: DetectiveCase): CaseIssue[] {
  return detectiveCase.solution.evidenceChains.flatMap((chain, index) => {
    const held = new Set(chain);
    const linkable = detectiveCase.deductions.some(({ clueIds }) => {
      const inChain = new Set(clueIds.filter((id) => held.has(id)));
      return inChain.size >= 2;
    });
    return held.size < 2 || linkable
      ? []
      : [
          {
            code: 'chain-without-deduction' as const,
            path: `solution.evidenceChains[${String(index)}]`,
            message: `The clues of evidence chain ${String(index + 1)} can never be linked: add a deduction that takes at least two of them.`,
          },
        ];
  });
}
