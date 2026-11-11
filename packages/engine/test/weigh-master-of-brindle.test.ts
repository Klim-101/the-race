// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRng, restoreRng } from '../src/dice.js';
import { resolveIntent, type Resolved } from '../src/detective/actions.js';
import { GENERATED_RULES } from '../src/detective/case-rules.js';
import { DetectiveCaseSchema, formOf, type DetectiveCase } from '../src/detective/case-schema.js';
import { validateCase } from '../src/detective/case-validator.js';
import { createDetectiveRun, findClue, viewRun, type DetectiveRunState } from '../src/detective/run-state.js';
import { sightingsOf } from '../src/detective/witnesses.js';
import type { Locale } from '../src/locale.js';
import { buildHero } from './fixtures/cheese-case.js';

const LOCALES: readonly Locale[] = ['en', 'ru'];
const jsonOf = (locale: Locale): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      new URL(`../../../content/cases/weigh-master-of-brindle.${locale}.json`, import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>;
const caseOf = (locale: Locale): DetectiveCase => DetectiveCaseSchema.parse(jsonOf(locale));

/** The chain of the big scale: the clues a hero lays out as proof. */
const CHAIN = ['empty-pan', 'green-ink', 'scale-hatch'];
const FOUND = [...CHAIN, 'surgeon-report'];

function runOf(locale: Locale, seed = 'brindle'): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: caseOf(locale),
    seed,
    rngState: createRng(seed).state(),
    locale,
  });
}

/** A run in which the hero holds the clues of the chain and the report, and draws the conclusions named, link by link. */
function drawn(locale: Locale, conclusions: readonly string[]): DetectiveRunState {
  let run = FOUND.reduce((state, id) => findClue(state, id), runOf(locale));
  for (const id of conclusions) {
    const deduction = run.case.deductions.find((candidate) => candidate.id === id);
    if (deduction === undefined) throw new Error(`No conclusion ${id}.`);
    // The hero holds the clues of the conclusion before linking them.
    run = deduction.clueIds.reduce((state, clueId) => findClue(state, clueId), run);
    const resolution = resolveIntent(
      run,
      { kind: 'deduce', clueIds: deduction.clueIds },
      restoreRng(run.rngState),
    );
    if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
    run = resolution.run;
    if (!run.insightIds.includes(id)) throw new Error(`${id} was not drawn.`);
  }
  return run;
}

function accuse(run: DetectiveRunState, fields: Record<string, unknown>): Resolved {
  return resolveIntent(
    run,
    {
      kind: 'accuse',
      culpritId: 'factor',
      motiveInsightId: 'motive-false-weights',
      evidenceClueIds: CHAIN,
      ...fields,
    },
    restoreRng(run.rngState),
  );
}

function outcomeOf(resolution: Resolved) {
  if (!resolution.ok || resolution.outcome.kind !== 'accuse') throw new Error('Not an accusation.');
  return resolution.outcome;
}

describe.each(LOCALES)('the weigh-master of Brindle, in %s', (locale) => {
  const MOTIVE_AND_MEANS = ['motive-false-weights', 'means-counterweight'] as const;

  it('is an attempt on someone that the generator could have written: it passes every rule of a generated case', () => {
    const result = validateCase(jsonOf(locale), {
      hero: buildHero(),
      traits: [],
      locale,
      realNames: [],
      rules: GENERATED_RULES,
      form: 'homicide',
    });

    expect(result).toMatchObject({ isValid: true });
    expect(formOf(caseOf(locale))).toBe('homicide');
  });

  it('is proven by the right culprit, the motive, the means and a whole chain', () => {
    const run = drawn(locale, MOTIVE_AND_MEANS);

    const outcome = outcomeOf(accuse(run, { meansInsightId: 'means-counterweight' }));

    expect(outcome).toMatchObject({
      verdict: 'proven',
      culpritRight: true,
      motiveRight: true,
      meansRight: true,
    });
    expect(outcome.truth.homicide).toMatchObject({ fate: 'attempt' });
    expect(outcome.truth.culpritId).toBe('factor');
  });

  it('falls short when the means named is another conclusion, and tells that it was offered and drawn', () => {
    const run = drawn(locale, [...MOTIVE_AND_MEANS, 'night-visit']);

    const outcome = outcomeOf(accuse(run, { meansInsightId: 'night-visit' }));

    expect(outcome).toMatchObject({ verdict: 'unproven', meansRight: false });
    expect(outcome.shortfall?.means).toEqual({ held: false, offered: true, drawn: true });
    expect(outcome.shortfall?.motive.held).toBe(true);
  });

  it('falls short when the means was never drawn, and the hero names none', () => {
    const run = drawn(locale, ['motive-false-weights']);

    const outcome = outcomeOf(accuse(run, { meansInsightId: null }));

    expect(outcome).toMatchObject({ verdict: 'unproven', meansRight: false, motiveRight: true });
    expect(outcome.shortfall?.means).toEqual({ held: false, offered: false, drawn: false });
  });

  it('is wrong for the miller, who is cleared by his own glove, whatever means is named', () => {
    const run = drawn(locale, MOTIVE_AND_MEANS);

    const outcome = outcomeOf(accuse(run, { culpritId: 'miller', meansInsightId: 'means-counterweight' }));

    expect(outcome).toMatchObject({ verdict: 'wrong', culpritRight: false });
  });

  it('asks for the means, and leaves it for none to be wrong about when none is named', () => {
    const run = drawn(locale, MOTIVE_AND_MEANS);

    expect(accuse(run, {})).toMatchObject({ ok: false, refusal: { code: 'means-needed' } });
  });
});

describe('the victim in the ward', () => {
  it('names them in the view from the first scene, and is no suspect', () => {
    for (const locale of LOCALES) {
      const view = viewRun(runOf(locale));

      expect(view.victim).toEqual({ name: caseOf(locale).truth.homicide?.victim.name, alive: true });
      expect(view.suspects.map(({ id }) => id).toSorted()).toEqual(['carter', 'clerk', 'factor', 'miller']);
    }
  });

  it('is visited in the afternoon only: the ward is shut by morning, and the hero is let in at three', () => {
    const start = runOf('en');
    const atSquare = { ...start, locationId: 'chapel-square' };
    const go = (minute: number) =>
      resolveIntent(
        { ...atSquare, clock: { day: 1, minute } },
        { kind: 'move', locationId: 'ward' },
        restoreRng(start.rngState),
      );

    expect(go(10 * 60)).toMatchObject({ ok: false, refusal: { code: 'closed-hours' } });
    expect(go(15 * 60).ok).toBe(true);
  });

  it('did not see who did it: nothing they tell reaches the factor, though the factor passed the square', () => {
    const detectiveCase = caseOf('en');
    const victim = (detectiveCase.witnesses ?? []).find((witness) => witness.victim === true);
    if (victim === undefined) throw new Error('No victim witness.');

    expect(sightingsOf(detectiveCase, victim)).toEqual([]);
    expect(sightingsOf(detectiveCase, victim, 'factor')).toEqual([]);
  });
});

describe('the report', () => {
  it('reaches the hero by itself on the second morning, in the turn after its time, and names no one', () => {
    const run = runOf('en');
    const late = { ...run, clock: { day: 2, minute: 6 * 60 }, locationId: 'market-yard' };

    const turn = resolveIntent(late, { kind: 'look' }, restoreRng(late.rngState));

    if (!turn.ok) throw new Error('Refused.');
    expect(turn.newMessages).toEqual([{ clueId: 'surgeon-report', channel: 'report' }]);
    const text = turn.run.case.clues.find(({ id }) => id === 'surgeon-report')?.description ?? '';
    for (const word of ['factor', 'harl', 'edmund']) expect(text.toLowerCase()).not.toContain(word);
  });
});
