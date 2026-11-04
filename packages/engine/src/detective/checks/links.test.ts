// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import type { CaseIssue } from '../case-issue.js';
import { validateCase } from '../case-validator.js';

type CheeseCase = ReturnType<typeof buildCheeseCase>;

function issuesOf(detectiveCase: CheeseCase, requireLinkable = true): CaseIssue[] {
  const result = validateCase(detectiveCase, {
    hero: buildHero(),
    traits: [],
    locale: 'en',
    realNames: [],
    requireLinkable,
  });
  return result.isValid ? [] : [...result.issues];
}

const withTrailDeduction = (clueIds: string[]) => (detectiveCase: CheeseCase) => {
  detectiveCase.deductions.push({ id: 'trail', clueIds, insight: 'Something was rolled out of the cellar.' });
};

describe('an evidence chain of two clues or more', () => {
  it('has a conclusion that takes two of its clues, or the case is refused', () => {
    // The motive takes the clues of the second chain, and nothing takes those of the first.
    expect(issuesOf(buildCheeseCase())).toMatchObject([
      { code: 'chain-without-deduction', path: 'solution.evidenceChains[0]' },
    ]);

    const fixed = buildCheeseCase();
    withTrailDeduction(['cart-tracks', 'flour-crumbs'])(fixed);
    expect(issuesOf(fixed)).toEqual([]);
  });

  it('is not linked by a conclusion that takes only one of its clues, however many others it takes', () => {
    const detectiveCase = buildCheeseCase();
    withTrailDeduction(['cart-tracks', 'blue-glove', 'cellar-key'])(detectiveCase);

    expect(issuesOf(detectiveCase).map(({ code }) => code)).toEqual(['chain-without-deduction']);
  });

  it('is linked by a conclusion that takes two of its clues and clues from outside it as well', () => {
    const detectiveCase = buildCheeseCase();
    withTrailDeduction(['cart-tracks', 'flour-crumbs', 'blue-glove'])(detectiveCase);

    expect(issuesOf(detectiveCase)).toEqual([]);
  });

  it('is not asked for when the case is not a generated one', () => {
    expect(issuesOf(buildCheeseCase(), false)).toEqual([]);
  });

  it('is not asked for when the chain is a single clue', () => {
    const detectiveCase = buildCheeseCase();
    detectiveCase.solution.evidenceChains = [['oven-receipt', 'debt-ledger'], ['flour-crumbs']];

    expect(issuesOf(detectiveCase)).toEqual([]);
  });
});
