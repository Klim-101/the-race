// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { resolveIntent } from './actions.js';
import type { CaseIssueCode } from './case-issue.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { validateCase } from './case-validator.js';
import { CLAIMS_RULESET_VERSION, followUpClaims, openingClaims } from './claims.js';
import { createDetectiveRun, DetectiveRunStateSchema, viewRun, type DetectiveRunState } from './run-state.js';

/** A seed whose first d20 roll is `die`. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

const TRUE_CLAIMS = ['I bake for the whole town.', 'I have never missed a fair.'];

/**
 * The cheese case where the baker has two true claims, the lie of the cart tracks, and a second lie she tells only
 * after it, which the debt ledger breaks.
 */
function buildClaimCase(edit: (detectiveCase: DetectiveCase) => void = () => undefined): DetectiveCase {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  const baker = detectiveCase.suspects.find(({ id }) => id === 'baker');
  if (baker === undefined) throw new Error('No baker.');
  baker.claims = [...TRUE_CLAIMS];
  baker.lies = [
    { id: 'baker-asleep', statement: 'I never left my house last night.', brokenBy: ['cart-tracks'] },
    {
      id: 'baker-broke',
      statement: 'I owe nobody a penny.',
      brokenBy: ['debt-ledger'],
      after: 'baker-asleep',
    },
  ];
  edit(detectiveCase);
  return detectiveCase;
}

function bakerRun(detectiveCase: DetectiveCase): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: 'claims',
    rngState: 1,
    locale: 'en',
  });
  return { ...run, locationId: 'cheese-stall', foundClueIds: ['cart-tracks', 'debt-ledger', 'flour-crumbs'] };
}

function talk(run: DetectiveRunState, clueIds: string[], die = 15) {
  const resolution = resolveIntent(
    run,
    { kind: 'interrogate', suspectId: 'baker', approach: 'social', clueIds },
    dice(die),
  );
  if (!resolution.ok || resolution.outcome.kind !== 'interrogate') throw new Error('Not a talk.');
  return { run: resolution.run, outcome: resolution.outcome };
}

const bakerView = (run: DetectiveRunState) => viewRun(run).suspects.find(({ id }) => id === 'baker');

describe('what a suspect claims at the first talk', () => {
  it('is their story, the true and the false alike, before anything is shown', () => {
    const { run, outcome } = talk(bakerRun(buildClaimCase()), []);

    expect([...(outcome.claimed ?? [])].sort()).toEqual(
      ['I never left my house last night.', ...TRUE_CLAIMS].sort(),
    );
    expect(bakerView(run)?.claims.map(({ text }) => text)).toEqual(outcome.claimed);
    // The lie that follows another is not told yet.
    expect(JSON.stringify(bakerView(run)?.claims)).not.toContain('I owe nobody');
  });

  it('shows nothing that tells a true claim from a lie that stands', () => {
    const { run } = talk(bakerRun(buildClaimCase()), []);

    const claims = bakerView(run)?.claims ?? [];
    expect(claims.map((claim) => Object.keys(claim).sort())).toEqual(
      claims.map(() => ['broken', 'day', 'text']),
    );
    expect(claims.every(({ broken, day }) => broken === null && day === 1)).toBe(true);
  });

  it('is said in the same order every time, and once', () => {
    const first = talk(bakerRun(buildClaimCase()), []);
    const again = talk(bakerRun(buildClaimCase()), []);
    const later = talk(first.run, []);

    expect(first.outcome.claimed).toEqual(again.outcome.claimed);
    expect(later.outcome.claimed).toBeUndefined();
    expect(later.run.claims).toHaveLength(first.run.claims.length);
  });

  it('is not said before the ruleset of claims', () => {
    const old: DetectiveRunState = {
      ...bakerRun(buildClaimCase()),
      rulesetVersion: CLAIMS_RULESET_VERSION - 1,
    };

    const { run, outcome } = talk(old, []);

    expect(outcome.claimed).toBeUndefined();
    expect(run.claims).toEqual([]);
  });

  it('is nothing for a suspect the case gives no claims or lies', () => {
    const detectiveCase = buildClaimCase();
    const bakerSuspect = detectiveCase.suspects.find(({ id }) => id === 'baker');
    if (bakerSuspect === undefined) throw new Error('No baker.');

    expect(openingClaims({ ...bakerSuspect, claims: undefined, lies: [] })).toEqual([]);
    expect(followUpClaims({ ...bakerSuspect, lies: [] }, ['baker-asleep'])).toEqual([]);
    expect(viewRun(bakerRun(detectiveCase)).suspects.find(({ id }) => id === 'rival')?.claims).toEqual([]);
  });
});

describe('a claim that was a lie and has fallen', () => {
  it('is marked and tied to the clues that broke it, while a true claim is not', () => {
    const first = talk(bakerRun(buildClaimCase()), []);

    const { run } = talk(first.run, ['cart-tracks']);

    const claims = bakerView(run)?.claims ?? [];
    expect(claims.filter(({ broken }) => broken !== null)).toEqual([
      { day: 1, text: 'I never left my house last night.', broken: { clueIds: ['cart-tracks'] } },
    ]);
    // The lie that follows the fallen one is claimed now, and stands.
    expect(
      claims
        .filter(({ broken }) => broken === null)
        .map(({ text }) => text)
        .sort(),
    ).toEqual([...TRUE_CLAIMS, 'I owe nobody a penny.'].sort());
  });

  it('is marked with no clue when only a conclusion broke it', () => {
    const detectiveCase = buildClaimCase((built) => {
      const lie = built.suspects[0]?.lies[0];
      if (lie !== undefined) lie.brokenByInsights = ['motive-debt'];
    });
    const first = talk({ ...bakerRun(detectiveCase), insightIds: ['motive-debt'] }, []);

    const resolution = resolveIntent(
      first.run,
      {
        kind: 'interrogate',
        suspectId: 'baker',
        approach: 'pressure',
        clueIds: [],
        insightIds: ['motive-debt'],
      },
      dice(15),
    );
    if (!resolution.ok) throw new Error('Refused.');

    expect(bakerView(resolution.run)?.claims.find(({ text }) => text.startsWith('I never'))).toMatchObject({
      broken: { clueIds: [] },
    });
  });

  it('brings the lie that follows it, claimed on the day the first fell', () => {
    const first = talk(bakerRun(buildClaimCase()), []);
    const caught = talk(first.run, ['cart-tracks']);

    expect(caught.outcome.claimed).toEqual(['I owe nobody a penny.']);
    const second = talk(caught.run, ['debt-ledger']);

    const fallen = (bakerView(second.run)?.claims ?? [])
      .filter(({ broken }) => broken !== null)
      .map(({ text }) => text)
      .sort();
    expect(fallen).toEqual(['I never left my house last night.', 'I owe nobody a penny.']);
  });
});

describe('the claims of a saved run', () => {
  it('survive a trip through JSON, and an old save without them loads with none', () => {
    const { run } = talk(bakerRun(buildClaimCase()), []);

    expect(DetectiveRunStateSchema.parse(JSON.parse(JSON.stringify(run))).claims).toEqual(run.claims);
    const old: Record<string, unknown> = { ...run };
    delete old.claims;
    expect(DetectiveRunStateSchema.parse(old).claims).toEqual([]);
  });

  it('refuse a claim of someone who is not in the case', () => {
    const run = { ...bakerRun(buildClaimCase()), claims: [{ suspectId: 'ghost', day: 1, text: 'Boo.' }] };

    expect(DetectiveRunStateSchema.safeParse(run).success).toBe(false);
  });
});

describe('the validator and the claims', () => {
  function codes(detectiveCase: DetectiveCase, requireClaims = true): CaseIssueCode[] {
    const result = validateCase(detectiveCase, {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
      requireClaims,
    });
    return result.isValid ? [] : result.issues.map(({ code }) => code);
  }

  it('asks a suspect who lies for a true claim, or everything they say would be a lie', () => {
    // The rival of the fixture lies and has no true claim.
    expect(codes(buildClaimCase())).toEqual(['suspect-without-true-claim']);
    expect(codes(buildClaimCase(), false)).toEqual([]);

    const fixed = buildClaimCase((built) => {
      const rival = built.suspects.find(({ id }) => id === 'rival');
      if (rival !== undefined) rival.claims = ['I make cheese in another town.'];
    });
    expect(codes(fixed)).toEqual([]);
  });

  it('checks the words of a claim like any text of the case', () => {
    const detectiveCase = buildClaimCase((built) => {
      const baker = built.suspects.find(({ id }) => id === 'baker');
      if (baker !== undefined) baker.claims = ['Я пеку для всего города.'];
    });

    expect(codes(detectiveCase, false)).toContain('wrong-script');
  });
});
