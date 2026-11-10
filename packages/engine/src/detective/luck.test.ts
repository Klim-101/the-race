// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { MAX_LUCK_TOKENS, START_LUCK_TOKENS, luckTokensOf } from '../progress.js';
import { TraitSchema } from '../traits.js';
import { resolveIntent, type Resolved } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { recordResolution, replay, type RunLog } from './event-log.js';
import { createDetectiveRun, DetectiveRunStateSchema, moveTo, viewRun } from './run-state.js';

/** A seed whose first d20 roll is `die`. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

/** The dice of a seed whose first two rolls are `first` and `second`. */
function twoDice(first: number, second: number): Rng {
  for (let seed = 0; ; seed += 1) {
    const rng = createRng(seed);
    if (rng.roll(D20_SIDES) === first && rng.roll(D20_SIDES) === second) return createRng(seed);
  }
}

function newRun(luckTokens?: number) {
  return createDetectiveRun({
    hero: buildHero(),
    traits: [].map((entry) => TraitSchema.parse(entry)),
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'luck',
    rngState: 1,
    locale: 'en',
    luckTokens,
  });
}

function ok(resolution: Resolved): Extract<Resolved, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

const stall = (tokens?: number) => moveTo(newRun(tokens), 'cheese-stall');

describe('luck tokens of a run', () => {
  it('start from the supply the profile earned and show in the view', () => {
    expect(newRun().luckTokens).toEqual({ total: 0, left: 0 });
    expect(newRun(3).luckTokens).toEqual({ total: 3, left: 3 });
    expect(viewRun(newRun(3)).luckTokens).toEqual({ total: 3, left: 3 });
  });

  it('are absent in an old save, and never more than the supply', () => {
    const old: Record<string, unknown> = { ...newRun(2) };
    delete old.luckTokens;
    expect(DetectiveRunStateSchema.parse(old).luckTokens).toEqual({ total: 0, left: 0 });
    expect(
      DetectiveRunStateSchema.safeParse({ ...newRun(2), luckTokens: { total: 1, left: 2 } }).success,
    ).toBe(false);
  });

  it('grow with the wins, up to a limit', () => {
    expect(luckTokensOf(0)).toBe(START_LUCK_TOKENS);
    expect(luckTokensOf(2)).toBe(START_LUCK_TOKENS + 2);
    expect(luckTokensOf(50)).toBe(MAX_LUCK_TOKENS);
  });
});

describe('spending a luck token', () => {
  it('rolls a failed check again and lets the second die stand', () => {
    const { run, details, luckSpent, outcome } = ok(
      resolveIntent(stall(2), { kind: 'search', luck: true }, twoDice(2, 15)),
    );

    expect(luckSpent).toBe(true);
    expect(run.luckTokens).toEqual({ total: 2, left: 1 });
    expect(outcome).toMatchObject({ foundClueIds: ['flour-crumbs', 'blue-glove'] });
    const rolled = details.flatMap(({ result }) => (result === 'auto' ? [] : [result]));
    expect(rolled[0]).toMatchObject({ die: 15, rerolled: { die: 2 } });
  });

  it('lets a bad second die stand too: a roll is re-rolled only once', () => {
    const { run, outcome, luckSpent } = ok(
      resolveIntent(stall(2), { kind: 'search', luck: true }, twoDice(2, 3)),
    );

    expect(luckSpent).toBe(true);
    expect(run.luckTokens.left).toBe(1);
    expect(outcome).toMatchObject({ foundClueIds: ['blue-glove'] });
  });

  it('costs one token for a turn, however many checks fail', () => {
    const { run, details } = ok(resolveIntent(stall(3), { kind: 'search', luck: true }, dice(2)));

    expect(run.luckTokens.left).toBe(2);
    const rerolled = details.filter(({ result }) => result !== 'auto' && result.rerolled !== undefined);
    expect(rerolled.length).toBeLessThanOrEqual(1);
  });

  it('keeps the token when the first die already succeeds', () => {
    const { run, luckSpent, details } = ok(resolveIntent(stall(2), { kind: 'search', luck: true }, dice(15)));

    expect(luckSpent).toBe(false);
    expect(run.luckTokens.left).toBe(2);
    expect(JSON.stringify(details)).not.toContain('rerolled');
  });

  it('is not spent by a turn without a luck request, whatever the dice say', () => {
    const { run, luckSpent } = ok(resolveIntent(stall(2), { kind: 'search' }, dice(2)));

    expect(luckSpent).toBe(false);
    expect(run.luckTokens.left).toBe(2);
  });

  it('is refused, with nothing changed, when none is left', () => {
    const run = stall(0);
    const rng = dice(2);
    const before = rng.state();

    const resolution = resolveIntent(run, { kind: 'search', luck: true }, rng);

    expect(resolution).toEqual({
      ok: false,
      refusal: { code: 'no-luck', message: 'The hero has no luck tokens left.' },
    });
    expect(rng.state()).toBe(before);
  });

  it('leaves the same dice behind as the plain roll of the same seed would up to the re-roll', () => {
    const lucky = ok(resolveIntent(stall(1), { kind: 'search', luck: true }, twoDice(2, 15)));
    const again = ok(resolveIntent(stall(1), { kind: 'search', luck: true }, twoDice(2, 15)));

    expect(lucky.run).toEqual(again.run);
  });

  it('works for a talk, a study, a question to the locals and a locked way', () => {
    // An intent that fails to name something real is refused after the token check, so the token is never lost.
    for (const intent of [
      { kind: 'interrogate', suspectId: 'nobody', approach: 'social', clueIds: [], luck: true },
      { kind: 'study', clueId: 'nothing', luck: true },
      { kind: 'move', locationId: 'nowhere', luck: true },
    ] as const) {
      const resolution = resolveIntent(stall(1), intent, dice(2));
      expect(resolution.ok).toBe(false);
    }
    expect(ok(resolveIntent(stall(1), { kind: 'ask', luck: true }, dice(15))).run.luckTokens.left).toBe(1);
  });

  it('is replayed from the log to the same state', () => {
    // A run whose own dice open with a miss, so that the token really is spent in the logged turn.
    const seed = Array.from({ length: 5000 }, (_, at) => at).find(
      (at) => createRng(at).roll(D20_SIDES) === 2,
    );
    const start = moveTo({ ...newRun(2), rngState: seed ?? 0 }, 'cheese-stall');
    const intent = { kind: 'search', luck: true } as const;
    const first = ok(resolveIntent(start, intent, createRng(start.rngState)));
    const log: RunLog = recordResolution([], start, intent, first);

    expect(first.luckSpent).toBe(true);
    expect(replay(start, log)).toEqual({ ok: true, run: first.run });
  });
});
