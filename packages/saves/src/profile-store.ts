// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProfileRecordSchema, type ProfileRecord } from '@the-race/engine';
import { z } from 'zod';
import { joinFor, resolveGameFolder, type SaveDirInputs } from './game-folder.js';
import { nodeSaveFs, replaceFile, type SaveFs } from './save-fs.js';

// The profile is one local file of records, one for each run that is over (see `ProfileRecord` in the engine):
// nothing is counted in it, so nothing needs migrating when a new number is wanted. It sits in the game folder,
// beside the saves and the board, and it goes nowhere: the only ways in and out are two files the player moves
// by hand, `export.json` and `import.json`.

export const PROFILE_FILE = 'profile.json';
export const PROFILE_EXPORT_FILE = 'export.json';
export const PROFILE_IMPORT_FILE = 'import.json';

const ProfileFileSchema = z.strictObject({
  version: z.literal(1),
  records: z.array(ProfileRecordSchema),
});

/**
 * Where the profile lives: `profile/` in the game folder. `RACE_PROFILE_DIR` overrides it, and a relative one
 * is resolved like the other overrides. Pure: the environment, the platform and the home directory are passed in.
 */
export function resolveProfileDir(inputs: SaveDirInputs): string {
  const override = inputs.env.RACE_PROFILE_DIR;
  if (override !== undefined && override !== '') return resolve(override);
  return joinFor(inputs.platform, resolveGameFolder(inputs), 'profile');
}

/** The profile folder of this process: its environment, its platform and the user's home directory. */
export function defaultProfileDir(): string {
  return resolveProfileDir({ env: process.env, platform: process.platform, homedir: homedir() });
}

export type LoadProfileResult =
  | { readonly ok: true; readonly records: readonly ProfileRecord[] }
  | { readonly ok: false; readonly reason: 'corrupt' | 'unreadable' };

type ReadResult =
  | { readonly ok: true; readonly records: readonly ProfileRecord[] }
  | { readonly ok: false; readonly reason: 'missing' | 'corrupt' | 'unreadable' };

async function readRecords(fs: SaveFs, path: string): Promise<ReadResult> {
  let text: string | undefined;
  try {
    text = await fs.readFile(path);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (text === undefined) return { ok: false, reason: 'missing' };
  try {
    const parsed = ProfileFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? { ok: true, records: parsed.data.records } : { ok: false, reason: 'corrupt' };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}

/**
 * The records of the profile, oldest first. A missing file is a profile with no runs. It never throws, and a file
 * it cannot use comes back as `ok: false` and is never replaced by an empty one.
 */
export async function loadProfile(profileDir: string, fs: SaveFs = nodeSaveFs): Promise<LoadProfileResult> {
  const read = await readRecords(fs, join(profileDir, PROFILE_FILE));
  if (read.ok) return read;
  return read.reason === 'missing' ? { ok: true, records: [] } : { ok: false, reason: read.reason };
}

async function writeRecords(
  profileDir: string,
  fs: SaveFs,
  file: string,
  records: readonly ProfileRecord[],
): Promise<void> {
  await fs.mkdir(profileDir);
  const data = `${JSON.stringify({ version: 1, records }, null, 2)}\n`;
  await replaceFile(fs, join(profileDir, file), data);
}

/** Adds the record of a run that is over, or replaces the one the same run made before. */
export async function recordRun(
  profileDir: string,
  record: ProfileRecord,
  fs: SaveFs = nodeSaveFs,
): Promise<void> {
  const loaded = await loadProfile(profileDir, fs);
  if (!loaded.ok) throw new RangeError(`The profile on disk is unusable (${loaded.reason}).`);
  const known = loaded.records.some(({ runId }) => runId === record.runId);
  const records = known
    ? loaded.records.map((own) => (own.runId === record.runId ? record : own))
    : [...loaded.records, record];
  await writeRecords(profileDir, fs, PROFILE_FILE, records);
}

/** Writes the profile as `export.json` in its folder, for the player to carry away; returns the path. */
export async function exportProfile(profileDir: string, fs: SaveFs = nodeSaveFs): Promise<string> {
  const loaded = await loadProfile(profileDir, fs);
  if (!loaded.ok) throw new RangeError(`The profile on disk is unusable (${loaded.reason}).`);
  await writeRecords(profileDir, fs, PROFILE_EXPORT_FILE, loaded.records);
  return join(profileDir, PROFILE_EXPORT_FILE);
}

export type ImportProfileResult =
  | { readonly ok: true; readonly added: number; readonly skipped: number }
  | { readonly ok: false; readonly reason: 'no-file' | 'invalid' | 'profile-unusable' };

/**
 * Takes the records of `import.json` that the profile does not have yet. A run already in the profile is
 * skipped, and so importing the same file twice adds nothing; a file that is not a profile adds nothing at all.
 */
export async function importProfile(
  profileDir: string,
  fs: SaveFs = nodeSaveFs,
): Promise<ImportProfileResult> {
  const own = await loadProfile(profileDir, fs);
  if (!own.ok) return { ok: false, reason: 'profile-unusable' };
  const incoming = await readRecords(fs, join(profileDir, PROFILE_IMPORT_FILE));
  if (!incoming.ok) return { ok: false, reason: incoming.reason === 'corrupt' ? 'invalid' : 'no-file' };
  const known = new Set(own.records.map(({ runId }) => runId));
  const fresh = incoming.records.filter(({ runId }) => {
    if (known.has(runId)) return false;
    known.add(runId);
    return true;
  });
  if (fresh.length > 0) await writeRecords(profileDir, fs, PROFILE_FILE, [...own.records, ...fresh]);
  return { ok: true, added: fresh.length, skipped: incoming.records.length - fresh.length };
}
