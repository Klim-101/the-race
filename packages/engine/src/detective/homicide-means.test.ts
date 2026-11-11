// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { resolveIntent, type Resolved } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { validateCase } from './case-validator.js';
import { EMPTY_RUN_LOG, RunLogSchema, recordResolution, replay } from './event-log.js';
import { createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';
import { viewTurns } from './turn-view.js';

type Raw = ReturnType<typeof buildCheeseCase>;

const HOMICIDE = { victim: { name: 'Pieter Vane, the stallholder' }, fate: 'attempt' } as const;

/** The cheese case as a homicide whose means is the conclusion `means-rolled`, drawn from two clues of its first chain. */
function homicideRaw(options: { means?: boolean; form?: string } = {}): Raw {
  const raw = buildCheeseCase();
  raw.deductions.push({
    id: 'means-rolled',
    clueIds: ['flour-crumbs', 'cart-tracks'],
    insight: 'The wheel was rolled to the cellar on the baker’s cart.',
  });
  raw.deductions.push({
    id: 'means-other',
    clueIds: ['cart-tracks', 'blue-glove'],
    insight: 'Somebody wearing blue gloves pushed it.',
  });
  Object.assign(raw, { form: options.form ?? 'homicide' });
  Object.assign(raw.truth, { homicide: HOMICIDE });
  if (options.means !== false) Object.assign(raw.solution, { meansDeductionId: 'means-rolled' });
  return raw;
}

/** A run of that case in which the hero has found the clues of the first chain and drawn the conclusions named. */
function runWith(raw: Raw, insights: string[]): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(raw),
    seed: 'means',
    rngState: createRng('means').state(),
    locale: 'en',
  });
  return {
    ...run,
    foundClueIds: ['flour-crumbs', 'cart-tracks', 'oven-receipt', 'debt-ledger'],
    insightIds: insights,
  };
}

const CHAIN = ['flour-crumbs', 'cart-tracks'];

function accuse(run: DetectiveRunState, fields: Record<string, unknown>): Resolved {
  return resolveIntent(
    run,
    { kind: 'accuse', culpritId: 'baker', motiveInsightId: 'motive-debt', evidenceClueIds: CHAIN, ...fields },
    restoreRng(run.rngState),
  );
}

function outcomeOf(resolution: Resolved) {
  if (!resolution.ok || resolution.outcome.kind !== 'accuse') throw new Error('Not an accusation.');
  return resolution.outcome;
}

describe('the means of a homicide, in the case', () => {
  it('is a conclusion of the solution that only a homicide has, and a case before it is as it was', () => {
    expect(DetectiveCaseSchema.safeParse(homicideRaw()).success).toBe(true);
    const whodunit = buildCheeseCase();
    Object.assign(whodunit.solution, { meansDeductionId: 'motive-debt' });

    expect(DetectiveCaseSchema.safeParse(whodunit).success).toBe(false);
    expect(JSON.stringify(DetectiveCaseSchema.parse(buildCheeseCase()))).not.toContain('meansDeductionId');
  });

  it('must name a conclusion of the case, or the validator says the reference is unknown', () => {
    const raw = homicideRaw();
    Object.assign(raw.solution, { meansDeductionId: 'no-such-deduction' });

    const result = validateCase(raw, { hero: buildHero(), traits: [], locale: 'en', realNames: [] });

    expect(!result.isValid && result.issues.map(({ code, path }) => `${code}@${path}`)).toContain(
      'unknown-reference@solution.meansDeductionId',
    );
  });
});

describe('accusing in a homicide', () => {
  it('asks for the means, or null for none, and refuses an accusation that leaves it out', () => {
    const run = runWith(homicideRaw(), ['motive-debt', 'means-rolled']);

    expect(accuse(run, {})).toMatchObject({ ok: false, refusal: { code: 'means-needed' } });
    expect(accuse(run, { meansInsightId: null }).ok).toBe(true);
  });

  it('is proven with the right culprit, motive, means and proof, and tells the truth of the victim only then', () => {
    const run = runWith(homicideRaw(), ['motive-debt', 'means-rolled']);

    const outcome = outcomeOf(accuse(run, { meansInsightId: 'means-rolled' }));

    expect(outcome).toMatchObject({
      verdict: 'proven',
      culpritRight: true,
      motiveRight: true,
      meansRight: true,
    });
    expect(outcome.truth.homicide).toEqual(HOMICIDE);
    expect(outcome.shortfall).toBeUndefined();
  });

  it('falls short with the wrong means, with none named, or with the right one that was never drawn', () => {
    const wrong = outcomeOf(
      accuse(runWith(homicideRaw(), ['motive-debt', 'means-rolled', 'means-other']), {
        meansInsightId: 'means-other',
      }),
    );
    const none = outcomeOf(
      accuse(runWith(homicideRaw(), ['motive-debt', 'means-rolled']), { meansInsightId: null }),
    );
    const undrawn = outcomeOf(accuse(runWith(homicideRaw(), ['motive-debt']), { meansInsightId: null }));

    expect(wrong).toMatchObject({ verdict: 'unproven', meansRight: false });
    expect(wrong.shortfall?.means).toEqual({ held: false, offered: true, drawn: true });
    expect(none.shortfall?.means).toEqual({ held: false, offered: false, drawn: true });
    expect(undrawn.shortfall?.means).toEqual({ held: false, offered: false, drawn: false });
    expect(undrawn.shortfall?.motive.held).toBe(true);
  });

  it('is wrong for another culprit, whatever the means, and refuses a means the hero has not drawn', () => {
    const run = runWith(homicideRaw(), ['motive-debt', 'means-rolled']);

    expect(outcomeOf(accuse(run, { culpritId: 'rival', meansInsightId: 'means-rolled' })).verdict).toBe(
      'wrong',
    );
    expect(accuse(run, { meansInsightId: 'means-other' })).toMatchObject({
      ok: false,
      refusal: { code: 'no-insight' },
    });
  });

  it('is judged without the means when its case asks for none, as a case from before it', () => {
    const outcome = outcomeOf(
      accuse(runWith(homicideRaw({ means: false }), ['motive-debt']), { meansInsightId: null }),
    );

    expect(outcome.verdict).toBe('proven');
    expect(outcome.meansRight).toBeUndefined();
  });
});

describe('accusing in a case with no means', () => {
  const whodunit = () => runWith(buildCheeseCase(), ['motive-debt']);

  it('refuses a means that is named, and takes the null a host may send, with no means in the outcome', () => {
    expect(accuse(whodunit(), { meansInsightId: 'motive-debt' })).toMatchObject({
      ok: false,
      refusal: { code: 'means-unwanted' },
    });
    const outcome = outcomeOf(accuse(whodunit(), { meansInsightId: null }));

    expect(outcome.verdict).toBe('proven');
    expect(outcome).not.toHaveProperty('meansRight');
    expect(outcome.truth).not.toHaveProperty('homicide');
    expect(outcomeOf(accuse(whodunit(), {})).verdict).toBe('proven');
  });
});

describe('the means in the log and the closed file', () => {
  it('is kept in the log, replays, and is told in the closed file once the run is over', () => {
    const run = runWith(homicideRaw(), ['motive-debt', 'means-rolled']);
    const intent = {
      kind: 'accuse',
      culpritId: 'baker',
      motiveInsightId: 'motive-debt',
      meansInsightId: 'means-wrong-for-now',
      evidenceClueIds: CHAIN,
    };
    const refused = resolveIntent(run, intent, restoreRng(run.rngState));
    expect(refused.ok).toBe(false);

    const good = { ...intent, meansInsightId: 'means-rolled' };
    const resolution = resolveIntent(run, good, restoreRng(run.rngState));
    if (!resolution.ok) throw new Error('Refused.');
    const log = recordResolution(EMPTY_RUN_LOG, run, good, resolution);

    expect(RunLogSchema.parse(log)).toEqual(log);
    expect(replay(run, log)).toEqual({ ok: true, run: resolution.run });
    expect(viewTurns(resolution.run, log)[0]).toMatchObject({ kind: 'accuse', file: { meansRight: true } });
  });

  it('tells in the log what a wrong means lacked, so a replay keeps the shortfall', () => {
    const run = runWith(homicideRaw(), ['motive-debt', 'means-rolled']);
    const intent = {
      kind: 'accuse',
      culpritId: 'baker',
      motiveInsightId: 'motive-debt',
      meansInsightId: null,
      evidenceClueIds: CHAIN,
    };
    const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
    if (!resolution.ok) throw new Error('Refused.');
    const log = recordResolution(EMPTY_RUN_LOG, run, intent, resolution);

    expect(RunLogSchema.parse(log)).toEqual(log);
    expect(replay(run, log)).toEqual({ ok: true, run: resolution.run });
    expect(viewTurns(resolution.run, log)[0]).toMatchObject({
      shortfall: { means: { held: false, offered: false, drawn: true } },
      file: { meansRight: false },
    });
  });
});

describe('the victim, in the view and the closed file', () => {
  it('is public: the name and whether they live, and nothing for a case of another form', () => {
    expect(viewRun(runWith(homicideRaw(), [])).victim).toEqual({ name: HOMICIDE.victim.name, alive: true });
    const killed = homicideRaw();
    Object.assign(killed.truth, { homicide: { ...HOMICIDE, fate: 'death' } });
    expect(viewRun(runWith(killed, [])).victim?.alive).toBe(false);
    expect(viewRun(runWith(buildCheeseCase(), [])).victim).toBeNull();
  });

  it('is told in the closed file once the run is over, with the log that keeps it', () => {
    const run = runWith(homicideRaw(), ['motive-debt', 'means-rolled']);
    const intent = {
      kind: 'accuse',
      culpritId: 'baker',
      motiveInsightId: 'motive-debt',
      meansInsightId: 'means-rolled',
      evidenceClueIds: CHAIN,
    };
    const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
    if (!resolution.ok) throw new Error('Refused.');
    const log = recordResolution(EMPTY_RUN_LOG, run, intent, resolution);

    expect(RunLogSchema.parse(log)).toEqual(log);
    expect(viewTurns(resolution.run, log)[0]).toMatchObject({
      file: { victim: { name: HOMICIDE.victim.name, alive: true } },
    });
  });
});
