// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import {
  EMPTY_WORLD,
  RunMigrationError,
  WORLD_MIGRATIONS,
  WORLD_SCHEMA_VERSION,
  WorldSchema,
  canonicalJson,
  migrateRun,
  type RunMigrationRegistry,
  type World,
} from '@the-race/engine';
import { nodeSaveFs, replaceFile, type SaveFs } from './save-fs.js';

/** The dictionary of the mirror world: one file for every run, beside the runs and not inside one. */
export const worldFile = (saveDir: string): string => join(saveDir, 'world.json');

export const WORLD_LOAD_FAILURE_REASONS = ['corrupt', 'unsupported-version', 'unreadable'] as const;
export type WorldLoadFailureReason = (typeof WORLD_LOAD_FAILURE_REASONS)[number];

export type LoadWorldResult =
  | { readonly ok: true; readonly world: World }
  | { readonly ok: false; readonly reason: WorldLoadFailureReason; readonly detail: string };

/**
 * Loads the dictionary. A missing file is a world nothing has been added to yet, not a problem. It never
 * throws: a file it cannot use comes back as `ok: false`, and is never replaced by an empty world, since the
 * names in it are promised to stay the same.
 */
export async function loadWorld(
  saveDir: string,
  fs: SaveFs = nodeSaveFs,
  migrations: RunMigrationRegistry = WORLD_MIGRATIONS,
): Promise<LoadWorldResult> {
  let text: string | undefined;
  try {
    text = await fs.readFile(worldFile(saveDir));
  } catch {
    return { ok: false, reason: 'unreadable', detail: 'The dictionary could not be read from the disk.' };
  }
  if (text === undefined) return { ok: true, world: EMPTY_WORLD };

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt', detail: 'The dictionary is not valid JSON.' };
  }
  try {
    data = migrateRun(data, migrations, WORLD_SCHEMA_VERSION);
  } catch (error) {
    const failure = error as RunMigrationError;
    const unsupported = failure.code === 'future-version' || failure.code === 'no-migration-path';
    return { ok: false, reason: unsupported ? 'unsupported-version' : 'corrupt', detail: failure.message };
  }
  const parsed = WorldSchema.safeParse(data);
  return parsed.success
    ? { ok: true, world: parsed.data }
    : { ok: false, reason: 'corrupt', detail: 'The dictionary does not match its schema.' };
}

/**
 * Saves the dictionary, atomically. It only ever grows: a world that drops or changes an entry the file
 * already holds is refused, so a name once given never changes, whoever asks.
 */
export async function saveWorld(saveDir: string, world: World, fs: SaveFs = nodeSaveFs): Promise<void> {
  const checked = WorldSchema.parse(world);
  const existing = await loadWorld(saveDir, fs);
  if (!existing.ok) throw new RangeError(`The dictionary on disk is unusable: ${existing.detail}`);
  const kept = existing.world.entries;
  const changed = kept.some((entry, index) => {
    const next = checked.entries[index];
    return next === undefined || canonicalJson(entry) !== canonicalJson(next);
  });
  if (changed) {
    throw new RangeError('The dictionary on disk holds entries the new one does not keep as they are.');
  }
  await fs.mkdir(saveDir);
  await replaceFile(fs, worldFile(saveDir), `${JSON.stringify(checked, null, 2)}\n`);
}
