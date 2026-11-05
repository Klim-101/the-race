// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { NewsSeedsSchema } from '@the-race/engine';
import { z } from 'zod';
import { runFiles } from './run-store.js';
import { nodeSaveFs, replaceFile, type SaveFs } from './save-fs.js';

/**
 * The news a run was made from, kept in the folder of the run: the day the seeds are from (which may be an earlier
 * day than today's, when today was never extracted), the seeds, and the real names of that day's headlines, which
 * a case made from them must not contain. The shared store of seeds stays the source for new runs; this is a copy,
 * so that nothing about a run depends on a store that drops its days after a while.
 */
export const RunSeedsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seeds: NewsSeedsSchema,
  realNames: z.array(z.string().min(1).max(80)).max(2000),
});
export type RunSeeds = z.infer<typeof RunSeedsSchema>;

export const RUN_SEEDS_FILE = 'seeds.json';

export const runSeedsFile = (saveDir: string, runId: string): string =>
  join(runFiles(saveDir, runId).directory, RUN_SEEDS_FILE);

/** Copies the seeds a run draws on into the folder of the run. Atomic, like the other files of a run. */
export async function saveRunSeeds(
  saveDir: string,
  runId: string,
  entry: Omit<RunSeeds, 'schemaVersion'>,
  fs: SaveFs = nodeSaveFs,
): Promise<void> {
  const copy = RunSeedsSchema.parse({ schemaVersion: 1, ...entry });
  await fs.mkdir(runFiles(saveDir, runId).directory);
  await replaceFile(fs, runSeedsFile(saveDir, runId), `${JSON.stringify(copy, null, 2)}\n`);
}

/**
 * The seeds a run keeps, or `undefined` for a run made before they were kept, a run made when no day had been
 * extracted, and a file that is damaged: the run itself does not need them to be played or read back.
 */
export async function loadRunSeeds(
  saveDir: string,
  runId: string,
  fs: SaveFs = nodeSaveFs,
): Promise<RunSeeds | undefined> {
  try {
    const text = await fs.readFile(runSeedsFile(saveDir, runId));
    if (text === undefined) return undefined;
    const parsed = RunSeedsSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
