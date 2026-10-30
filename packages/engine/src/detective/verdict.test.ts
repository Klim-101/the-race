// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng } from '../dice.js';
import { DAY_START_MINUTE } from '../run.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { createDetectiveRun, endRun, viewRun, type DetectiveRunState } from './run-state.js';
import {
  DEDUCE_MINUTES,
  FAILED_DEDUCTION_MINUTES,
  VERDICTS,
  accuse,
  deduce,
  type AccuseResolution,
  type DeduceResolution,
} from './verdict.js';

const ALL_CLUES = ['cellar-key', 'flour-crumbs', 'cart-tracks', 'oven-receipt', 'debt-ledger', 'blue-glove'];

function newRun(found: readonly string[] = ALL_CLUES, insights: readonly string[] = []): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
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

  it('does not add an insight twice and costs less than a failure', () => {
    const run = newRun(ALL_CLUES, ['motive-debt']);
    const result = okDeduce(deduce(run, link('oven-receipt', 'debt-ledger'), createRng(1)));
    expect(result.outcome).toMatchObject({ result: 'already-known', deductionId: 'motive-debt' });
    expect(result.run.insightIds).toEqual(['motive-debt']);
  });

  it('a wrong link costs time and reveals nothing, close or not', () => {
    const run = newRun();
    const close = okDeduce(deduce(run, link('oven-receipt', 'debt-ledger', 'blue-glove'), createRng(1)));
    const far = okDeduce(deduce(run, link('blue-glove', 'cart-tracks'), createRng(1)));
    for (const result of [close, far]) {
      expect(result.outcome).toEqual({
        kind: 'deduce',
        result: 'nothing',
        minutes: FAILED_DEDUCTION_MINUTES,
        consequences: ['time-lost'],
      });
      expect(result.run.insightIds).toEqual([]);
      expect(result.run.clock.minute).toBe(DAY_START_MINUTE + FAILED_DEDUCTION_MINUTES);
      expect(result.run.turn).toBe(1);
    }
    expect(close.outcome).toEqual(far.outcome);
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
