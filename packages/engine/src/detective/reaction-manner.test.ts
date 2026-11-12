// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { MANNERS, REACTION_MANNER_RULESET_VERSION, mannerOf } from './reaction-manner.js';
import { addInsight, createDetectiveRun, type DetectiveRunState } from './run-state.js';

function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

function bakerRun(ruleset?: number): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'manner',
    rngState: 1,
    locale: 'en',
  });
  return {
    ...run,
    ...(ruleset === undefined ? {} : { rulesetVersion: ruleset }),
    locationId: 'cheese-stall',
    foundClueIds: ['debt-ledger', 'cart-tracks', 'blue-glove', 'flour-crumbs', 'cellar-key'],
  };
}

function talk(run: DetectiveRunState, clueIds: string[], insightIds: string[] = []) {
  const resolution = resolveIntent(
    run,
    { kind: 'interrogate', suspectId: 'baker', approach: 'social', clueIds, insightIds },
    dice(1),
  );
  if (!resolution.ok || resolution.outcome.kind !== 'interrogate') throw new Error('Not a talk.');
  return resolution.outcome;
}

describe('the manner of a suspect before a thing shown', () => {
  it('is always one of the manners, and the same for the same ids', () => {
    for (let n = 0; n < 200; n += 1) {
      const manner = mannerOf(`suspect-${String(n)}`, `clue-${String(n * 7)}`);
      expect(MANNERS).toContain(manner);
      expect(mannerOf(`suspect-${String(n)}`, `clue-${String(n * 7)}`)).toBe(manner);
    }
  });

  it('is spread over all of them, so a suspect is not always met with the same silence', () => {
    const seen = new Set(Array.from({ length: 60 }, (_, n) => mannerOf('baker', `clue-${String(n)}`)));
    expect(seen.size).toBe(MANNERS.length);
  });

  it('is given to a clue that implicates and has no line of the suspect, and to nothing that did nothing', () => {
    const outcome = talk(bakerRun(), ['flour-crumbs', 'cellar-key']);

    expect(outcome.presented).toEqual([
      { clueId: 'flour-crumbs', effect: 'implicates', manner: mannerOf('baker', 'flour-crumbs') },
      { clueId: 'cellar-key', effect: 'no-effect' },
    ]);
  });

  it('is not given to a clue the suspect has words for', () => {
    const run = bakerRun();
    const baker = run.case.suspects.find(({ id }) => id === 'baker');
    if (baker === undefined) throw new Error('No baker.');
    const withLine = {
      ...run,
      case: {
        ...run.case,
        suspects: run.case.suspects.map((suspect) =>
          suspect === baker
            ? { ...suspect, reactions: [{ clueId: 'flour-crumbs', text: 'Flour is flour.' }] }
            : suspect,
        ),
      },
    };

    expect(talk(withLine, ['flour-crumbs']).presented).toEqual([
      { clueId: 'flour-crumbs', effect: 'implicates', reaction: 'Flour is flour.' },
    ]);
  });

  it('is given to a conclusion put to the suspect, which has no line of its own', () => {
    const run = addInsight(bakerRun(), 'motive-debt');
    const outcome = talk(run, [], ['motive-debt']);

    expect(outcome.presentedInsights).toEqual([
      { insightId: 'motive-debt', effect: 'implicates', manner: mannerOf('baker', 'motive-debt') },
    ]);
  });

  it('is left out of a run from before it, so its log replays as it was', () => {
    const outcome = talk(bakerRun(REACTION_MANNER_RULESET_VERSION - 1), ['flour-crumbs']);

    expect(outcome.presented).toEqual([{ clueId: 'flour-crumbs', effect: 'implicates' }]);
  });
});
