// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { createRng } from './dice.js';
import type { ProfileRecord } from './profile.js';
import type { TraitRule } from './traits.js';

// What a player's runs have earned a hero. It is the roguelike part: nothing is stored beyond the profile's own
// records, and every number here is computed from them, in the order the runs were made. A win opens a slot for
// a tool and a slot for a trait; a loss takes a tool slot back after two in a row; nothing but a win opens a slot.

/** The tool slots of a hero with no runs behind them, and the most there can be. The phone takes none. */
export const START_TOOL_SLOTS = 1;
export const MAX_TOOL_SLOTS = 5;
/** Runs lost in a row that take a tool slot away. */
export const LOSSES_TO_LOSE_A_SLOT = 2;

/** The hidden traits of a hero with no runs behind them (one plus, one minus), and the most there can be. */
export const START_TRAIT_SLOTS = 2;
export const MAX_TRAIT_SLOTS = 5;

/**
 * The luck tokens a hero starts a run with, and the most there can be. Each lets the player roll one failed check
 * again; the supply is filled anew for every run.
 */
export const START_LUCK_TOKENS = 1;
export const MAX_LUCK_TOKENS = 5;

/** What the pockets hold at most: the coffee and the pills (the sedative) the hero can carry. */
export const POCKET_LIMITS = { coffee: 2, sedative: 7 } as const;

/**
 * The tool slots the next hero has. A win opens one more (up to five), and two lost runs in a row take one away
 * (down to one), after which the count of losses starts again. A run given up counts as lost: otherwise
 * quitting would be a way to dodge a loss.
 */
export function toolSlotsOf(records: readonly ProfileRecord[]): number {
  let slots = START_TOOL_SLOTS;
  let losses = 0;
  for (const record of records) {
    if (record.won) {
      slots = Math.min(MAX_TOOL_SLOTS, slots + 1);
      losses = 0;
    } else {
      losses += 1;
      if (losses === LOSSES_TO_LOSE_A_SLOT) {
        slots = Math.max(START_TOOL_SLOTS, slots - 1);
        losses = 0;
      }
    }
  }
  return slots;
}

/** The hidden trait slots a hero has after `wins` victories: two at first, one more for each win, up to five. */
export function traitSlotsOf(wins: number): number {
  return Math.min(MAX_TRAIT_SLOTS, START_TRAIT_SLOTS + wins);
}

/** The luck tokens a hero has after `wins` victories: one at first, one more for each win, up to five. */
export function luckTokensOf(wins: number): number {
  return Math.min(MAX_LUCK_TOKENS, START_LUCK_TOKENS + wins);
}

/**
 * How a number of trait slots is split between the good and the bad: the two sides differ by at most one, and with
 * an odd number the extra slot goes to either side, drawn from the seed, so that five slots give two and three, or
 * three and two. The same seed always splits the same way.
 */
export function traitRuleFor(slots: number, seed: string): TraitRule {
  const half = Math.floor(slots / 2);
  const extraToGood = slots % 2 === 1 && createRng(`${seed}:trait-slots`).roll(2) === 1;
  return { positive: half + (extraToGood ? 1 : 0), negative: slots - half - (extraToGood ? 1 : 0), any: 0 };
}

/** The number of runs the player has won. */
export const winsOf = (records: readonly ProfileRecord[]): number => records.filter(({ won }) => won).length;
