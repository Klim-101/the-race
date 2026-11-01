// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { intentOf } from '../../test/fixtures/ordinary-play.js';
import { createRng } from '../dice.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { ACTION_STRAIN_RULESET_VERSION } from './condition.js';
import { createDetectiveRun, type DetectiveRunState } from './run-state.js';

// A balance run: ordinary play of the sample case for two days, over many seeds. "Ordinary" is a player who looks,
// searches, moves, talks to people (pressing as often as charming) and tries links, in no clever order, and never
// uses a sedative or sleeps on purpose, so what is measured is what the rules do to a hero left alone.

const DAYS = 2;
const SEEDS = 200;
const MAX_TURNS = 600;

interface Play {
  readonly reachedFrayed: boolean;
  readonly reachedRagged: boolean;
  readonly lowest: number;
  readonly endedInBreakdown: boolean;
  readonly turns: number;
  readonly played: number;
  readonly day: number;
  readonly endReason: string | null;
  readonly reputation: number;
}

/** Plays two days of ordinary turns; a refused intent is simply not taken. */
export function ordinaryPlay(seed: number, rulesetVersion?: number, prudent = false): Play {
  const rng = createRng(`balance:${String(seed)}`);
  let run: DetectiveRunState = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: `balance-${String(seed)}`,
    rngState: rng.state(),
    locale: 'en',
  });
  if (rulesetVersion !== undefined) run = { ...run, rulesetVersion };
  let lowest = run.condition.nerves;
  let turns = 0;
  let played = 0;
  while (run.status === 'active' && run.clock.day <= DAYS && turns < MAX_TURNS) {
    const resolution = resolveIntent(run, intentOf(run, rng, prudent), rng);
    turns += 1;
    if (!resolution.ok) continue;
    played += 1;
    run = resolution.run;
    lowest = Math.min(lowest, run.condition.nerves);
  }
  return {
    reachedFrayed: lowest < 6,
    reachedRagged: lowest < 3,
    lowest,
    endedInBreakdown: run.endReason === 'breakdown',
    turns,
    played,
    day: run.clock.day,
    endReason: run.endReason,
    reputation: run.reputation,
  };
}

const share = (plays: readonly Play[], pickFlag: (play: Play) => boolean): number =>
  plays.filter(pickFlag).length / plays.length;

describe('nerves over two days of ordinary play', () => {
  const plays = Array.from({ length: SEEDS }, (_, seed) => ordinaryPlay(seed));
  const before = Array.from({ length: SEEDS }, (_, seed) =>
    ordinaryPlay(seed, ACTION_STRAIN_RULESET_VERSION - 1),
  );
  const prudent = Array.from({ length: SEEDS }, (_, seed) => ordinaryPlay(seed, undefined, true));

  it('reach the first clumsy band in nearly every run, where the ruleset before almost never did', () => {
    expect(share(plays, (play) => play.reachedFrayed)).toBeGreaterThanOrEqual(0.9);
    expect(share(before, (play) => play.reachedFrayed)).toBeLessThan(0.5);
  });

  it('never end in a breakdown for a player who lies down when the hero is at the end of their nerves', () => {
    expect(prudent.filter((play) => play.endedInBreakdown)).toEqual([]);
    expect(share(prudent, (play) => play.reachedFrayed)).toBeGreaterThanOrEqual(0.9);
  });

  it('play both days through in nearly every run, so the numbers are of two whole days', () => {
    for (const list of [plays, prudent]) {
      expect(share(list, (play) => play.day > DAYS)).toBeGreaterThanOrEqual(0.9);
    }
  });
});
