// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildHero } from '../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, restoreRng, rollCheck } from './dice.js';

/** A seed whose first d20 roll is `die`, so a test can pick the roll it needs. */
function seedRolling(die: number): number {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return seed;
  }
}

const sequence = (seed: string | number, length: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length }, () => rng.roll(D20_SIDES));
};

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(sequence('2026-10-30', 50)).toEqual(sequence('2026-10-30', 50));
    expect(sequence(42, 50)).toEqual(sequence(42, 50));
  });

  it('gives different sequences for different seeds', () => {
    expect(sequence('2026-10-30', 50)).not.toEqual(sequence('2026-10-31', 50));
  });

  it('keeps next() in [0, 1)', () => {
    const rng = createRng('range');
    for (let index = 0; index < 1000; index += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('rolls every face of a d20 and nothing else', () => {
    const faces = new Set(sequence('faces', 2000));

    expect(faces.size).toBe(D20_SIDES);
    expect(Math.min(...faces)).toBe(1);
    expect(Math.max(...faces)).toBe(D20_SIDES);
  });

  it('rejects a die without sides', () => {
    expect(() => createRng(1).roll(0)).toThrow(RangeError);
    expect(() => createRng(1).roll(2.5)).toThrow(RangeError);
  });
});

describe('restoreRng', () => {
  it('continues the sequence from a saved state', () => {
    const original = createRng('save');
    original.roll(D20_SIDES);
    const resumed = restoreRng(original.state());

    expect(Array.from({ length: 20 }, () => resumed.roll(D20_SIDES))).toEqual(
      Array.from({ length: 20 }, () => original.roll(D20_SIDES)),
    );
  });

  it('rejects a state that is not a 32-bit unsigned integer', () => {
    expect(() => restoreRng(-1)).toThrow(RangeError);
    expect(() => restoreRng(1.5)).toThrow(RangeError);
    expect(() => restoreRng(2 ** 32)).toThrow(RangeError);
  });
});

describe('rollCheck', () => {
  const { skills } = buildHero();

  it('adds the die, the skill level and the modifier', () => {
    const rng = createRng('check');
    const expectedDie = createRng('check').roll(D20_SIDES);

    const result = rollCheck(rng, skills, { skill: 'logic', difficulty: 15 }, 3);

    expect(result.die).toBe(expectedDie);
    expect(result.skillLevel).toBe(skills.logic);
    expect(result.modifier).toBe(3);
    expect(result.total).toBe(expectedDie + skills.logic + 3);
  });

  it('defaults the modifier to zero', () => {
    expect(rollCheck(createRng(7), skills, { skill: 'tech', difficulty: 10 }).modifier).toBe(0);
  });

  it('succeeds when the total meets the difficulty exactly and fails one below', () => {
    const seed = seedRolling(10);
    const exact = 10 + skills.charm;

    expect(rollCheck(createRng(seed), skills, { skill: 'charm', difficulty: exact }).success).toBe(true);
    expect(rollCheck(createRng(seed), skills, { skill: 'charm', difficulty: exact + 1 }).success).toBe(false);
  });

  it('treats a natural 20 as a critical success even against an impossible difficulty', () => {
    const result = rollCheck(createRng(seedRolling(20)), skills, { skill: 'charm', difficulty: 30 }, -5);

    expect(result.total).toBeLessThan(30);
    expect(result.critical).toBe('success');
    expect(result.success).toBe(true);
  });

  it('treats a natural 1 as a critical failure even against a trivial difficulty', () => {
    const result = rollCheck(createRng(seedRolling(1)), skills, { skill: 'logic', difficulty: 1 }, 10);

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.critical).toBe('failure');
    expect(result.success).toBe(false);
  });

  it('marks no other die as critical', () => {
    for (let die = 2; die < D20_SIDES; die += 1) {
      expect(
        rollCheck(createRng(seedRolling(die)), skills, { skill: 'logic', difficulty: 10 }).critical,
      ).toBe(null);
    }
  });

  it('records the state before the roll so that the roll can be replayed', () => {
    const rng = createRng('replay');
    rng.roll(D20_SIDES);
    const result = rollCheck(rng, skills, { skill: 'tech', difficulty: 10 });

    expect(restoreRng(result.rngState).roll(D20_SIDES)).toBe(result.die);
  });

  it('consumes exactly one die per check', () => {
    const rng = createRng('one');
    rollCheck(rng, skills, { skill: 'logic', difficulty: 10 });

    const control = createRng('one');
    control.roll(D20_SIDES);
    expect(rng.state()).toBe(control.state());
  });
});
