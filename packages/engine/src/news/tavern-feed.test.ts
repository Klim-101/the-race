// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { TAVERN_FEED_LENGTH, tavernFeed } from './tavern-feed.js';
import type { NewsSeed } from './seed.js';

const seed = (id: string, kind: NewsSeed['kind'], premise: string): NewsSeed => ({
  id,
  headlineIds: ['h0a1b2c3d'],
  kind,
  tone: 'wry',
  premise,
});
const NONE = { realNames: [] };

describe('tavernFeed', () => {
  it('is empty when there are no seeds', () => {
    expect(tavernFeed([], NONE)).toEqual([]);
  });

  it('tells the premise of a seed with its kind and tone', () => {
    const [item] = tavernFeed(
      [seed('a', 'outage', 'A cloud firm has lost a whole afternoon of payments.')],
      NONE,
    );

    expect(item).toEqual({
      kind: 'outage',
      tone: 'wry',
      text: 'A cloud firm has lost a whole afternoon of payments.',
    });
  });

  it('puts one line of each kind first, then the rest, in the order of the seeds', () => {
    const seeds = [
      seed('a', 'shortage', 'A staple has gone missing from every shelf of the city.'),
      seed('b', 'shortage', 'Shopkeepers blame each other for the empty shelves.'),
      seed('c', 'outage', 'A cloud firm has lost a whole afternoon of payments.'),
    ];

    expect(tavernFeed(seeds, NONE).map(({ text }) => text.slice(0, 12))).toEqual([
      'A staple has',
      'A cloud firm',
      'Shopkeepers ',
    ]);
  });

  it('is cut to the length of the feed', () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      seed(
        `seed-${String(index)}`,
        'dispute',
        `Neighbours quarrel over a fence, once more (${String(index)}).`,
      ),
    );

    expect(tavernFeed(many, NONE)).toHaveLength(TAVERN_FEED_LENGTH);
    expect(tavernFeed(many, NONE, 2)).toHaveLength(2);
  });

  it('drops a line that names a real name kept with the seeds', () => {
    const seeds = [
      seed('a', 'dispute', 'Norway quarrels with its neighbours over a fence.'),
      seed('b', 'outage', 'A cloud firm has lost a whole afternoon of payments.'),
    ];

    expect(tavernFeed(seeds, { realNames: ['Norway'] }).map(({ kind }) => kind)).toEqual(['outage']);
  });

  it('drops a line that reads as a tragedy, as the filter would a headline', () => {
    const seeds = [
      seed('a', 'curiosity', 'Dozens were killed when the carnival tent collapsed.'),
      seed('b', 'curiosity', 'A goose has been put in charge of the town hall keys.'),
    ];

    expect(tavernFeed(seeds, NONE).map(({ text }) => text)).toEqual([
      'A goose has been put in charge of the town hall keys.',
    ]);
  });
});
