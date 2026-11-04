// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng } from '../dice.js';
import { DAY_START_MINUTE } from '../run.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { createDetectiveRun, endRun, viewRun, type DetectiveRunState } from './run-state.js';
import {
  DEDUCE_MINUTES,
  FAILED_DEDUCTION_MINUTES,
  LENIENT_LINKS_RULESET_VERSION,
  VERDICTS,
  accuse,
  deduce,
  type AccuseResolution,
  type DeduceResolution,
} from './verdict.js';

const ALL_CLUES = ['cellar-key', 'flour-crumbs', 'cart-tracks', 'oven-receipt', 'debt-ledger', 'blue-glove'];

function newRun(
  found: readonly string[] = ALL_CLUES,
  insights: readonly string[] = [],
  detectiveCase: DetectiveCase = DetectiveCaseSchema.parse(buildCheeseCase()),
): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: 'verdict',
    rngState: 1,
    locale: 'en',
  });
  return { ...run, foundClueIds: [...found], insightIds: [...insights] };
}

function okDeduce(resolution: DeduceResolution): Extract<DeduceResolution, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

function okAccuse(resolution: AccuseResolution): Extract<AccuseResolution, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

const link = (...clueIds: string[]) => ({ kind: 'deduce', clueIds });

describe('deduce', () => {
  it('turns a matching link into an insight, whatever the order of the clues', () => {
    const run = newRun();
    const result = okDeduce(deduce(run, link('debt-ledger', 'oven-receipt'), createRng(1)));
    expect(result.outcome).toEqual({
      kind: 'deduce',
      result: 'insight',
      deductionId: 'motive-debt',
      minutes: DEDUCE_MINUTES,
    });
    expect(result.run.insightIds).toEqual(['motive-debt']);
    expect(result.run.turn).toBe(1);
    expect(result.run.clock.minute).toBe(DAY_START_MINUTE + DEDUCE_MINUTES);
    expect(run.insightIds).toEqual([]);
    expect(viewRun(result.run).insights.map(({ id }) => id)).toEqual(['motive-debt']);
  });

  describe('a link with a clue too many', () => {
    it('gives the conclusion all the same, and never says which clue was the extra one', () => {
      const run = newRun();
      const exact = okDeduce(deduce(run, link('oven-receipt', 'debt-ledger'), createRng(1)));

      for (const extra of ['blue-glove', 'cart-tracks', 'cellar-key']) {
        const result = okDeduce(deduce(run, link('oven-receipt', extra, 'debt-ledger'), createRng(1)));

        expect(result.outcome).toEqual(exact.outcome);
        expect(result.run.insightIds).toEqual(['motive-debt']);
      }
    });

    it('is not forgiven in a run of the ruleset before it: the link is exactly the clues of a conclusion', () => {
      const old: DetectiveRunState = { ...newRun(), rulesetVersion: LENIENT_LINKS_RULESET_VERSION - 1 };

      expect(deduce(old, link('oven-receipt', 'debt-ledger', 'blue-glove'), createRng(1))).toMatchObject({
        ok: false,
        refusal: { code: 'wrong-link-size' },
      });
      expect(okDeduce(deduce(old, link('oven-receipt', 'debt-ledger'), createRng(1))).outcome).toMatchObject({
        result: 'insight',
      });
    });

    it('is not forgiven a second clue: a link of two too many is refused or comes to nothing', () => {
      const run = newRun();

      expect(
        deduce(run, link('oven-receipt', 'debt-ledger', 'blue-glove', 'cart-tracks'), createRng(1)),
      ).toMatchObject({
        ok: false,
        refusal: { code: 'wrong-link-size' },
      });
    });

    it('still comes to nothing when the clue it is short of is the one it lacks', () => {
      const run = newRun();
      const result = okDeduce(deduce(run, link('oven-receipt', 'blue-glove', 'cart-tracks'), createRng(1)));

      expect(result.outcome).toMatchObject({ result: 'nothing' });
      expect(result.run.insightIds).toEqual([]);
    });

    it('prefers a conclusion not yet drawn to one that is known, and the one that fits to one that holds more', () => {
      const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
      detectiveCase.deductions.push(
        { id: 'trail', clueIds: ['flour-crumbs', 'cart-tracks', 'oven-receipt'], insight: 'A trail.' },
        { id: 'pair', clueIds: ['flour-crumbs', 'cart-tracks'], insight: 'A pair.' },
      );
      const base = createDetectiveRun({
        hero: buildHero(),
        traits: [],
        case: detectiveCase,
        seed: 'links',
        rngState: 1,
        locale: 'en',
      });
      const run = (insights: string[]): DetectiveRunState => ({
        ...base,
        foundClueIds: [...ALL_CLUES],
        insightIds: insights,
      });
      const three = link('flour-crumbs', 'cart-tracks', 'oven-receipt');

      // The link is the whole of `trail` and `pair` with a clue too many: the exact one first.
      expect(okDeduce(deduce(run([]), three, createRng(1))).outcome).toMatchObject({ deductionId: 'trail' });
      // With `trail` drawn, the same link gives the one not yet drawn.
      expect(okDeduce(deduce(run(['trail']), three, createRng(1))).outcome).toMatchObject({
        result: 'insight',
        deductionId: 'pair',
      });
      // With both drawn, it is known.
      expect(okDeduce(deduce(run(['trail', 'pair']), three, createRng(1))).outcome).toMatchObject({
        result: 'already-known',
        deductionId: 'trail',
      });
    });
  });

  it('does not add an insight twice and costs less than a failure', () => {
    const run = newRun(ALL_CLUES, ['motive-debt']);
    const result = okDeduce(deduce(run, link('oven-receipt', 'debt-ledger'), createRng(1)));
    expect(result.outcome).toMatchObject({ result: 'already-known', deductionId: 'motive-debt' });
    expect(result.run.insightIds).toEqual(['motive-debt']);
  });

  it('a wrong link of a size the case has costs time and reveals nothing, close or not', () => {
    const run = newRun();
    const close = okDeduce(deduce(run, link('oven-receipt', 'blue-glove'), createRng(1)));
    const far = okDeduce(deduce(run, link('blue-glove', 'cart-tracks'), createRng(1)));
    for (const result of [close, far]) {
      expect(result.outcome).toEqual({
        kind: 'deduce',
        result: 'nothing',
        minutes: FAILED_DEDUCTION_MINUTES,
        consequences: ['time-lost', 'nerves-lost'],
      });
      expect(result.run.insightIds).toEqual([]);
      expect(result.run.clock.minute).toBe(DAY_START_MINUTE + FAILED_DEDUCTION_MINUTES);
      expect(result.run.turn).toBe(1);
    }
    expect(close.outcome).toEqual(far.outcome);
  });

  describe('the size of a link is public', () => {
    it('refuses a link no open conclusion can have, before any time is spent, naming the sizes and no clue', () => {
      const run = newRun();
      for (const clues of [
        ['flour-crumbs', 'blue-glove', 'cart-tracks', 'debt-ledger'],
        ['cellar-key', 'flour-crumbs', 'blue-glove', 'cart-tracks', 'debt-ledger'],
      ]) {
        const result = deduce(run, link(...clues), createRng(1));

        expect(result).toEqual({
          ok: false,
          refusal: {
            code: 'wrong-link-size',
            message: 'No conclusion takes a link of that size. The links still to be made take 2 clues.',
          },
        });
        expect(JSON.stringify(result)).not.toMatch(/ledger|receipt|glove|tracks|crumbs/);
      }
      expect(run.clock.minute).toBe(DAY_START_MINUTE);
    });

    it('says there is nothing left to link once every conclusion is drawn, and still knows a made one', () => {
      const run = newRun(ALL_CLUES, ['motive-debt']);

      const other = deduce(run, link('flour-crumbs', 'blue-glove'), createRng(1));
      const again = okDeduce(deduce(run, link('oven-receipt', 'debt-ledger'), createRng(1)));

      expect(other).toMatchObject({
        ok: false,
        refusal: {
          code: 'wrong-link-size',
          message: 'Every conclusion of this case has been drawn; there is nothing left to link.',
        },
      });
      expect(again.outcome).toMatchObject({ result: 'already-known' });
    });

    it('lists the open sizes smallest first, drops a conclusion once it is drawn, and holds no clue', () => {
      const open = viewRun(newRun()).openLinks;
      const drawn = viewRun(newRun(ALL_CLUES, ['motive-debt'])).openLinks;

      expect(open).toEqual([2]);
      expect(drawn).toEqual([]);
    });
  });

  it('gives the same answer for every wrong link, whatever the dice (property)', () => {
    const run = newRun();
    for (let seed = 0; seed < 200; seed += 1) {
      const a = okDeduce(deduce(run, link('flour-crumbs', 'blue-glove'), createRng(seed)));
      const b = okDeduce(deduce(run, link('oven-receipt', 'cart-tracks'), createRng(seed + 1000)));
      expect(a.outcome).toEqual(b.outcome);
      expect(JSON.stringify(a.outcome)).not.toContain('baker');
    }
  });

  it('refuses clues that were not found, or that do not exist, with the same answer', () => {
    const run = newRun(['oven-receipt']);
    const unfound = deduce(run, link('oven-receipt', 'debt-ledger'), createRng(1));
    const missing = deduce(run, link('oven-receipt', 'no-such-clue'), createRng(1));
    expect(unfound).toEqual(missing);
    expect(unfound).toMatchObject({ ok: false, refusal: { code: 'not-found' } });
  });

  it('refuses a link of one clue named twice, and malformed input', () => {
    const run = newRun();
    expect(deduce(run, link('oven-receipt', 'oven-receipt'), createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'not-found' },
    });
    expect(deduce(run, { kind: 'deduce', clueIds: ['oven-receipt'] }, createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'invalid-intent' },
    });
  });

  it('is refused once the run is over', () => {
    const over = endRun(newRun(), 'gave-up');
    expect(deduce(over, link('oven-receipt', 'debt-ledger'), createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'run-over' },
    });
  });
});

const accusation = (culpritId: string, motiveInsightId: string | null, evidenceClueIds: string[]) => ({
  kind: 'accuse',
  culpritId,
  motiveInsightId,
  evidenceClueIds,
});

describe('accuse', () => {
  it('proves the case with the right culprit, the motive and a whole evidence chain', () => {
    const run = newRun(ALL_CLUES, ['motive-debt']);
    const result = okAccuse(
      accuse(run, accusation('baker', 'motive-debt', ['flour-crumbs', 'cart-tracks']), createRng(1)),
    );
    expect(result.outcome).toMatchObject({
      verdict: 'proven',
      culpritRight: true,
      motiveRight: true,
      evidenceComplete: true,
      truth: { culpritId: 'baker' },
    });
    expect(result.run.status).toBe('won');
    expect(result.run.turn).toBe(1);
    expect(run.status).toBe('active');
  });

  it('accepts the second evidence chain and extra clues', () => {
    const run = newRun(ALL_CLUES, ['motive-debt']);
    const result = okAccuse(
      accuse(
        run,
        accusation('baker', 'motive-debt', ['oven-receipt', 'debt-ledger', 'blue-glove']),
        createRng(1),
      ),
    );
    expect(result.outcome.verdict).toBe('proven');
  });

  it('calls a right culprit without a motive unproven', () => {
    const run = newRun(ALL_CLUES, ['motive-debt']);
    const result = okAccuse(
      accuse(run, accusation('baker', null, ['flour-crumbs', 'cart-tracks']), createRng(1)),
    );
    expect(result.outcome).toMatchObject({ verdict: 'unproven', motiveRight: false, evidenceComplete: true });
    expect(result.run.status).toBe('lost');
  });

  it('calls a right culprit with a partial chain unproven', () => {
    const run = newRun(ALL_CLUES, ['motive-debt']);
    const result = okAccuse(
      accuse(run, accusation('baker', 'motive-debt', ['flour-crumbs', 'oven-receipt']), createRng(1)),
    );
    expect(result.outcome).toMatchObject({ verdict: 'unproven', motiveRight: true, evidenceComplete: false });
    expect(result.run.status).toBe('lost');
  });

  it('calls a right culprit with no evidence unproven', () => {
    const result = okAccuse(accuse(newRun(), accusation('baker', null, []), createRng(1)));
    expect(result.outcome.verdict).toBe('unproven');
  });

  it('calls someone else wrong, even with a full set of clues', () => {
    const run = newRun(ALL_CLUES, ['motive-debt']);
    const result = okAccuse(
      accuse(run, accusation('rival', 'motive-debt', ['flour-crumbs', 'cart-tracks']), createRng(1)),
    );
    expect(result.outcome).toMatchObject({ verdict: 'wrong', culpritRight: false });
    expect(result.run.status).toBe('lost');
  });

  it('only ever gives one of the three verdicts (property)', () => {
    const suspects = ['baker', 'rival', 'mayor'];
    const motives = [null, 'motive-debt'];
    const proofs = [[], ['flour-crumbs', 'cart-tracks'], ['oven-receipt', 'debt-ledger'], ['blue-glove']];
    for (const culprit of suspects) {
      for (const motive of motives) {
        for (const proof of proofs) {
          const run = newRun(ALL_CLUES, ['motive-debt']);
          const { outcome } = okAccuse(accuse(run, accusation(culprit, motive, proof), createRng(7)));
          expect(VERDICTS).toContain(outcome.verdict);
          expect(outcome.verdict === 'proven').toBe(
            culprit === 'baker' &&
              motive === 'motive-debt' &&
              proof.length === 2 &&
              proof[0] !== 'blue-glove',
          );
        }
      }
    }
  });

  it('refuses what is not a suspect, a clue not found, or an insight not made, changing nothing', () => {
    const run = newRun(['flour-crumbs']);
    expect(accuse(run, accusation('ghost', null, []), createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'unknown-suspect' },
    });
    expect(accuse(run, accusation('baker', null, ['cart-tracks']), createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'not-found' },
    });
    expect(accuse(run, accusation('baker', 'motive-debt', []), createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'no-insight' },
    });
    expect(run.status).toBe('active');
  });

  it('refuses malformed input and a finished run', () => {
    expect(accuse(newRun(), { kind: 'accuse' }, createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'invalid-intent' },
    });
    expect(accuse(endRun(newRun(), 'lost'), accusation('baker', null, []), createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'run-over' },
    });
  });

  it('refuses to judge a case that no longer matches its seal', () => {
    const run = newRun();
    const tampered = { ...run, case: { ...run.case, truth: { ...run.case.truth, culpritId: 'rival' } } };
    expect(() => accuse(tampered, accusation('rival', null, []), createRng(1))).toThrow(/seal/);
  });
});

describe('what an unproven accusation lacked', () => {
  const unproven = (run: DetectiveRunState, motive: string | null, evidence: string[]) => {
    const { outcome } = okAccuse(
      accuse(
        run,
        { kind: 'accuse', culpritId: 'baker', motiveInsightId: motive, evidenceClueIds: evidence },
        createRng(1),
      ),
    );
    return outcome;
  };

  it('names the chain nearest to whole and where each clue of it stood', () => {
    // The first chain is flour-crumbs and cart-tracks; only the second is half laid out, with a clue never found.
    const outcome = unproven(newRun(['flour-crumbs', 'oven-receipt']), null, ['oven-receipt']);

    expect(outcome.verdict).toBe('unproven');
    expect(outcome.shortfall?.evidence).toMatchObject({
      held: false,
      clues: [
        { clueId: 'oven-receipt', state: 'laid-out' },
        { clueId: 'debt-ledger', state: 'never-found', number: null },
      ],
    });
    expect(outcome.shortfall?.evidence.clues[0]?.number).toMatch(/-\d\d$/);
    expect(outcome.shortfall?.evidence.clues[1]?.description).toContain('ledger');
  });

  it('tells a clue found and left out from one laid out', () => {
    const outcome = unproven(newRun(['flour-crumbs', 'cart-tracks']), null, ['cart-tracks']);

    expect(outcome.shortfall?.evidence.clues.map(({ clueId, state }) => [clueId, state])).toEqual([
      ['flour-crumbs', 'found'],
      ['cart-tracks', 'laid-out'],
    ]);
  });

  it('says whether a motive was put forward, and whether the right conclusion was ever drawn', () => {
    const chain = ['oven-receipt', 'debt-ledger'];

    expect(unproven(newRun(ALL_CLUES, ['motive-debt']), null, chain).shortfall?.motive).toEqual({
      held: false,
      offered: false,
      drawn: true,
    });
    expect(unproven(newRun(ALL_CLUES), null, chain).shortfall?.motive).toEqual({
      held: false,
      offered: false,
      drawn: false,
    });
  });

  it('says the motive held when it did and the evidence fell short', () => {
    const outcome = unproven(newRun(ALL_CLUES, ['motive-debt']), 'motive-debt', ['oven-receipt']);

    expect(outcome.shortfall).toMatchObject({ motive: { held: true, offered: true, drawn: true } });
    expect(outcome.shortfall?.evidence.held).toBe(false);
  });

  it('says the evidence held when only the motive was missing', () => {
    const outcome = unproven(newRun(ALL_CLUES), null, ['oven-receipt', 'debt-ledger']);

    expect(outcome.shortfall).toMatchObject({ evidence: { held: true }, motive: { held: false } });
  });

  it('says another conclusion was put as the motive', () => {
    const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
    detectiveCase.deductions.push({
      id: 'other',
      clueIds: ['flour-crumbs', 'cart-tracks'],
      insight: 'Flour.',
    });
    const withOther = newRun(ALL_CLUES, ['other'], detectiveCase);

    expect(unproven(withOther, 'other', ['oven-receipt']).shortfall?.motive).toEqual({
      held: false,
      offered: true,
      drawn: false,
    });
  });

  it('comes near no chain in a case that has none, and names no clue', () => {
    const bare = DetectiveCaseSchema.parse(buildCheeseCase());
    bare.solution.evidenceChains = [];

    const outcome = unproven(newRun(ALL_CLUES, [], bare), null, []);

    expect(outcome.shortfall?.evidence).toEqual({ held: false, clues: [] });
  });

  it('says nothing of what was lacking when the case was proven or the person was wrong', () => {
    const proven = okAccuse(
      accuse(
        newRun(ALL_CLUES, ['motive-debt']),
        {
          kind: 'accuse',
          culpritId: 'baker',
          motiveInsightId: 'motive-debt',
          evidenceClueIds: ['oven-receipt', 'debt-ledger'],
        },
        createRng(1),
      ),
    );
    const wrong = okAccuse(
      accuse(
        newRun(),
        { kind: 'accuse', culpritId: 'rival', motiveInsightId: null, evidenceClueIds: [] },
        createRng(1),
      ),
    );

    expect(proven.outcome.shortfall).toBeUndefined();
    expect(wrong.outcome.shortfall).toBeUndefined();
  });
});

describe('what leaks before the verdict', () => {
  it('shows nothing of the truth in deduction outcomes or in the view', () => {
    const run = newRun();
    const result = okDeduce(deduce(run, link('flour-crumbs', 'blue-glove'), createRng(1)));
    const shown = JSON.stringify([result.outcome, viewRun(result.run)]);
    expect(shown).not.toContain(run.case.truth.motive);
    expect(shown).not.toContain(run.case.truth.method);
    expect(shown).not.toContain('evidenceChains');
  });
});
