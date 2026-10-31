// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { loadShippedFeeds } from './shipped-feeds.js';

describe('loadShippedFeeds', () => {
  it('reads the list that ships in content/', async () => {
    const feeds = await loadShippedFeeds();

    expect(feeds.length).toBeGreaterThan(5);
    expect(feeds.some(({ id }) => id === 'bbc-world')).toBe(true);
  });

  it('refuses a file that is not a feed list', async () => {
    await expect(loadShippedFeeds(new URL('./shipped-feeds.ts', import.meta.url))).rejects.toThrow();
  });
});
