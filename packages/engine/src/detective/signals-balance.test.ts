// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createRng, D20_SIDES } from '../dice.js';
import { signalModifier } from '../signals.js';
import { TRAIT_TRIGGERS, type TraitTrigger } from '../traits.js';
import { DETECTIVE } from './archetype.js';
import { DETECTIVE_SIGNALS } from './signals.js';

// A balance run: the same many seeds for every signal, a check of every skill at the difficulties a fair case
// uses, in every scene a case can tag. What is measured is how much more (or less) often the hero passes with
// the signal than without it, so a signal that is clearly the best choice, or a trap, shows as an outlier.

const SEEDS = Array.from({ length: 400 }, (_, index) => `balance-${String(index)}`);
const DIFFICULTIES = [8, 9, 10, 11, 12, 13];
const SCENES: readonly (readonly TraitTrigger[])[] = [[], ...TRAIT_TRIGGERS.map((trigger) => [trigger])];
const SKILL_LEVEL = 3;

/** The share of checks passed, in points of a hundred, with the signal's modifiers on every die of the run. */
function passRate(signalId: string | undefined): number {
  const signal = DETECTIVE_SIGNALS.find(({ id }) => id === signalId);
  let passed = 0;
  let total = 0;
  for (const seed of SEEDS) {
    const rng = createRng(seed);
    for (const skill of DETECTIVE.skills) {
      for (const scene of SCENES) {
        const die = rng.roll(D20_SIDES);
        for (const difficulty of DIFFICULTIES) {
          total += 1;
          if (die + SKILL_LEVEL + signalModifier(signal, scene, skill) >= difficulty) passed += 1;
        }
      }
    }
  }
  return (passed / total) * 100;
}

describe('the signals of the detective', () => {
  it('number between six and eight', () => {
    expect(DETECTIVE_SIGNALS.length).toBeGreaterThanOrEqual(6);
    expect(DETECTIVE_SIGNALS.length).toBeLessThanOrEqual(8);
  });

  it('each has something that helps and something that costs', () => {
    for (const signal of DETECTIVE_SIGNALS) {
      const helps =
        signal.modifiers.some(({ amount }) => amount > 0) ||
        signal.meters.some((rule) => rule.ignores !== undefined || (rule.drift ?? 0) < 0) ||
        signal.events.some(({ variants }) => variants.some(({ tone }) => tone === 'encouraging'));
      const costs =
        signal.modifiers.some(({ amount }) => amount < 0) ||
        signal.meters.some((rule) => rule.cap !== undefined || (rule.drift ?? 0) > 0) ||
        signal.events.some(({ variants }) =>
          variants.some(({ tone }) => tone === 'demoralising' || tone === 'neutral'),
        );
      expect([signal.id, helps, costs]).toEqual([signal.id, true, true]);
    }
  });

  it('are none of them clearly the best choice or a trap: over many seeds the pass rate stays close to none', () => {
    const base = passRate(undefined);
    const shifts = DETECTIVE_SIGNALS.map(({ id }) => passRate(id) - base);

    for (const shift of shifts) expect(Math.abs(shift)).toBeLessThan(1.5);
    expect(Math.max(...shifts) - Math.min(...shifts)).toBeLessThan(2);
  });
});
