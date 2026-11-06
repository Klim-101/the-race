// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { TraitSchema } from '../traits.js';
import { resolveIntent } from './actions.js';
import type { CaseIssueCode } from './case-issue.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { validateCase } from './case-validator.js';
import { createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';
import { DETECTIVE_TRAITS } from './traits.js';

/** A seed whose first d20 roll is `die`. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

/**
 * The cheese case where the baker has a line for the debt ledger (which is about her and breaks none of her lies),
 * for the cart tracks (which break her lie), and, by mistake, for the blue glove (which is the rival's).
 */
function buildReactionCase(edit: (detectiveCase: DetectiveCase) => void = () => undefined): DetectiveCase {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  const baker = detectiveCase.suspects.find(({ id }) => id === 'baker');
  if (baker === undefined) throw new Error('No baker.');
  baker.reactions = [
    { clueId: 'debt-ledger', text: 'Everyone owes someone in this town. Ask the mayor about his own page.' },
    { clueId: 'cart-tracks', text: 'A cart goes where a cart goes. It proves nothing.' },
    { clueId: 'blue-glove', text: 'Whose glove? Not mine, I do not wear blue.' },
  ];
  edit(detectiveCase);
  return detectiveCase;
}

function bakerRun(detectiveCase: DetectiveCase): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: 'reactions',
    rngState: 1,
    locale: 'en',
  });
  return {
    ...run,
    locationId: 'cheese-stall',
    foundClueIds: ['debt-ledger', 'cart-tracks', 'blue-glove', 'flour-crumbs'],
  };
}

function show(run: DetectiveRunState, clueIds: string[]) {
  const resolution = resolveIntent(
    run,
    { kind: 'interrogate', suspectId: 'baker', approach: 'pressure', clueIds },
    dice(15),
  );
  if (!resolution.ok || resolution.outcome.kind !== 'interrogate') throw new Error('Not a talk.');
  return { run: resolution.run, outcome: resolution.outcome };
}

describe('what a suspect says about a clue shown to them', () => {
  it('is their line for it, when the clue bears on them but breaks none of their lies', () => {
    const { run, outcome } = show(bakerRun(buildReactionCase()), ['debt-ledger']);

    expect(outcome.presented).toEqual([
      {
        clueId: 'debt-ledger',
        effect: 'implicates',
        reaction: 'Everyone owes someone in this town. Ask the mayor about his own page.',
      },
    ]);
    expect(run.history.shown).toMatchObject([
      {
        suspectId: 'baker',
        clueId: 'debt-ledger',
        reaction: expect.stringContaining('owes someone') as unknown,
      },
    ]);
    expect(viewRun(run).history.shown[0]?.reaction).toContain('mayor');
  });

  it('is their line for a clue that breaks a lie as well', () => {
    const { outcome } = show(bakerRun(buildReactionCase()), ['cart-tracks']);

    expect(outcome.presented).toEqual([
      {
        clueId: 'cart-tracks',
        effect: 'breaks-lie',
        reaction: 'A cart goes where a cart goes. It proves nothing.',
      },
    ]);
  });

  it('is nothing for a clue that is not about them, so a reaction never tells that it was', () => {
    const { run, outcome } = show(bakerRun(buildReactionCase()), ['blue-glove']);

    expect(outcome.presented).toEqual([{ clueId: 'blue-glove', effect: 'no-effect' }]);
    expect(run.history.shown[0]).not.toHaveProperty('reaction');
  });

  it('is the generic answer when the case gives them no line for the clue', () => {
    const { outcome } = show(bakerRun(buildReactionCase()), ['flour-crumbs']);

    expect(outcome.presented).toEqual([{ clueId: 'flour-crumbs', effect: 'implicates' }]);
  });

  it('is told for each clue shown at once, in the order shown', () => {
    const { outcome } = show(bakerRun(buildReactionCase()), ['cart-tracks', 'flour-crumbs', 'debt-ledger']);

    expect(outcome.presented.map(({ clueId, reaction }) => [clueId, reaction !== undefined])).toEqual([
      ['cart-tracks', true],
      ['flour-crumbs', false],
      ['debt-ledger', true],
    ]);
  });
});

describe('the validator and the reactions', () => {
  function codes(
    detectiveCase: DetectiveCase,
    traits = [] as ReturnType<typeof TraitSchema.parse>[],
    frame = false,
  ) {
    const result = validateCase(detectiveCase, {
      hero: buildHero(),
      traits,
      locale: 'en',
      realNames: [],
      frame,
    });
    return result.isValid ? ([] as CaseIssueCode[]) : result.issues.map(({ code }) => code);
  }

  it('refuses a line for a clue that is not about the suspect, as a tell', () => {
    // The fixture's blue glove points at the rival, not at the baker.
    expect(codes(buildReactionCase())).toEqual(['reaction-not-tied']);

    const tied = buildReactionCase((built) => {
      const glove = built.clues.find(({ id }) => id === 'blue-glove');
      if (glove !== undefined) glove.about = ['baker'];
    });
    expect(codes(tied)).toEqual([]);
  });

  it('refuses a line for a clue that does not exist', () => {
    const detectiveCase = buildReactionCase((built) => {
      const baker = built.suspects.find(({ id }) => id === 'baker');
      if (baker?.reactions?.[2] !== undefined) baker.reactions[2].clueId = 'no-such-clue';
    });

    expect(codes(detectiveCase)).toEqual(['unknown-reference']);
  });

  it('refuses a line that names a trait of the hero', () => {
    const first = DETECTIVE_TRAITS[0];
    if (first === undefined) throw new Error('No traits.');
    const trait = TraitSchema.parse(first);
    const detectiveCase = buildReactionCase((built) => {
      const glove = built.clues.find(({ id }) => id === 'blue-glove');
      if (glove !== undefined) glove.about = ['baker'];
      const baker = built.suspects.find(({ id }) => id === 'baker');
      if (baker?.reactions?.[0] !== undefined) baker.reactions[0].text = `You are a ${trait.id}, detective.`;
    });

    expect(codes(detectiveCase, [trait])).toEqual(['reaction-names-trait']);
    expect(codes(detectiveCase)).toEqual([]);
  });

  it('judges whom a line is for in a frame, and what it says only once it is written', () => {
    const first = DETECTIVE_TRAITS[0];
    if (first === undefined) throw new Error('No traits.');
    const trait = TraitSchema.parse(first);
    const named = buildReactionCase((built) => {
      const glove = built.clues.find(({ id }) => id === 'blue-glove');
      if (glove !== undefined) glove.about = ['baker'];
      const baker = built.suspects.find(({ id }) => id === 'baker');
      if (baker?.reactions?.[0] !== undefined) baker.reactions[0].text = `You are a ${trait.id}, detective.`;
    });

    expect(codes(named, [trait], false)).toEqual(['reaction-names-trait']);
    expect(codes(named, [trait], true)).toEqual([]);
    // A line for a clue that is not about the suspect is a fact of the frame.
    expect(codes(buildReactionCase(), [trait], true)).toEqual(['reaction-not-tied']);
  });

  it('checks the words of a line like any text of the case', () => {
    const detectiveCase = buildReactionCase((built) => {
      const glove = built.clues.find(({ id }) => id === 'blue-glove');
      if (glove !== undefined) glove.about = ['baker'];
      const baker = built.suspects.find(({ id }) => id === 'baker');
      if (baker?.reactions?.[0] !== undefined) baker.reactions[0].text = 'Все должны всем.';
    });

    expect(codes(detectiveCase)).toContain('wrong-script');
  });
});
