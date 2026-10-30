// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import { passChanceWithoutLuck } from '../../dice.js';
import type { Trait } from '../../traits.js';
import { DetectiveCaseSchema, type DetectiveCase } from '../case-schema.js';
import { validateCase } from '../case-validator.js';
import { DETECTIVE_TRAITS } from '../traits.js';
import { bestSolveChance, CHECK_ATTEMPTS, clueChances, MIN_SOLVE_CHANCE } from './solve-chance.js';

type RawCase = ReturnType<typeof buildCheeseCase>;

function parsed(raw: RawCase): DetectiveCase {
  return DetectiveCaseSchema.parse(raw);
}

function codesOf(raw: RawCase, traits: readonly Trait[] = []): string[] {
  const result = validateCase(raw, { hero: buildHero(), traits, locale: 'en', realNames: [] });
  return result.isValid ? [] : result.issues.map(({ code }) => code);
}

/** The motive's receipt is the one check of the cheese case that a harder difficulty tips over the line. */
function withReceiptDifficulty(difficulty: number): RawCase {
  const raw = buildCheeseCase();
  raw.clues[3] = { ...raw.clues[3], discovery: { skill: 'reasoning', difficulty } };
  return raw;
}

const tries = (chance: number): number => 1 - (1 - chance) ** CHECK_ATTEMPTS;

describe('clueChances', () => {
  it('counts a clue found by looking as certain and multiplies the checks on the way to the others', () => {
    const chances = clueChances(parsed(buildCheeseCase()), buildHero(), []);

    expect(chances.get('cellar-key')).toBe(1);
    expect(chances.get('blue-glove')).toBe(1);
    // perception 3 against 10: the faces 7 to 19 count
    expect(chances.get('flour-crumbs')).toBeCloseTo(tries(passChanceWithoutLuck(3, 0, 10)), 10);
    // the door needs social 12 and the receipt reasoning 12
    expect(chances.get('oven-receipt')).toBeCloseTo(
      tries(passChanceWithoutLuck(0, 0, 12)) * tries(passChanceWithoutLuck(2, 0, 12)),
      10,
    );
    expect(chances.get('debt-ledger')).toBeCloseTo(tries(passChanceWithoutLuck(0, 0, 12)), 10);
  });

  it('opens a door that needs a clue exactly as well as the clue is found', () => {
    const raw = buildCheeseCase();
    raw.clues[0] = { ...raw.clues[0], discovery: { skill: 'perception', difficulty: 14 } };

    const chances = clueChances(parsed(raw), buildHero(), []);

    expect(chances.get('cart-tracks')).toBeCloseTo(
      tries(passChanceWithoutLuck(3, 0, 14)) * tries(passChanceWithoutLuck(3, 0, 8)),
      10,
    );
  });

  it('takes the likeliest way in when a place can be entered from two sides', () => {
    const raw = buildCheeseCase();
    // The office borders the stall, which is a hard way in, and the square, which is a free one.
    raw.locations[0]!.connections = ['cheese-stall', 'storage-cellar', 'mayor-office'];
    raw.locations[1]!.access = { kind: 'skill', check: { skill: 'perception', difficulty: 15 } };

    const chances = clueChances(parsed(raw), buildHero(), []);

    expect(chances.get('debt-ledger')).toBeCloseTo(tries(passChanceWithoutLuck(0, 0, 12)), 10);
  });

  it('gives nothing for a place that no road leads to, and for a source the traits close', () => {
    const raw = buildCheeseCase();
    raw.locations[1]!.connections = [];
    raw.locations[0]!.connections = ['storage-cellar'];
    raw.clues.push({
      id: 'police-file',
      locationId: 'market-square',
      description: 'A file from the police archive.',
      discovery: null,
      source: 'police-data',
      pointsTo: [],
      isRedHerring: false,
    });
    const closing = DETECTIVE_TRAITS.find(({ id }) => id === 'old-enemy-in-the-police');

    const open = clueChances(parsed(raw), buildHero(), []);
    const shut = clueChances(parsed(raw), buildHero(), closing ? [closing] : []);

    expect(open.get('flour-crumbs') ?? 0).toBe(0);
    expect(open.get('police-file')).toBe(1);
    expect(shut.has('police-file')).toBe(false);
  });

  it('lets the situations of a scene move a check through the traits', () => {
    const raw = buildCheeseCase();
    raw.locations[3]!.situations = ['high-society'];
    const wellConnected = DETECTIVE_TRAITS.find(({ id }) => id === 'well-connected');

    const plain = clueChances(parsed(raw), buildHero(), []).get('debt-ledger') ?? 0;
    const boosted =
      clueChances(parsed(raw), buildHero(), wellConnected ? [wellConnected] : []).get('debt-ledger') ?? 0;

    expect(boosted).toBeCloseTo(tries(passChanceWithoutLuck(0, 3, 12)), 10);
    expect(boosted).toBeGreaterThan(plain);
  });
});

describe('bestSolveChance', () => {
  it('multiplies the clues of the best chain and the motive, each once', () => {
    const chances = clueChances(parsed(buildCheeseCase()), buildHero(), []);
    const product = (ids: string[]): number => ids.reduce((all, id) => all * (chances.get(id) ?? 0), 1);
    const chain0 = product(['flour-crumbs', 'cart-tracks', 'oven-receipt', 'debt-ledger']);
    const chain1 = product(['oven-receipt', 'debt-ledger']);

    expect(chain1).toBeGreaterThan(chain0);
    expect(bestSolveChance(parsed(buildCheeseCase()), buildHero(), [])).toBeCloseTo(chain1, 10);
  });

  it('is zero when the chain cannot be found without luck', () => {
    expect(bestSolveChance(parsed(withReceiptDifficulty(30)), buildHero(), [])).toBe(0);
  });
});

describe('the solve-chance check', () => {
  it('accepts a case whose best chain is just above the threshold, and rejects one just below it', () => {
    const above = bestSolveChance(parsed(withReceiptDifficulty(17)), buildHero(), []);
    const below = bestSolveChance(parsed(withReceiptDifficulty(18)), buildHero(), []);

    expect(above).toBeGreaterThanOrEqual(MIN_SOLVE_CHANCE);
    expect(below).toBeLessThan(MIN_SOLVE_CHANCE);
    expect(codesOf(withReceiptDifficulty(17))).toEqual([]);
    expect(codesOf(withReceiptDifficulty(18))).toEqual(['unlikely-solution']);
  });

  it('reports a case that only a natural 20 could solve, and never names a trait', () => {
    const traits = DETECTIVE_TRAITS.slice(0, 3);
    const result = validateCase(withReceiptDifficulty(22), {
      hero: buildHero(),
      traits,
      locale: 'en',
      realNames: [],
    });

    expect(result.isValid).toBe(false);
    const messages = result.isValid ? [] : result.issues.map(({ message }) => message);
    expect(messages.join(' ')).toContain('%');
    for (const trait of DETECTIVE_TRAITS) expect(messages.join(' ')).not.toContain(trait.id);
  });

  it('leaves a case with no possible chain to the reachability checks', () => {
    const raw = buildCheeseCase();
    raw.clues[2] = { ...raw.clues[2], discovery: { skill: 'tech', difficulty: 30 } };
    raw.clues[1] = { ...raw.clues[1], discovery: { skill: 'tech', difficulty: 30 } };

    expect(codesOf(raw)).not.toContain('unlikely-solution');
  });
});
