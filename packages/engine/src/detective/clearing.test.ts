// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng } from '../dice.js';
import type { CaseIssueCode } from './case-issue.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { validateCase } from './case-validator.js';
import { createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';
import { deduce } from './verdict.js';

/**
 * The cheese case where the baker is the culprit, and two clues are red herrings: the blue glove (the rival's) and,
 * here, the cellar key (the mayor's). A deduction clears the rival with the glove; another clears the mayor.
 */
function buildClearingCase(edit: (detectiveCase: DetectiveCase) => void = () => undefined): DetectiveCase {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  const key = detectiveCase.clues.find(({ id }) => id === 'cellar-key');
  if (key !== undefined) {
    key.isRedHerring = true;
    key.pointsTo = ['mayor'];
  }
  // What each of them hid, and why: the thread a red herring owes the suspect it points at.
  const rival = detectiveCase.suspects.find(({ id }) => id === 'rival');
  const rivalLie = rival?.lies[0];
  if (rivalLie !== undefined) rivalLie.admission = 'I came to taste the cheese, not to steal it.';
  const mayor = detectiveCase.suspects.find(({ id }) => id === 'mayor');
  mayor?.lies.push({
    id: 'mayor-dinner',
    statement: 'I never touched the cellar key.',
    admission: 'I lent the key to the buyer and was ashamed to say so.',
    brokenBy: ['cellar-key'],
  });
  detectiveCase.deductions.push(
    {
      id: 'cleared-rival',
      clueIds: ['blue-glove', 'flour-crumbs'],
      insight: "The glove is a cheesemaker's, and the flour on the plinth is not his trade.",
      clears: 'rival',
    },
    {
      id: 'cleared-mayor',
      clueIds: ['cellar-key', 'cart-tracks'],
      insight: 'The key opens nothing the tracks lead to.',
      clears: 'mayor',
    },
  );
  edit(detectiveCase);
  return detectiveCase;
}

function newRun(detectiveCase: DetectiveCase, found: string[], insights: string[] = []): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: 'clearing',
    rngState: 1,
    locale: 'en',
  });
  return { ...run, foundClueIds: found, insightIds: insights };
}

describe('clearing a suspect', () => {
  const ALL = ['cellar-key', 'flour-crumbs', 'cart-tracks', 'oven-receipt', 'debt-ledger', 'blue-glove'];

  it('is not given: nobody is cleared before the hero draws the conclusion that clears them', () => {
    const view = viewRun(newRun(buildClearingCase(), ALL));

    expect(view.suspects.map(({ id, cleared }) => [id, cleared])).toEqual([
      ['baker', false],
      ['rival', false],
      ['mayor', false],
    ]);
    expect(view.insights).toEqual([]);
  });

  it('is earned by the conclusion, which says so in the outcome and in the view', () => {
    const run = newRun(buildClearingCase(), ALL);

    const resolution = deduce(run, { kind: 'deduce', clueIds: ['blue-glove', 'flour-crumbs'] }, createRng(1));
    if (!resolution.ok) throw new Error('Not a conclusion.');

    expect(resolution.outcome).toMatchObject({
      result: 'insight',
      deductionId: 'cleared-rival',
      clears: 'rival',
    });
    const view = viewRun(resolution.run);
    expect(view.suspects.map(({ id, cleared }) => [id, cleared])).toEqual([
      ['baker', false],
      ['rival', true],
      ['mayor', false],
    ]);
    expect(view.insights).toMatchObject([{ id: 'cleared-rival', clears: 'rival' }]);
  });

  it('says nothing of clearing for a conclusion that clears no one', () => {
    const resolution = deduce(
      newRun(buildClearingCase(), ALL),
      { kind: 'deduce', clueIds: ['oven-receipt', 'debt-ledger'] },
      createRng(1),
    );
    if (!resolution.ok) throw new Error('Not a conclusion.');

    expect(resolution.outcome).not.toHaveProperty('clears');
  });
});

describe('the validator and clearing', () => {
  function codes(detectiveCase: DetectiveCase, requireClearing = true): CaseIssueCode[] {
    const result = validateCase(detectiveCase, {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
      requireClearing,
    });
    return result.isValid ? [] : result.issues.map(({ code }) => code);
  }

  it('accepts a case in which every innocent suspect is clearable and every red herring explained', () => {
    expect(codes(buildClearingCase())).toEqual([]);
  });

  it('refuses a deduction that clears the culprit, even when clearing is not asked for', () => {
    const detectiveCase = buildClearingCase((built) => {
      const deduction = built.deductions.find(({ id }) => id === 'cleared-rival');
      if (deduction !== undefined) deduction.clears = 'baker';
    });

    expect(codes(detectiveCase, false)).toEqual(['culprit-cleared']);
    expect(codes(detectiveCase)).toContain('culprit-cleared');
  });

  it('refuses a deduction that clears someone who is no suspect', () => {
    const detectiveCase = buildClearingCase((built) => {
      const deduction = built.deductions.find(({ id }) => id === 'cleared-rival');
      if (deduction !== undefined) deduction.clears = 'nobody';
    });

    expect(codes(detectiveCase)).toContain('unknown-reference');
  });

  it('refuses an innocent suspect nothing clears, and one whose clearing clues the hero can never find', () => {
    const none = buildClearingCase((built) => {
      built.deductions = built.deductions.filter(({ id }) => id !== 'cleared-mayor');
    });
    expect(codes(none)).toContain('suspect-cannot-be-cleared');

    const unreachable = buildClearingCase((built) => {
      const clue = built.clues.find(({ id }) => id === 'flour-crumbs');
      if (clue !== undefined) clue.discovery = { skill: 'perception', difficulty: 30 };
    });
    expect(codes(unreachable)).toContain('suspect-cannot-be-cleared');
  });

  it('refuses a red herring that is no clue of the conclusion that clears the one it points at', () => {
    const detectiveCase = buildClearingCase((built) => {
      const deduction = built.deductions.find(({ id }) => id === 'cleared-mayor');
      if (deduction !== undefined) deduction.clueIds = ['cart-tracks', 'oven-receipt'];
      // The thread is by the conclusion put to the mayor, so that only the herring is left unexplained.
      const lie = built.suspects.find(({ id }) => id === 'mayor')?.lies[0];
      if (lie !== undefined) lie.brokenByInsights = ['cleared-mayor'];
    });

    expect(codes(detectiveCase)).toEqual(['red-herring-unexplained']);
  });

  describe('the thread of a suspect a red herring points at', () => {
    const mayorLie = (built: DetectiveCase) => {
      const lie = built.suspects.find(({ id }) => id === 'mayor')?.lies[0];
      if (lie === undefined) throw new Error('No lie.');
      return lie;
    };

    it('is a lie, broken by a clue of the clearing conclusion, with an admission', () => {
      expect(codes(buildClearingCase())).toEqual([]);
    });

    it('is missing when the suspect has no lie to be caught in', () => {
      const detectiveCase = buildClearingCase((built) => {
        const mayor = built.suspects.find(({ id }) => id === 'mayor');
        if (mayor !== undefined) mayor.lies = [];
      });

      expect(codes(detectiveCase)).toEqual(['red-herring-without-thread']);
    });

    it('is missing when the lie has no admission, or is broken by nothing of the clearing conclusion', () => {
      const bare = buildClearingCase((built) => {
        delete mayorLie(built).admission;
      });
      const apart = buildClearingCase((built) => {
        const lie = mayorLie(built);
        lie.brokenBy = ['oven-receipt'];
      });

      expect(codes(bare)).toContain('red-herring-without-thread');
      expect(codes(apart)).toEqual(['red-herring-without-thread']);
    });

    it('may come by testimony the lie gives, or by the conclusion put to the suspect', () => {
      const gives = buildClearingCase((built) => {
        const lie = mayorLie(built);
        lie.brokenBy = ['oven-receipt'];
        lie.gives = 'cellar-key';
      });
      const insight = buildClearingCase((built) => {
        const lie = mayorLie(built);
        lie.brokenBy = ['oven-receipt'];
        lie.brokenByInsights = ['cleared-mayor'];
      });

      expect(codes(gives)).toEqual([]);
      expect(codes(insight)).toEqual([]);
    });

    it('is asked of nobody else: not the culprit, not a suspect no red herring points at', () => {
      const detectiveCase = buildClearingCase((built) => {
        const key = built.clues.find(({ id }) => id === 'cellar-key');
        if (key !== undefined) key.isRedHerring = false;
        const mayor = built.suspects.find(({ id }) => id === 'mayor');
        if (mayor !== undefined) mayor.lies = [];
      });

      expect(codes(detectiveCase)).toEqual([]);
    });
  });

  it('lets a red herring that points at no one, or at the culprit, go unexplained', () => {
    const detectiveCase = buildClearingCase((built) => {
      const key = built.clues.find(({ id }) => id === 'cellar-key');
      if (key !== undefined) key.pointsTo = ['baker'];
      const glove = built.clues.find(({ id }) => id === 'blue-glove');
      if (glove !== undefined) glove.pointsTo = [];
    });

    expect(codes(detectiveCase)).toEqual([]);
  });

  it('asks nothing of a case that is not a generated one', () => {
    const detectiveCase = buildClearingCase((built) => {
      built.deductions = built.deductions.filter(({ clears }) => clears === undefined);
    });

    expect(codes(detectiveCase, false)).toEqual([]);
  });
});
