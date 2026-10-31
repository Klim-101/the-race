// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { FeedList, HttpGet } from '@the-race/news';
import type { SaveFs } from '@the-race/saves';

/**
 * Everything a tool may touch, passed in. A tool reaches for no global: not the disk, not the clock, not
 * the network, not `Math.random`, so a test can give it a fake of each.
 */
export interface ServerContext {
  /** The directory the saves live in (see `resolveSaveDir`). */
  readonly saveDir: string;
  readonly saveFs: SaveFs;
  /** A fresh seed for a new run. Randomness enters the game here and only here. */
  readonly newSeed: () => string;
  /** Today as `YYYY-MM-DD`. The clock enters the game here and only here. */
  readonly today: () => string;
  /** The one way to the network: an https GET with a timeout and a size cap. Only the news uses it. */
  readonly httpGet: HttpGet;
  /** The feeds the news is read from. */
  readonly feeds: () => Promise<FeedList>;
  /** How many days behind the news a run is set: 0 is today's, more is the cautious mode. */
  readonly newsLagDays: number;
}
