// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { basename, dirname, join, relative, sep } from 'node:path';
import { collectRunsStats, replaceFile, runBoardFile } from '@the-race/saves';
import type { ServerContext } from './context.js';
import { renderStatsPage } from './stats-page.js';

export const STATS_JSON = 'stats.json';
export const STATS_PAGE = 'stats.html';

/**
 * The folder the page of all the runs is written to: the root of the game folder, which is the parent of `saves/`.
 * A saves folder set by hand under another name has no game folder around it, so the page goes into it.
 */
export const statsDirOf = (saveDir: string): string =>
  basename(saveDir) === 'saves' ? dirname(saveDir) : saveDir;

/**
 * Writes `stats.json` and `stats.html` from the runs on disk. Both are replaced whole. Throws when the folder
 * cannot be written.
 */
export async function writeStats(context: ServerContext): Promise<void> {
  const directory = statsDirOf(context.saveDir);
  const stats = await collectRunsStats(context.saveDir, context.today(), context.saveFs);
  const page = renderStatsPage(stats, (runId) =>
    relative(directory, runBoardFile(context.saveDir, runId)).split(sep).join('/'),
  );
  await context.saveFs.mkdir(directory);
  await replaceFile(context.saveFs, join(directory, STATS_JSON), `${JSON.stringify(stats, null, 2)}\n`);
  await replaceFile(context.saveFs, join(directory, STATS_PAGE), page);
}

/**
 * Keeps the page of all the runs current when a run starts or ends. It is a convenience, so a failure to write it
 * (a full disk, a folder that cannot be made) never costs the player the turn: the next start or end writes it again.
 */
export async function keepStats(context: ServerContext): Promise<void> {
  try {
    await writeStats(context);
  } catch {
    // See above: nothing to do and nothing to tell.
  }
}
