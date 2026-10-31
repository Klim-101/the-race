// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { NewsSeedsSchema, type NewsSeed } from '@the-race/engine';
import { z } from 'zod';
import { nodeSaveFs, replaceFile, type SaveFs } from './save-fs.js';

/** The days of seeds kept; a run never looks further back than a lag of a few days. */
export const SEED_DAYS_KEPT = 14;

const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SeedStoreSchema = z.strictObject({
  schemaVersion: z.literal(1),
  days: z.record(DaySchema, NewsSeedsSchema),
});

/** `day -> seeds`: the seeds of every day that was extracted, shared by all the runs of the player. */
export type SeedsByDay = Readonly<Record<string, readonly NewsSeed[]>>;

export const seedsFile = (saveDir: string): string => join(saveDir, 'seeds', 'seeds.json');

/**
 * The seeds on disk. A seed holds nothing that cannot be extracted again from the day's headlines, so a file
 * that is missing, unreadable or not what the schema says counts as no seeds, and the next extraction
 * replaces it.
 */
export async function loadSeeds(saveDir: string, fs: SaveFs = nodeSaveFs): Promise<SeedsByDay> {
  try {
    const text = await fs.readFile(seedsFile(saveDir));
    if (text === undefined) return {};
    const parsed = SeedStoreSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.days : {};
  } catch {
    return {};
  }
}

/**
 * Stores the seeds of a day beside the others and drops the oldest days beyond `SEED_DAYS_KEPT`.
 * Atomic: the file holds the old content or the whole new one.
 */
export async function saveSeedsForDay(
  saveDir: string,
  day: string,
  seeds: readonly NewsSeed[],
  fs: SaveFs = nodeSaveFs,
): Promise<void> {
  const days = { ...(await loadSeeds(saveDir, fs)), [day]: [...seeds] };
  const kept = Object.keys(days)
    .sort()
    .slice(-SEED_DAYS_KEPT)
    .map((key) => [key, days[key]] as const);
  const store = SeedStoreSchema.parse({ schemaVersion: 1, days: Object.fromEntries(kept) });
  await fs.mkdir(join(saveDir, 'seeds'));
  await replaceFile(fs, seedsFile(saveDir), `${JSON.stringify(store, null, 2)}\n`);
}

/**
 * The seeds a run draws on: those of `day`, or of the latest earlier day when that one was never extracted,
 * so that a missed day does not leave a run without news. `undefined` when there are none at all.
 */
export function seedsOnOrBefore(
  days: SeedsByDay,
  day: string,
): { readonly day: string; readonly seeds: readonly NewsSeed[] } | undefined {
  const chosen = Object.keys(days)
    .filter((key) => key <= day)
    .sort()
    .at(-1);
  const seeds = chosen === undefined ? undefined : days[chosen];
  return chosen === undefined || seeds === undefined ? undefined : { day: chosen, seeds };
}
