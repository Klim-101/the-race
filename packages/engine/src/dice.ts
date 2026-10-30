// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

export const D20_SIDES = 20;
export const CRITICAL_SUCCESS_DIE = 20;
export const CRITICAL_FAILURE_DIE = 1;

/** A seeded random source. Its whole state is one 32-bit integer, so a save can store it and resume. */
export interface Rng {
  /** The next float in [0, 1). */
  next(): number;
  /** A uniform integer in [1, sides]. */
  roll(sides: number): number;
  /** The current state; pass it to `restoreRng` to continue the same sequence. */
  state(): number;
}

/** FNV-1a: turns a text seed such as a date into a 32-bit state. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Continues a sequence from a state taken with `Rng.state()`. */
export function restoreRng(state: number): Rng {
  if (!Number.isInteger(state) || state < 0 || state > 0xffffffff) {
    throw new RangeError(`Rng state must be a 32-bit unsigned integer, got ${String(state)}.`);
  }
  let current = state;
  // mulberry32
  const next = (): number => {
    current = (current + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(current ^ (current >>> 15), current | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
  return {
    next,
    roll(sides) {
      if (!Number.isInteger(sides) || sides < 1) {
        throw new RangeError(`A die needs at least one side, got ${String(sides)}.`);
      }
      return Math.floor(next() * sides) + 1;
    },
    state: () => current,
  };
}

/** The same seed always gives the same sequence. */
export function createRng(seed: string | number): Rng {
  return restoreRng(typeof seed === 'string' ? hashSeed(seed) : seed >>> 0);
}

export interface SkillCheckResult<Skill extends string = string> {
  skill: Skill;
  die: number;
  skillLevel: number;
  modifier: number;
  total: number;
  difficulty: number;
  /** A natural 20 always succeeds and a natural 1 always fails, whatever the total. */
  critical: 'success' | 'failure' | null;
  success: boolean;
  /** The state of the dice before this roll: with it the same roll can be replayed. */
  rngState: number;
}

/**
 * d20 + skill + modifier against a difficulty; meeting it exactly is a success, except that a natural
 * 20 always succeeds and a natural 1 always fails.
 * The modifier is a situational bonus or penalty, such as a hidden trait firing.
 */
export function rollCheck<Skill extends string>(
  rng: Rng,
  skills: Readonly<Record<Skill, number>>,
  check: { readonly skill: Skill; readonly difficulty: number },
  modifier = 0,
): SkillCheckResult<Skill> {
  const rngState = rng.state();
  const die = rng.roll(D20_SIDES);
  const skillLevel = skills[check.skill];
  const total = die + skillLevel + modifier;
  const critical = die === CRITICAL_SUCCESS_DIE ? 'success' : die === CRITICAL_FAILURE_DIE ? 'failure' : null;
  return {
    skill: check.skill,
    die,
    skillLevel,
    modifier,
    total,
    difficulty: check.difficulty,
    critical,
    success: critical === null ? total >= check.difficulty : critical === 'success',
    rngState,
  };
}
