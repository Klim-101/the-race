// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { DETECTIVE_TRAITS } from './detective/traits.js';
import { END_REASONS } from './run.js';
import type { ProfileRecord } from './profile.js';
import {
  LOSSES_TO_LOSE_A_SLOT,
  MAX_TOOL_SLOTS,
  MAX_TRAIT_SLOTS,
  START_TOOL_SLOTS,
  START_TRAIT_SLOTS,
  toolSlotsOf,
  traitRuleFor,
  traitSlotsOf,
  winsOf,
} from './progress.js';
import { rollTraits } from './traits.js';
import { createRng } from './dice.js';

const record = (
  won: boolean,
  endReason: ProfileRecord['endReason'] = won ? 'proven' : 'time-ran-out',
): ProfileRecord => ({
  version: 1,
  runId: `run-${String(Math.random())}`,
  locale: 'en',
  title: 'A case',
  hero: { name: 'Mira', background: 'police', lifeState: undefined },
  endReason,
  won,
  days: 1,
  turns: 1,
  minutes: 1,
  cluesFound: 0,
  insights: 0,
  traitsRevealed: 0,
  traitsTotal: 2,
});

const WIN = record(true);
const LOSS = record(false);
const GAVE_UP = record(false, 'gave-up');
const runs = (...kinds: ProfileRecord[]): ProfileRecord[] => kinds;

describe('the tool slots a profile has earned', () => {
  it('start at one, for a player with no runs behind them', () => {
    expect(toolSlotsOf([])).toBe(START_TOOL_SLOTS);
  });

  it('open one for each win, up to five', () => {
    expect(toolSlotsOf(runs(WIN))).toBe(2);
    expect(toolSlotsOf(runs(WIN, WIN, WIN))).toBe(4);
    expect(toolSlotsOf(runs(WIN, WIN, WIN, WIN, WIN, WIN, WIN))).toBe(MAX_TOOL_SLOTS);
  });

  it('are not touched by one loss, and lose one to two in a row', () => {
    expect(toolSlotsOf(runs(WIN, WIN, LOSS))).toBe(3);
    expect(toolSlotsOf(runs(WIN, WIN, LOSS, LOSS))).toBe(2);
    expect(LOSSES_TO_LOSE_A_SLOT).toBe(2);
  });

  it('have the count of losses start again after a loss of a slot, so four in a row take two', () => {
    expect(toolSlotsOf(runs(WIN, WIN, WIN, LOSS, LOSS, LOSS))).toBe(3);
    expect(toolSlotsOf(runs(WIN, WIN, WIN, LOSS, LOSS, LOSS, LOSS))).toBe(2);
  });

  it('are saved from a loss by a win in between', () => {
    expect(toolSlotsOf(runs(WIN, LOSS, WIN, LOSS, WIN))).toBe(4);
  });

  it('never fall below one', () => {
    expect(toolSlotsOf(runs(LOSS, LOSS, LOSS, LOSS, LOSS, LOSS))).toBe(START_TOOL_SLOTS);
  });

  it('count a run given up as lost', () => {
    expect(toolSlotsOf(runs(WIN, WIN, GAVE_UP, GAVE_UP))).toBe(2);
    expect(toolSlotsOf(runs(WIN, WIN, GAVE_UP, LOSS))).toBe(2);
  });

  it('stay between one and five, and only a win ever opens one, over many runs in a row', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const rng = createRng(seed);
      const history: ProfileRecord[] = [];
      for (let index = 0; index < 30; index += 1) {
        const before = toolSlotsOf(history);
        const won = rng.roll(3) === 1;
        history.push(won ? WIN : rng.roll(2) === 1 ? LOSS : GAVE_UP);
        const after = toolSlotsOf(history);

        expect(after).toBeGreaterThanOrEqual(START_TOOL_SLOTS);
        expect(after).toBeLessThanOrEqual(MAX_TOOL_SLOTS);
        if (!won) expect(after).toBeLessThanOrEqual(before);
        if (won) expect(after).toBe(Math.min(MAX_TOOL_SLOTS, before + 1));
      }
    }
  });

  it('covers every way a run can end', () => {
    for (const endReason of END_REASONS) {
      expect(toolSlotsOf([record(endReason === 'proven', endReason)])).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the hidden trait slots', () => {
  it('are two for a hero with no wins, and one more for each win, up to five', () => {
    expect([0, 1, 2, 3, 4, 10].map(traitSlotsOf)).toEqual([2, 3, 4, 5, 5, 5]);
    expect(START_TRAIT_SLOTS).toBe(2);
    expect(MAX_TRAIT_SLOTS).toBe(5);
  });

  it('follow the wins of the profile and nothing else', () => {
    expect(winsOf(runs(WIN, LOSS, GAVE_UP, WIN))).toBe(2);
    expect(traitSlotsOf(winsOf(runs(LOSS, LOSS, GAVE_UP)))).toBe(START_TRAIT_SLOTS);
  });

  it('split into two sides that differ by at most one', () => {
    for (let slots = START_TRAIT_SLOTS; slots <= MAX_TRAIT_SLOTS; slots += 1) {
      for (let seed = 0; seed < 50; seed += 1) {
        const rule = traitRuleFor(slots, `seed-${String(seed)}`);

        expect(rule.positive + rule.negative).toBe(slots);
        expect(rule.any).toBe(0);
        expect(Math.abs(rule.positive - rule.negative)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('give an even number the same split every time, and an odd one either, drawn from the seed', () => {
    expect(traitRuleFor(2, 'a')).toEqual({ positive: 1, negative: 1, any: 0 });
    expect(traitRuleFor(4, 'b')).toEqual({ positive: 2, negative: 2, any: 0 });
    const fives = new Set(
      Array.from({ length: 60 }, (_, seed) => JSON.stringify(traitRuleFor(5, `five-${String(seed)}`))),
    );
    expect([...fives].sort()).toEqual([
      JSON.stringify({ positive: 2, negative: 3, any: 0 }),
      JSON.stringify({ positive: 3, negative: 2, any: 0 }),
    ]);
    expect(traitRuleFor(5, 'same')).toEqual(traitRuleFor(5, 'same'));
  });

  it('are filled by the catalogue without breaking an exclusion, whatever the seed', () => {
    const catalogue = DETECTIVE_TRAITS;
    for (let slots = START_TRAIT_SLOTS; slots <= MAX_TRAIT_SLOTS; slots += 1) {
      for (let seed = 0; seed < 300; seed += 1) {
        const rule = traitRuleFor(slots, `fill-${String(seed)}`);
        const drawn = rollTraits(createRng(`draw-${String(seed)}`), catalogue, rule);

        expect(drawn).toHaveLength(slots);
        expect(drawn.filter(({ polarity }) => polarity === 'positive')).toHaveLength(rule.positive);
        expect(drawn.filter(({ polarity }) => polarity === 'negative')).toHaveLength(rule.negative);
        for (const trait of drawn) {
          for (const other of drawn) expect(trait.excludes).not.toContain(other.id);
        }
      }
    }
  });
});
