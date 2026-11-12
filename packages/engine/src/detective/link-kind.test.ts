// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { DetectiveCaseSchema, type Deduction, type DetectiveCase } from './case-schema.js';
import {
  LINK_KINDS,
  addInsight,
  createDetectiveRun,
  linkKindOf,
  openLinkKinds,
  openLinkSizes,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';

const deduction = (id: string, size: number, clears?: string): Deduction => ({
  id,
  clueIds: Array.from({ length: size }, (_, index) => `clue-${id}-${String(index)}`),
  insight: `Insight of ${id}.`,
  ...(clears === undefined ? {} : { clears }),
});

/**
 * A case whose conclusions are laid out as the test says. Only the conclusions and the solution are read, so the
 * clues they name need not exist and the case is never put through the validator.
 */
function caseWith(deductions: Deduction[], solution: Partial<DetectiveCase['solution']>): DetectiveCase {
  const base = DetectiveCaseSchema.parse(buildCheeseCase());
  return { ...base, deductions, solution: { ...base.solution, ...solution } };
}

function runOf(detectiveCase: DetectiveCase): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: 'link-kind',
    rngState: 1,
    locale: 'en',
  });
}

describe('the kind of a conclusion', () => {
  it('is the motive for the conclusion the solution names as the motive', () => {
    const motive = deduction('why', 2);
    const detectiveCase = caseWith([motive], { motiveDeductionId: 'why' });

    expect(linkKindOf(detectiveCase, motive)).toBe('motive');
  });

  it('is the means for a homicide conclusion of what it was done with', () => {
    const means = deduction('with-what', 3);
    const detectiveCase = caseWith([deduction('why', 2), means], {
      motiveDeductionId: 'why',
      meansDeductionId: 'with-what',
    });

    expect(linkKindOf(detectiveCase, means)).toBe('means');
  });

  it('is the whereabouts for an abduction conclusion of where the victim is kept', () => {
    const place = deduction('where', 2);
    const detectiveCase = caseWith([deduction('why', 2), place], {
      motiveDeductionId: 'why',
      whereaboutsDeductionId: 'where',
    });

    expect(linkKindOf(detectiveCase, place)).toBe('whereabouts');
  });

  it('is an alibi for a conclusion that clears a suspect', () => {
    const alibi = deduction('not-her', 2, 'rival');
    const detectiveCase = caseWith([deduction('why', 2), alibi], { motiveDeductionId: 'why' });

    expect(linkKindOf(detectiveCase, alibi)).toBe('alibi');
  });

  it('is a trail for any other conclusion', () => {
    const trail = deduction('who-was-there', 2);
    const detectiveCase = caseWith([deduction('why', 2), trail], { motiveDeductionId: 'why' });

    expect(linkKindOf(detectiveCase, trail)).toBe('trail');
  });

  it('takes the motive before an alibi when one conclusion is both', () => {
    const both = deduction('why', 2, 'rival');
    const detectiveCase = caseWith([both], { motiveDeductionId: 'why' });

    expect(linkKindOf(detectiveCase, both)).toBe('motive');
  });

  it('is one of the kinds the view can name, for every conclusion of a case laid out with all of them', () => {
    const all = [
      deduction('why', 2),
      deduction('with-what', 3),
      deduction('where', 2),
      deduction('not-her', 2, 'rival'),
      deduction('who-was-there', 3),
    ];
    const detectiveCase = caseWith(all, {
      motiveDeductionId: 'why',
      meansDeductionId: 'with-what',
      whereaboutsDeductionId: 'where',
    });

    expect(all.map((each) => linkKindOf(detectiveCase, each)).toSorted()).toEqual([...LINK_KINDS].toSorted());
  });
});

describe('the kinds of the conclusions still to be made', () => {
  // A run refuses a means outside a homicide and a whereabouts outside an abduction, so these are the kinds of a whodunit.
  const all = [
    deduction('who-was-there', 3),
    deduction('not-her', 2, 'rival'),
    deduction('how-in', 3),
    deduction('why', 2),
  ];
  const detectiveCase = caseWith(all, { motiveDeductionId: 'why' });

  it('go with the sizes, index for index, smallest first and by kind among the same size', () => {
    const run = runOf(detectiveCase);

    expect(openLinkSizes(run)).toEqual([2, 2, 3, 3]);
    expect(openLinkKinds(run)).toEqual(['motive', 'alibi', 'trail', 'trail']);
  });

  it('drop a conclusion once it is drawn, with its size', () => {
    const run = addInsight(runOf(detectiveCase), 'why');

    expect(openLinkSizes(run)).toEqual([2, 3, 3]);
    expect(openLinkKinds(run)).toEqual(['alibi', 'trail', 'trail']);
  });

  it('are empty when every conclusion is drawn', () => {
    const run = all.reduce((state, { id }) => addInsight(state, id), runOf(detectiveCase));

    expect(openLinkKinds(run)).toEqual([]);
  });

  it('count a link by its distinct clues, as the size does', () => {
    const repeated: Deduction = { ...deduction('why', 2), clueIds: ['a', 'a', 'b'] };
    const run = runOf(caseWith([repeated], { motiveDeductionId: 'why' }));

    expect(openLinkSizes(run)).toEqual([2]);
    expect(openLinkKinds(run)).toEqual(['motive']);
  });

  it('are in the view next to the sizes and name no clue, no suspect and no conclusion', () => {
    const view = viewRun(runOf(detectiveCase));

    expect(view.openLinkKinds).toHaveLength(view.openLinks.length);
    expect(view.openLinkKinds.every((kind) => LINK_KINDS.includes(kind))).toBe(true);
    const text = JSON.stringify([view.openLinks, view.openLinkKinds]);
    for (const { id, clueIds, clears } of all) {
      expect(text).not.toContain(id);
      for (const clueId of clueIds) expect(text).not.toContain(clueId);
      if (clears !== undefined) expect(text).not.toContain(clears);
    }
  });
});
