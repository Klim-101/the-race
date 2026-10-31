// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises';
import { FeedListSchema, type FeedList } from './feed-list.js';

// `src` and `dist` sit at the same depth, so the repository's `content/` is three levels up from both.
const SHIPPED = new URL('../../../content/feeds.json', import.meta.url);

/** The feeds that ship with the game, as `content/feeds.json` has them. */
export async function loadShippedFeeds(file: URL = SHIPPED): Promise<FeedList> {
  return FeedListSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}
