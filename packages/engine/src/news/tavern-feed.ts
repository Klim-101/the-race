// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { findRealName } from '../text/real-names.js';
import { judgeHeadline } from '../text/tragedy-filter.js';
import type { Tone } from '../detective/case-schema.js';
import type { NewsSeed, SeedKind } from './seed.js';

export const TAVERN_FEED_LENGTH = 5;

export interface TavernItem {
  readonly kind: SeedKind;
  readonly tone: Tone;
  /** The premise of a seed: a line of the mirror world, in English whatever the language of the run. */
  readonly text: string;
}

/**
 * The few lines of the day's news that are told in the tavern. They come from the seeds and from nothing
 * else, so they cost no model call. A line is dropped again here if it names one of the real names kept with
 * the seeds or reads as a tragedy: the seeds were checked when they were submitted, and a store a player
 * edited is not taken on trust. One line per kind of tension comes first, so the feed is not five of a kind;
 * the order is that of the seeds, so it is the same on every call.
 */
export function tavernFeed(
  seeds: readonly NewsSeed[],
  context: { readonly realNames: readonly string[] },
  max: number = TAVERN_FEED_LENGTH,
): TavernItem[] {
  const clean = seeds.filter(
    ({ premise }) =>
      findRealName(premise, context.realNames) === undefined && judgeHeadline(premise).verdict === 'keep',
  );
  const firstOfKind = clean.filter(
    ({ kind }, index) => clean.findIndex((seed) => seed.kind === kind) === index,
  );
  const rest = clean.filter((seed) => !firstOfKind.includes(seed));
  return [...firstOfKind, ...rest]
    .slice(0, max)
    .map(({ kind, tone, premise }) => ({ kind, tone, text: premise }));
}
