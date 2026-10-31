// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  MAX_SEEDS,
  MAX_SEED_HEADLINES,
  NewsSeedSchema,
  NewsSeedsSchema,
  validateSeeds,
  type NewsSeed,
} from './seed.js';

const SEED: NewsSeed = {
  id: 'grain-shortage',
  headlineIds: ['h0a1b2c3d'],
  kind: 'shortage',
  tone: 'wry',
  premise: 'A staple runs short and everyone suspects the middlemen.',
};
const CONTEXT = { headlineIds: ['h0a1b2c3d', 'h11223344'], realNames: ['Norway', 'Германия'] };

describe('NewsSeedSchema', () => {
  it('accepts a seed and refuses any field it does not know', () => {
    expect(NewsSeedSchema.safeParse(SEED).success).toBe(true);
    expect(NewsSeedSchema.safeParse({ ...SEED, title: 'Grain prices dip' }).success).toBe(false);
  });

  it('refers to headlines by id only, one to three of them', () => {
    expect(NewsSeedSchema.safeParse({ ...SEED, headlineIds: [] }).success).toBe(false);
    expect(NewsSeedSchema.safeParse({ ...SEED, headlineIds: ['Grain prices dip'] }).success).toBe(false);
    const many = Array.from({ length: MAX_SEED_HEADLINES + 1 }, (_, index) => `h0000000${String(index)}`);
    expect(NewsSeedSchema.safeParse({ ...SEED, headlineIds: many }).success).toBe(false);
  });

  it('refuses an unknown kind, an armed conflict among them, and a premise too short or too long', () => {
    expect(NewsSeedSchema.safeParse({ ...SEED, kind: 'armed-conflict' }).success).toBe(false);
    expect(NewsSeedSchema.safeParse({ ...SEED, premise: 'Short.' }).success).toBe(false);
    expect(NewsSeedSchema.safeParse({ ...SEED, premise: 'x'.repeat(241) }).success).toBe(false);
  });
});

describe('NewsSeedsSchema', () => {
  it('needs one seed at least, at most MAX_SEEDS, and no id twice', () => {
    expect(NewsSeedsSchema.safeParse([]).success).toBe(false);
    expect(NewsSeedsSchema.safeParse([SEED, SEED]).success).toBe(false);
    expect(NewsSeedsSchema.safeParse([SEED, { ...SEED, id: 'other-seed' }]).success).toBe(true);
    const many = Array.from({ length: MAX_SEEDS + 1 }, (_, index) => ({
      ...SEED,
      id: `seed-${String(index)}`,
    }));
    expect(NewsSeedsSchema.safeParse(many).success).toBe(false);
  });
});

describe('validateSeeds', () => {
  it('passes a seed that cites known headlines and names no one', () => {
    expect(validateSeeds([SEED], CONTEXT)).toEqual([]);
  });

  it('refuses a headline the extractor was not given', () => {
    const issues = validateSeeds([{ ...SEED, headlineIds: ['h0a1b2c3d', 'hffffffff'] }], CONTEXT);

    expect(issues.map(({ code, seedId }) => [code, seedId])).toEqual([
      ['unknown-headline', 'grain-shortage'],
    ]);
    expect(issues[0]?.message).toContain('hffffffff');
  });

  it('refuses a real name in either script, with an ending, without repeating it', () => {
    const english = validateSeeds(
      [{ ...SEED, premise: 'Talks with Norway over grain stall again.' }],
      CONTEXT,
    );
    const russian = validateSeeds(
      [{ ...SEED, premise: 'Поставки зерна в Германии снова сорваны.' }],
      CONTEXT,
    );

    expect(english.map(({ code }) => code)).toEqual(['real-name']);
    expect(russian.map(({ code }) => code)).toEqual(['real-name']);
    expect(english[0]?.message).not.toContain('Norway');
    expect(russian[0]?.message).not.toContain('Германи');
  });

  it('reports every problem of every seed', () => {
    const second: NewsSeed = {
      ...SEED,
      id: 'second',
      headlineIds: ['hffffffff'],
      premise: 'Norway runs out of grain again.',
    };

    expect(validateSeeds([SEED, second], CONTEXT).map(({ code }) => code)).toEqual([
      'unknown-headline',
      'real-name',
    ]);
  });
});
