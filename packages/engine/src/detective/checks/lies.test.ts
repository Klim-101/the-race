// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import type { CaseIssueCode } from '../case-issue.js';
import { validateCase } from '../case-validator.js';

type Loose = Record<string, unknown>;

function issueCodes(input: unknown, requireTies = true): CaseIssueCode[] {
  const result = validateCase(input, {
    hero: buildHero(),
    traits: [],
    locale: 'en',
    realNames: [],
    requireTies,
  });
  return result.isValid ? [] : result.issues.map((issue) => issue.code);
}

const breakRivalLieWith = (detectiveCase: ReturnType<typeof buildCheeseCase>, clueId: string): void => {
  const lie = detectiveCase.suspects[1]?.lies[0];
  if (lie !== undefined) lie.brokenBy = [clueId];
};

const clueOf = (detectiveCase: ReturnType<typeof buildCheeseCase>, id: string): Loose => {
  const found = detectiveCase.clues.find((clue) => clue.id === id);
  if (found === undefined) throw new Error(`No clue ${id}.`);
  return found;
};

describe('the clues that break a lie', () => {
  it('are about the one who told it, by what they point at', () => {
    expect(issueCodes(buildCheeseCase())).toEqual([]);
  });

  it('are about them by what the case says, and a clue that is about no one is refused', () => {
    const detectiveCase = buildCheeseCase();
    breakRivalLieWith(detectiveCase, 'cellar-key');

    expect(issueCodes(detectiveCase)).toEqual(['clue-not-tied']);
    clueOf(detectiveCase, 'cellar-key').about = ['rival'];
    expect(issueCodes(detectiveCase)).toEqual([]);
  });

  it('are not asked to be tied when the case is not a generated one', () => {
    const detectiveCase = buildCheeseCase();
    breakRivalLieWith(detectiveCase, 'cellar-key');

    expect(issueCodes(detectiveCase, false)).toEqual([]);
    const result = validateCase(detectiveCase, {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
    });
    expect(result.isValid).toBe(true);
  });

  it('must name suspects the case has', () => {
    const detectiveCase = buildCheeseCase();
    clueOf(detectiveCase, 'cellar-key').about = ['nobody'];

    expect(issueCodes(detectiveCase)).toEqual(['unknown-reference']);
  });
});

describe('a lie that a conclusion can break', () => {
  const withInsight = (lieBrokenBy: string[], insights: string[]) => {
    const detectiveCase = buildCheeseCase();
    detectiveCase.suspects[2]?.lies.push({
      id: 'mayor-fair',
      statement: 'I care for the fair.',
      brokenBy: lieBrokenBy,
      brokenByInsights: insights,
    });
    return detectiveCase;
  };

  it('is breakable by the conclusion alone when its clues are within reach', () => {
    const detectiveCase = withInsight(['oven-receipt'], ['motive-debt']);
    clueOf(detectiveCase, 'oven-receipt').about = ['mayor'];
    // The office is shut so hard that the receipt is out of reach, and so is the conclusion.
    const office = detectiveCase.locations.find((place) => place.id === 'mayor-office');
    if (office !== undefined) office.access = { kind: 'skill', check: { skill: 'tech', difficulty: 30 } };

    expect(issueCodes(detectiveCase)).toContain('unbreakable-lie');
  });

  it('is breakable when the conclusion is within reach, and a conclusion that does not exist is refused', () => {
    expect(issueCodes(withInsight(['cart-tracks'], ['motive-debt']), false)).toEqual([]);
    expect(issueCodes(withInsight(['cart-tracks'], ['no-such-deduction']), false)).toEqual([
      'unknown-reference',
    ]);
  });
});

describe('the lie an alibi rests on', () => {
  const marking = (marks: boolean[]): CaseIssueCode[] => {
    const detectiveCase = buildCheeseCase();
    const baker = detectiveCase.suspects[0];
    if (baker === undefined) throw new Error('No baker.');
    baker.lies = marks.map((replacesAlibi, index) => ({
      id: `lie-${String(index)}`,
      statement: 'I was at home.',
      admission: 'I went out.',
      brokenBy: ['cart-tracks'],
      ...(replacesAlibi ? { replacesAlibi } : {}),
    }));
    return issueCodes(detectiveCase);
  };

  it('is one lie of a suspect at most', () => {
    expect(marking([true])).toEqual([]);
    expect(marking([false, true, false])).toEqual([]);
    expect(marking([])).toEqual([]);
    expect(marking([true, true])).toEqual(['alibi-replaced-twice']);
  });
});
