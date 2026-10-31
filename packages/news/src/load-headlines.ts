// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { SaveFs } from '@the-race/saves';
import { z } from 'zod';
import type { Feed } from './feed-list.js';
import type { HttpGet } from './http-get.js';
import { parseFeed, type Headline } from './parse-feed.js';

export const DEFAULT_MAX_HEADLINES = 40;

const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const CacheSchema = z.object({
  day: DaySchema,
  headlines: z.array(z.object({ title: z.string(), summary: z.string().optional() })),
});
type Cache = z.output<typeof CacheSchema>;

/**
 * `fresh`: fetched now. `cached`: fetched earlier today, no request made. `stale`: today's fetch failed and
 * these are the headlines of an earlier day. `failed`: today's fetch failed and there is nothing earlier.
 */
export type FeedStatus = 'fresh' | 'cached' | 'stale' | 'failed';

export interface FeedHeadlines {
  readonly feed: Feed;
  readonly status: FeedStatus;
  readonly headlines: readonly Headline[];
}

export interface LoadHeadlinesInput {
  readonly feeds: readonly Feed[];
  /** Today as `YYYY-MM-DD`, passed in: nothing here reads the clock. */
  readonly day: string;
  readonly saveDir: string;
  readonly saveFs: SaveFs;
  readonly get: HttpGet;
  readonly maxHeadlines?: number;
}

const cacheFile = (saveDir: string, feed: Feed): string => join(saveDir, 'news', `${feed.id}.json`);

async function readCache(input: LoadHeadlinesInput, feed: Feed): Promise<Cache | undefined> {
  try {
    const text = await input.saveFs.readFile(cacheFile(input.saveDir, feed));
    if (text === undefined) return undefined;
    const parsed = CacheSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    // A cache that cannot be read is a cache that is not there.
    return undefined;
  }
}

async function writeCache(
  input: LoadHeadlinesInput,
  feed: Feed,
  headlines: readonly Headline[],
): Promise<void> {
  const file = cacheFile(input.saveDir, feed);
  const temporary = `${file}.tmp`;
  try {
    await input.saveFs.mkdir(join(input.saveDir, 'news'));
    await input.saveFs.writeFileSynced(temporary, JSON.stringify({ day: input.day, headlines }));
    await input.saveFs.rename(temporary, file);
  } catch {
    // The headlines are in hand; a cache that could not be written only costs a fetch tomorrow.
  }
}

async function loadFeed(input: LoadHeadlinesInput, feed: Feed): Promise<FeedHeadlines> {
  const cached = await readCache(input, feed);
  if (cached?.day === input.day) return { feed, status: 'cached', headlines: cached.headlines };
  try {
    const headlines = parseFeed(await input.get(feed.url), input.maxHeadlines ?? DEFAULT_MAX_HEADLINES);
    if (headlines.length === 0) throw new Error('The feed holds no headlines.');
    await writeCache(input, feed, headlines);
    return { feed, status: 'fresh', headlines };
  } catch {
    // A feed that fails, times out or turns out empty never fails the run: it falls back to the last good day.
    return cached === undefined
      ? { feed, status: 'failed', headlines: [] }
      : { feed, status: 'stale', headlines: cached.headlines };
  }
}

/**
 * The headlines of every enabled feed, in the order of the list: one fetch per feed per day, and a feed that
 * cannot be had gives its last good headlines or none. Only a malformed `day` throws.
 */
export async function loadHeadlines(input: LoadHeadlinesInput): Promise<FeedHeadlines[]> {
  DaySchema.parse(input.day);
  return Promise.all(input.feeds.filter(({ enabled }) => enabled).map((feed) => loadFeed(input, feed)));
}
