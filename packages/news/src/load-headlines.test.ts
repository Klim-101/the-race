// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { memoryFs } from '../../saves/test/memory-fs.js';
import { ATOM_FEED, RSS_FEED } from '../test/fixtures/feeds.js';
import type { Feed } from './feed-list.js';
import { loadHeadlines } from './load-headlines.js';

const SAVE_DIR = 'save';
const cachePath = (id: string): string => join(SAVE_DIR, 'news', `${id}.json`);

function feed(id: string, enabled = true): Feed {
  return { id, language: 'en', topic: 'world', url: `https://feeds.test/${id}.xml`, enabled };
}

/** A network of fixed answers that counts its requests; an answer that is an Error is thrown. */
function network(answers: Record<string, string | Error>) {
  const requests: string[] = [];
  return {
    requests,
    get: (url: string): Promise<string> => {
      requests.push(url);
      const answer = answers[url];
      if (answer === undefined || answer instanceof Error) return Promise.reject(answer ?? new Error('404'));
      return Promise.resolve(answer);
    },
  };
}

describe('loadHeadlines', () => {
  it('fetches each enabled feed once, in the order of the list, and keeps the day in a cache', async () => {
    const fs = memoryFs();
    const net = network({ 'https://feeds.test/a.xml': RSS_FEED, 'https://feeds.test/b.xml': ATOM_FEED });
    const input = {
      feeds: [feed('a'), feed('off', false), feed('b')],
      day: '2026-10-31',
      saveDir: SAVE_DIR,
      saveFs: fs,
      get: net.get,
    };

    const first = await loadHeadlines(input);

    expect(first.map(({ feed: { id }, status }) => [id, status])).toEqual([
      ['a', 'fresh'],
      ['b', 'fresh'],
    ]);
    expect(first[0]?.headlines[1]).toEqual({ title: 'Grain prices dip' });
    expect(JSON.parse(fs.files.get(cachePath('a')) ?? '{}')).toMatchObject({ day: '2026-10-31' });
    expect(fs.files.has(`${cachePath('a')}.tmp`)).toBe(false);

    const again = await loadHeadlines(input);

    expect(again.map(({ status }) => status)).toEqual(['cached', 'cached']);
    expect(again[0]?.headlines).toEqual(first[0]?.headlines);
    expect(net.requests).toHaveLength(2);
  });

  it('fetches again on a new day and replaces the cache', async () => {
    const fs = memoryFs();
    const net = network({ 'https://feeds.test/a.xml': RSS_FEED });
    const base = { feeds: [feed('a')], saveDir: SAVE_DIR, saveFs: fs, get: net.get };

    await loadHeadlines({ ...base, day: '2026-10-31' });
    const next = await loadHeadlines({ ...base, day: '2026-11-01' });

    expect(next[0]?.status).toBe('fresh');
    expect(net.requests).toHaveLength(2);
    expect(JSON.parse(fs.files.get(cachePath('a')) ?? '{}')).toMatchObject({ day: '2026-11-01' });
  });

  it('does not fail the run for a feed that fails: yesterday’s headlines if it has them, none if not', async () => {
    const fs = memoryFs();
    const good = network({ 'https://feeds.test/a.xml': RSS_FEED });
    await loadHeadlines({
      feeds: [feed('a')],
      day: '2026-10-31',
      saveDir: SAVE_DIR,
      saveFs: fs,
      get: good.get,
    });

    const down = network({ 'https://feeds.test/a.xml': new Error('timeout') });
    const result = await loadHeadlines({
      feeds: [feed('a'), feed('never')],
      day: '2026-11-01',
      saveDir: SAVE_DIR,
      saveFs: fs,
      get: down.get,
    });

    expect(result.map(({ status }) => status)).toEqual(['stale', 'failed']);
    expect(result[0]?.headlines).toHaveLength(2);
    expect(result[1]?.headlines).toEqual([]);
  });

  it('counts a feed with no headlines as a failure and keeps the last good ones', async () => {
    const fs = memoryFs();
    const net = network({ 'https://feeds.test/a.xml': '<html>maintenance</html>' });

    const result = await loadHeadlines({
      feeds: [feed('a')],
      day: '2026-10-31',
      saveDir: SAVE_DIR,
      saveFs: fs,
      get: net.get,
    });

    expect(result[0]?.status).toBe('failed');
    expect(fs.files.size).toBe(0);
  });

  it('treats a cache it cannot read or understand as missing', async () => {
    const fs = memoryFs();
    const net = network({
      'https://feeds.test/a.xml': RSS_FEED,
      'https://feeds.test/b.xml': RSS_FEED,
      'https://feeds.test/c.xml': RSS_FEED,
    });
    fs.files.set(cachePath('a'), '{not json');
    fs.files.set(cachePath('b'), JSON.stringify({ day: 'yesterday', headlines: [] }));
    fs.failRead(cachePath('c'));

    const result = await loadHeadlines({
      feeds: [feed('a'), feed('b'), feed('c')],
      day: '2026-10-31',
      saveDir: SAVE_DIR,
      saveFs: fs,
      get: net.get,
    });

    expect(result.map(({ status }) => status)).toEqual(['fresh', 'fresh', 'fresh']);
  });

  it('still returns the headlines when the cache cannot be written', async () => {
    const fs = memoryFs();
    fs.failRename(cachePath('a'));
    const net = network({ 'https://feeds.test/a.xml': RSS_FEED });

    const result = await loadHeadlines({
      feeds: [feed('a')],
      day: '2026-10-31',
      saveDir: SAVE_DIR,
      saveFs: fs,
      get: net.get,
    });

    expect(result[0]?.status).toBe('fresh');
    expect(result[0]?.headlines).toHaveLength(2);
  });

  it('caps the headlines of a feed', async () => {
    const net = network({ 'https://feeds.test/a.xml': RSS_FEED });

    const result = await loadHeadlines({
      feeds: [feed('a')],
      day: '2026-10-31',
      saveDir: SAVE_DIR,
      saveFs: memoryFs(),
      get: net.get,
      maxHeadlines: 1,
    });

    expect(result[0]?.headlines).toHaveLength(1);
  });

  it('refuses a day that is not a date', async () => {
    const net = network({});
    await expect(
      loadHeadlines({
        feeds: [feed('a')],
        day: 'today',
        saveDir: SAVE_DIR,
        saveFs: memoryFs(),
        get: net.get,
      }),
    ).rejects.toThrow();
  });
});
