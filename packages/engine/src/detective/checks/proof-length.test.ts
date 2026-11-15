// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import { DetectiveCaseSchema } from '../case-schema.js';
import { minutesToGather } from './flee-deadline.js';
import { MIN_PROOF_MINUTES, checkProofLength } from './proof-length.js';

const hero = buildHero();
const whodunit = () => DetectiveCaseSchema.parse(buildCheeseCase());

/** What the plan of the validator says the cheapest chain and the motive take in the cheese case. */
function cheapest(): number {
  const built = whodunit();
  const motive = built.deductions
    .filter(({ id }) => id === built.solution.motiveDeductionId)
    .flatMap(({ clueIds }) => clueIds);
  return Math.min(
    ...built.solution.evidenceChains.map(
      (chain) =>
        minutesToGather(built, new Set([...chain, ...motive]), {
          canPass: () => true,
          closed: new Set(),
          closures: [],
        }) ?? Infinity,
    ),
  );
}

describe('the length of the proof of a whodunit', () => {
  it('is at least twelve hours of play, as the plan counts them', () => {
    expect(MIN_PROOF_MINUTES).toBe(240);
  });

  it('passes a case whose cheapest chain takes as long as asked, and fails one a minute short', () => {
    const minutes = cheapest();

    expect(checkProofLength(whodunit(), hero, [], minutes)).toEqual([]);
    expect(checkProofLength(whodunit(), hero, [], minutes + 1)).toMatchObject([
      { code: 'proof-too-quick', path: 'solution.evidenceChains' },
    ]);
  });

  it('says how long the proof takes and how long it must, and names no clue, place or suspect', () => {
    const minutes = cheapest();
    const [issue] = checkProofLength(whodunit(), hero, [], minutes + 100);

    expect(issue?.message).toContain(`about ${String(minutes)} minutes`);
    expect(issue?.message).toContain(`at least ${String(minutes + 100)}`);
    expect(issue?.message).not.toMatch(/baker|cellar|ledger|receipt/i);
  });

  it('does not judge an abduction or an attempt: they have a deadline and reports at set times', () => {
    for (const form of ['abduction', 'homicide']) {
      const built = whodunit();
      expect(checkProofLength({ ...built, form } as never, hero, [], 100_000), form).toEqual([]);
    }
  });

  it('leaves a case whose proof cannot be gathered to the checks that say so', () => {
    const built = buildCheeseCase();
    for (const clue of built.clues) clue.discovery = { skill: 'tech', difficulty: 30 };

    expect(checkProofLength(DetectiveCaseSchema.parse(built), hero, [], 100_000)).toEqual([]);
  });
});
