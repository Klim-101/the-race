// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { resolveIntent, type Resolved } from './actions.js';
import { validateCase } from './case-validator.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import type { CaseIssueCode } from './case-issue.js';
import { computeObtainable, canEverPass } from './obtainability.js';
import { createDetectiveRun, findClue, moveTo, type DetectiveRunState } from './run-state.js';

/** A seed whose first d20 roll is `die`. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

function talk(run: DetectiveRunState, clueIds: string[], rng: Rng) {
  const resolution: Resolved = resolveIntent(
    run,
    { kind: 'interrogate', suspectId: 'baker', approach: 'pressure', clueIds },
    rng,
  );
  if (!resolution.ok || resolution.outcome.kind !== 'interrogate') throw new Error('Not a talk.');
  return { run: resolution.run, outcome: resolution.outcome };
}

/**
 * The cheese case where the baker's first lie has an admission, a second lie that she tells only after it, and
 * the ledger she hands over as testimony once the second has fallen.
 */
function buildAdmissionCase(edit: (detectiveCase: DetectiveCase) => void = () => undefined): DetectiveCase {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  const baker = detectiveCase.suspects.find(({ id }) => id === 'baker');
  if (baker === undefined) throw new Error('No baker.');
  baker.lies = [
    {
      id: 'baker-asleep',
      statement: 'I never left my house last night.',
      brokenBy: ['cart-tracks'],
      admission: 'Fine, I went down to the cellar, but only to fetch flour.',
    },
    {
      id: 'baker-flour',
      statement: 'I took nothing from the cellar.',
      brokenBy: ['flour-crumbs'],
      admission: 'I took a cart of cheese to a buyer.',
      after: 'baker-asleep',
      gives: 'oven-receipt',
    },
  ];
  edit(detectiveCase);
  return detectiveCase;
}

function atBaker(detectiveCase: DetectiveCase): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: 'admission',
    rngState: 1,
    locale: 'en',
  });
  return moveTo(findClue(findClue(run, 'cart-tracks'), 'flour-crumbs'), 'cheese-stall');
}

describe('what a suspect says once a lie has fallen', () => {
  it('is the admission, in the notebook and in the outcome, and the lie itself is still named', () => {
    const { run, outcome } = talk(atBaker(buildAdmissionCase()), ['cart-tracks'], dice(15));

    expect(outcome.conceded).toEqual([
      {
        lieId: 'baker-asleep',
        statement: 'I never left my house last night.',
        admission: 'Fine, I went down to the cellar, but only to fetch flour.',
      },
    ]);
    expect(run.statements.filter(({ kind }) => kind === 'conceded')).toMatchObject([
      { suspectId: 'baker', text: 'Fine, I went down to the cellar, but only to fetch flour.' },
    ]);
  });

  it('is the lie itself for a lie with no admission, as it always was', () => {
    const detectiveCase = buildAdmissionCase((built) => {
      const lie = built.suspects[0]?.lies[0];
      if (lie !== undefined) delete lie.admission;
    });

    const { run, outcome } = talk(atBaker(detectiveCase), ['cart-tracks'], dice(15));

    expect(outcome.conceded).toEqual([
      { lieId: 'baker-asleep', statement: 'I never left my house last night.' },
    ]);
    expect(run.statements.filter(({ kind }) => kind === 'conceded')).toMatchObject([
      { text: 'I never left my house last night.' },
    ]);
  });
});

describe('a lie that follows another', () => {
  it('does not stand until the first has fallen: the same talk cannot break both', () => {
    const { run, outcome } = talk(atBaker(buildAdmissionCase()), ['cart-tracks', 'flour-crumbs'], dice(15));

    expect(outcome.conceded.map(({ lieId }) => lieId)).toEqual(['baker-asleep']);
    expect(outcome.presented).toEqual([
      { clueId: 'cart-tracks', effect: 'breaks-lie' },
      { clueId: 'flour-crumbs', effect: 'implicates' },
    ]);
    expect(run.concededLieIds).toEqual(['baker-asleep']);
  });

  it('is caught in the next talk, and then hands over its testimony', () => {
    const first = talk(atBaker(buildAdmissionCase()), ['cart-tracks'], dice(15));
    expect(first.run.foundClueIds).not.toContain('oven-receipt');

    const second = talk(first.run, ['flour-crumbs'], dice(15));

    expect(second.outcome.conceded.map(({ lieId }) => lieId)).toEqual(['baker-flour']);
    expect(second.outcome.told).toEqual(['oven-receipt']);
    expect(second.run.foundClueIds).toContain('oven-receipt');
  });

  it('records the clue as found where the talk was held, not where the thing lies', () => {
    const first = talk(atBaker(buildAdmissionCase()), ['cart-tracks'], dice(15));
    const second = talk(first.run, ['flour-crumbs'], dice(15));

    const clue = second.run.case.clues.find(({ id }) => id === 'oven-receipt');
    expect(clue?.locationId).toBe('mayor-office');
    expect(second.run.history.finds.find(({ clueId }) => clueId === 'oven-receipt')).toMatchObject({
      locationId: 'cheese-stall',
    });
    // A clue found on the spot is still recorded in its own place.
    expect(second.run.history.finds.find(({ clueId }) => clueId === 'cart-tracks')?.locationId).toBe(
      second.run.case.clues.find(({ id }) => id === 'cart-tracks')?.locationId,
    );
  });

  it('hands its testimony over even when the roll fails and only this lie falls', () => {
    const first = talk(atBaker(buildAdmissionCase()), ['cart-tracks'], dice(15));

    const second = talk(first.run, ['flour-crumbs'], dice(2));

    expect(second.outcome.succeeded).toBe(false);
    expect(second.outcome.told).toEqual(['oven-receipt']);
  });

  it('gives no testimony twice, and none when the clue is already in hand', () => {
    const run = atBaker(buildAdmissionCase());
    const held = findClue(run, 'oven-receipt');
    const first = talk(held, ['cart-tracks'], dice(15));
    const second = talk(first.run, ['flour-crumbs'], dice(15));

    expect(second.outcome.conceded.map(({ lieId }) => lieId)).toEqual(['baker-flour']);
    expect(second.outcome.told).toBeUndefined();
  });
});

describe('the validator and a lie that follows another', () => {
  function codes(detectiveCase: DetectiveCase, requireAdmissions = false): CaseIssueCode[] {
    const result = validateCase(detectiveCase, {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
      requireAdmissions,
    });
    return result.isValid ? [] : result.issues.map(({ code }) => code);
  }

  it('accepts a chain with testimony that lies in no part', () => {
    expect(codes(buildAdmissionCase())).toEqual([]);
  });

  it('refuses a lie that follows one that does not exist, or one that comes after it', () => {
    expect(
      codes(
        buildAdmissionCase((built) => {
          const lie = built.suspects[0]?.lies[1];
          if (lie !== undefined) lie.after = 'no-such-lie';
        }),
      ),
    ).toEqual(['unknown-reference']);
    expect(
      codes(
        buildAdmissionCase((built) => {
          const lie = built.suspects[0]?.lies[0];
          if (lie !== undefined) lie.after = 'baker-flour';
        }),
      ),
    ).toEqual(['lie-chain-broken']);
    expect(
      codes(
        buildAdmissionCase((built) => {
          const lie = built.suspects[0]?.lies[1];
          if (lie !== undefined) lie.after = 'rival-away';
        }),
      ),
    ).toEqual(['lie-chain-broken']);
  });

  it('refuses testimony that is no clue of the case', () => {
    const issues = codes(
      buildAdmissionCase((built) => {
        const lie = built.suspects[0]?.lies[1];
        if (lie !== undefined) lie.gives = 'no-such-clue';
      }),
    );

    expect(issues).toEqual(['unknown-reference']);
  });

  it('asks every lie of a generated case for its admission, and no more', () => {
    const detectiveCase = buildAdmissionCase((built) => {
      const lie = built.suspects[0]?.lies[1];
      if (lie !== undefined) delete lie.admission;
    });

    expect(codes(detectiveCase)).toEqual([]);
    // The rival's lie in the fixture has none either.
    expect(codes(detectiveCase, true)).toEqual(['lie-without-admission', 'lie-without-admission']);
  });

  it('checks the admission like any text of the case', () => {
    const issues = codes(
      buildAdmissionCase((built) => {
        const lie = built.suspects[0]?.lies[0];
        if (lie !== undefined) lie.admission = 'Да, я ходил в подвал за мукой.';
      }),
    );

    expect(issues).toContain('wrong-script');
  });

  it('counts testimony as obtainable only when the lies before it can be broken', () => {
    const reaches = (edit: (built: DetectiveCase) => void): boolean => {
      const built = buildAdmissionCase((c) => {
        // Out of reach by a search, so that only the testimony can bring the receipt.
        const receipt = c.clues.find(({ id }) => id === 'oven-receipt');
        if (receipt !== undefined) receipt.discovery = { skill: 'reasoning', difficulty: 30 };
        edit(c);
      });
      return computeObtainable(built, canEverPass(buildHero(), [])).clueIds.has('oven-receipt');
    };
    const noTracks = (c: DetectiveCase): void => {
      const tracks = c.clues.find(({ id }) => id === 'cart-tracks');
      if (tracks !== undefined) tracks.discovery = { skill: 'perception', difficulty: 30 };
    };

    expect(reaches(() => undefined)).toBe(true);
    // The first lie can never be broken, so the one that follows is never told.
    expect(reaches(noTracks)).toBe(false);
  });
});
