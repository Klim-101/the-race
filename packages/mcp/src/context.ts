// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { SaveFs } from '@the-race/saves';

/**
 * Everything a tool may touch, passed in. A tool reaches for no global: not the disk, not the clock, not
 * `Math.random`, so a test can give it a fake of each.
 */
export interface ServerContext {
  /** The directory the saves live in (see `defaultSaveDir`). */
  readonly saveDir: string;
  readonly saveFs: SaveFs;
  /** A fresh seed for a new run. Randomness enters the game here and only here. */
  readonly newSeed: () => string;
}
