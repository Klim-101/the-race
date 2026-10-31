// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEED_TOPICS, FeedListSchema, FeedSchema } from './feed-list.js';

const SHIPPED = FeedListSchema.parse(
  JSON.parse(readFileSync(new URL('../../../content/feeds.json', import.meta.url), 'utf8')),
);

describe('the shipped feed list', () => {
  it('is valid, with every feed on https', () => {
    expect(SHIPPED.every(({ url }) => url.startsWith('https://'))).toBe(true);
  });

  it('covers every topic, and each of ru and en with world, economy and tech', () => {
    for (const topic of FEED_TOPICS) expect(SHIPPED.some((feed) => feed.topic === topic)).toBe(true);
    for (const language of ['ru', 'en']) {
      for (const topic of ['world', 'economy', 'tech']) {
        expect(SHIPPED.some((feed) => feed.language === language && feed.topic === topic)).toBe(true);
      }
    }
  });

  it('offers five humor feeds in more than one language', () => {
    const humor = SHIPPED.filter(({ topic }) => topic === 'humor');
    expect(humor).toHaveLength(5);
    expect(new Set(humor.map(({ language }) => language)).size).toBeGreaterThan(1);
  });
});

describe('FeedListSchema', () => {
  const base = { id: 'a', language: 'en', topic: 'world', url: 'https://x.test/f', enabled: true };

  it('refuses plain http, an id that is not kebab-case and a list that is empty or repeats an id', () => {
    expect(FeedSchema.safeParse({ ...base, url: 'http://x.test/f' }).success).toBe(false);
    expect(FeedSchema.safeParse({ ...base, id: '../etc' }).success).toBe(false);
    expect(FeedListSchema.safeParse([]).success).toBe(false);
    expect(FeedListSchema.safeParse([base, base]).success).toBe(false);
    expect(FeedListSchema.safeParse([base, { ...base, id: 'b' }]).success).toBe(true);
  });
});
