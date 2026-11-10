// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { createRng } from './dice.js';
import { ProfileRecordSchema, type ProfileRecord } from './profile.js';

// A run may remember a hero the player has played before: the world keeps them, and now and then it says so. This only
// decides who. It is flavour and never a clue, so what it returns is the public record of that run and nothing more
// (no trait, no truth of the old case), and it is chosen on the dice of the run's own seed so the same seed and the same
// profile always remember the same hero, or no one.

/** Roughly one run in this many remembers someone. */
export const REMEMBER_ONE_IN = 3;

/** What a run knows of the hero it remembers: the public record of that run, cut down to what can be told. */
export const RememberedHeroSchema = z.object({
  name: ProfileRecordSchema.shape.hero.shape.name,
  background: ProfileRecordSchema.shape.hero.shape.background,
  endReason: ProfileRecordSchema.shape.endReason,
  /** The country of the old case, as the record has it; none for a run set nowhere. */
  setting: ProfileRecordSchema.shape.setting,
  /** What the old case was about, as the record has it. */
  theme: ProfileRecordSchema.shape.theme,
});
export type RememberedHero = z.infer<typeof RememberedHeroSchema>;

/** A hero who fell: the run was lost, neither won nor given up. A hero who gave up left of their own accord. */
const fell = (record: ProfileRecord): boolean => !record.won && record.endReason !== 'gave-up';

const rememberedOf = (record: ProfileRecord): RememberedHero => ({
  name: record.hero.name,
  background: record.hero.background,
  endReason: record.endReason,
  ...(record.setting === undefined ? {} : { setting: record.setting }),
  ...(record.theme === undefined ? {} : { theme: record.theme }),
});

/**
 * The hero a run remembers, or none. About one run in `REMEMBER_ONE_IN` remembers someone, from the records of the
 * profile in the order they were made. The fallen come first, and the others only when none has fallen; the hero of
 * the latest run is never the one, so no hero is remembered twice in a row.
 */
export function chooseRemembered(
  records: readonly ProfileRecord[],
  runSeed: string,
): RememberedHero | undefined {
  const rng = createRng(`${runSeed}:remember`);
  const earlier = records.slice(0, -1);
  const fallen = earlier.filter(fell);
  const pool = fallen.length > 0 ? fallen : earlier;
  // The dice are rolled whatever the profile holds, so what the same seed does never depends on how long it is.
  const remembers = rng.roll(REMEMBER_ONE_IN) === 1;
  const pick = rng.roll(Math.max(pool.length, 1)) - 1;
  const chosen = pool[pick];
  return remembers && chosen !== undefined ? rememberedOf(chosen) : undefined;
}
