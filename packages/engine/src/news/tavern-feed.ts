// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { createRng } from '../dice.js';
import { findRealName } from '../text/real-names.js';
import { judgeHeadline } from '../text/tragedy-filter.js';
import type { Tone } from '../detective/case-schema.js';
import type { NewsSeed, SeedKind } from './seed.js';

/** How many of the day's seeds the tavern talks about in one run. */
export const TAVERN_FEED_LENGTH = 5;

export interface TavernItem {
  readonly kind: SeedKind;
  readonly tone: Tone;
  /** The premise of a seed: a line of the mirror world, in English whatever the language of the run. */
  readonly text: string;
}

/** A shuffled copy (Fisher-Yates on the given dice), so the same dice always give the same order. */
function shuffled<T>(items: readonly T[], seed: string): T[] {
  const rng = createRng(seed);
  const copy = [...items];
  for (let last = copy.length - 1; last > 0; last -= 1) {
    const other = rng.roll(last + 1) - 1;
    [copy[last], copy[other]] = [copy[other] as T, copy[last] as T];
  }
  return copy;
}

/**
 * The seeds the tavern tells in one run: a few of the day's, drawn on dice of the run's own seed
 * (`<run seed>:tavern-news`), so the same run always hears the same rumours and two runs of one day do not. They
 * come from the seeds and from nothing else, so they cost no model call. A seed is dropped again here if it names
 * one of the real names kept with the seeds or reads as a tragedy: the seeds were checked when they were
 * submitted, and a store a player edited is not taken on trust. One seed of each kind of tension comes first, so
 * the rumours are not five of a kind. The case of the run grows from one of these, so what the tavern says and
 * what the case is about agree.
 */
export function toldSeeds(
  seeds: readonly NewsSeed[],
  context: { readonly realNames: readonly string[] },
  runSeed: string,
  max: number = TAVERN_FEED_LENGTH,
): NewsSeed[] {
  const clean = shuffled(
    seeds.filter(
      ({ premise }) =>
        findRealName(premise, context.realNames) === undefined && judgeHeadline(premise).verdict === 'keep',
    ),
    `${runSeed}:tavern-news`,
  );
  const firstOfKind = clean.filter(
    ({ kind }, index) => clean.findIndex((seed) => seed.kind === kind) === index,
  );
  const rest = clean.filter((seed) => !firstOfKind.includes(seed));
  return [...firstOfKind, ...rest].slice(0, max);
}

/** The lines the tavern tells in one run: the premise of each told seed, with its kind and tone. */
export function tavernFeed(
  seeds: readonly NewsSeed[],
  context: { readonly realNames: readonly string[] },
  runSeed: string,
  max: number = TAVERN_FEED_LENGTH,
): TavernItem[] {
  return toldSeeds(seeds, context, runSeed, max).map(({ kind, tone, premise }) => ({
    kind,
    tone,
    text: premise,
  }));
}
