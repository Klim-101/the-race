// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { TAVERN_FEED_LENGTH, tavernFeed, toldSeeds } from './tavern-feed.js';
import { SEED_KINDS, type NewsSeed } from './seed.js';

const seed = (id: string, kind: NewsSeed['kind'], premise: string): NewsSeed => ({
  id,
  headlineIds: ['h0a1b2c3d'],
  kind,
  tone: 'wry',
  premise,
});
const NONE = { realNames: [] };
const RUN = 'run-1';

/** A day of twelve seeds, two of each of six kinds, as the extractor leaves one. */
const DAY: NewsSeed[] = SEED_KINDS.slice(0, 6).flatMap((kind, index) => [
  seed(`${kind}-a`, kind, `A matter of ${kind}, told the first way (${String(index)}).`),
  seed(`${kind}-b`, kind, `A matter of ${kind}, told the second way (${String(index)}).`),
]);

describe('tavernFeed', () => {
  it('is empty when there are no seeds', () => {
    expect(tavernFeed([], NONE, RUN)).toEqual([]);
  });

  it('tells the premise of a seed with its kind and tone', () => {
    const [item] = tavernFeed(
      [seed('a', 'outage', 'A cloud firm has lost a whole afternoon of payments.')],
      NONE,
      RUN,
    );

    expect(item).toEqual({
      kind: 'outage',
      tone: 'wry',
      text: 'A cloud firm has lost a whole afternoon of payments.',
    });
  });

  it('puts one line of each kind first, then the rest', () => {
    const seeds = [
      seed('a', 'shortage', 'A staple has gone missing from every shelf of the city.'),
      seed('b', 'shortage', 'Shopkeepers blame each other for the empty shelves.'),
      seed('c', 'outage', 'A cloud firm has lost a whole afternoon of payments.'),
    ];

    const kinds = tavernFeed(seeds, NONE, RUN).map(({ kind }) => kind);

    expect(new Set(kinds.slice(0, 2)).size).toBe(2);
    expect(kinds).toHaveLength(3);
  });

  it('is cut to the length of the feed', () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      seed(
        `seed-${String(index)}`,
        'dispute',
        `Neighbours quarrel over a fence, once more (${String(index)}).`,
      ),
    );

    expect(tavernFeed(many, NONE, RUN)).toHaveLength(TAVERN_FEED_LENGTH);
    expect(tavernFeed(many, NONE, RUN, 2)).toHaveLength(2);
  });

  it('drops a line that names a real name kept with the seeds', () => {
    const seeds = [
      seed('a', 'dispute', 'Norway quarrels with its neighbours over a fence.'),
      seed('b', 'outage', 'A cloud firm has lost a whole afternoon of payments.'),
    ];

    expect(tavernFeed(seeds, { realNames: ['Norway'] }, RUN).map(({ kind }) => kind)).toEqual(['outage']);
  });

  it('drops a line that reads as a tragedy, as the filter would a headline', () => {
    const seeds = [
      seed('a', 'curiosity', 'Dozens were killed when the carnival tent collapsed.'),
      seed('b', 'curiosity', 'A goose has been put in charge of the town hall keys.'),
    ];

    expect(tavernFeed(seeds, NONE, RUN).map(({ text }) => text)).toEqual([
      'A goose has been put in charge of the town hall keys.',
    ]);
  });
});

describe('toldSeeds', () => {
  const ids = (runSeed: string) => toldSeeds(DAY, NONE, runSeed).map(({ id }) => id);

  it('is the same for the same run, call after call', () => {
    expect(ids(RUN)).toEqual(ids(RUN));
  });

  it('is a few of the day, one of each kind first, so five distinct kinds before any kind repeats', () => {
    const told = toldSeeds(DAY, NONE, RUN);

    expect(told).toHaveLength(TAVERN_FEED_LENGTH);
    expect(new Set(told.map(({ kind }) => kind)).size).toBe(TAVERN_FEED_LENGTH);
  });

  it('differs between runs of one day: over many runs the tavern tells every seed of the day, in many orders', () => {
    const runs = Array.from({ length: 200 }, (_, index) => ids(`run-${String(index)}`));

    expect(new Set(runs.map((told) => told.join())).size).toBeGreaterThan(50);
    expect(new Set(runs.flat()).size).toBe(DAY.length);
    // The first line is not always the same: no seed leads every run.
    expect(new Set(runs.map(([first]) => first)).size).toBeGreaterThan(3);
  });

  it('never tells a seed twice in one run', () => {
    for (let index = 0; index < 50; index += 1) {
      const told = ids(`run-${String(index)}`);
      expect(new Set(told).size).toBe(told.length);
    }
  });

  it('keeps a real name out of every run, and leaves the dice of the run alone', () => {
    const named = [seed('n', 'dispute', 'Norway quarrels with its neighbours over a fence.'), ...DAY];

    for (let index = 0; index < 50; index += 1) {
      const told = toldSeeds(named, { realNames: ['Norway'] }, `run-${String(index)}`);
      expect(told.map(({ id }) => id)).not.toContain('n');
    }
  });
});
