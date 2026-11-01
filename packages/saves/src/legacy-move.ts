// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { homedir } from 'node:os';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { legacySaveDir, resolveSaveDir, type SaveDirInputs } from './save-dir.js';

// The game folder is meant to hold everything the game writes. A player who started before it existed keeps their
// saves, the mirror-world dictionary and the day's seeds in the old per-user state folder. This moves them, once:
// the old folder is copied whole into a temporary one next to the new one, every file is checked against its copy,
// the copy is renamed into place, and only then is the old folder removed. Whatever goes wrong, the old folder is
// the one thing never touched, and it keeps being used.

/** The disk operations the move needs, behind an interface so that a test can make any one of them fail. */
export interface MoveFs {
  exists(path: string): Promise<boolean>;
  /** Every file under the directory, as paths relative to it. */
  listFiles(directory: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  /** Writes the file, making its directories first. */
  writeFile(path: string, data: string): Promise<void>;
  /** Makes the directory, and its parents. */
  mkdir(directory: string): Promise<void>;
  /** Renames a directory to a name that does not exist. */
  rename(from: string, to: string): Promise<void>;
  /** Removes the directory and all it holds; a directory that is not there is not an error. */
  removeDirectory(directory: string): Promise<void>;
}

async function listAll(directory: string, base: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listAll(path, base) : [relative(base, path)];
    }),
  );
  return nested.flat();
}

export const nodeMoveFs: MoveFs = {
  async exists(path) {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  },
  listFiles: (directory) => listAll(directory, directory),
  readFile: (path) => readFile(path, 'utf8'),
  async writeFile(path, data) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, 'utf8');
  },
  async mkdir(directory) {
    await mkdir(directory, { recursive: true });
  },
  rename: (from, to) => rename(from, to),
  removeDirectory: (directory) => rm(directory, { recursive: true, force: true }),
};

export type LegacyMove =
  /** Nothing to do: the saves are already where they belong, or there are none, or the player chose a place. */
  | { readonly status: 'none' }
  /** Moved: the old folder is gone and the saves are at `to`. */
  | { readonly status: 'moved'; readonly from: string; readonly to: string; readonly files: number }
  /** The saves are at the new place and a leftover of the old folder was removed, as it held the same files. */
  | { readonly status: 'cleaned'; readonly from: string; readonly to: string }
  /** Something went wrong; the old folder is untouched and is still used, and the next start tries again. */
  | { readonly status: 'failed'; readonly from: string; readonly reason: string };

/** Whether the two directories hold the same files with the same contents. */
async function sameContent(fs: MoveFs, a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([fs.listFiles(a), fs.listFiles(b)]);
  if (left.length !== right.length || left.some((file) => !right.includes(file))) return false;
  for (const file of left) {
    const [one, other] = await Promise.all([fs.readFile(join(a, file)), fs.readFile(join(b, file))]);
    if (one !== other) return false;
  }
  return true;
}

/**
 * Moves the saves of the old state folder into `saves/` of the game folder, once. `RACE_HOME` (the player named
 * the save directory themselves) is left alone. Pure but for the disk it is given.
 */
export async function moveLegacySaves(inputs: SaveDirInputs, fs: MoveFs = nodeMoveFs): Promise<LegacyMove> {
  if (inputs.env.RACE_HOME) return { status: 'none' };
  const target = resolveSaveDir(inputs);
  const legacy = legacySaveDir(inputs);
  try {
    if (!(await fs.exists(legacy))) return { status: 'none' };
    const files = await fs.listFiles(legacy);
    if (files.length === 0) return { status: 'none' };

    if (await fs.exists(target)) {
      // An earlier move that stopped before it removed the old folder: remove it only if it is the same.
      if (!(await sameContent(fs, legacy, target))) return { status: 'none' };
      await fs.removeDirectory(legacy);
      return { status: 'cleaned', from: legacy, to: target };
    }

    const staging = `${target}.moving`;
    await fs.removeDirectory(staging);
    try {
      for (const file of files)
        await fs.writeFile(join(staging, file), await fs.readFile(join(legacy, file)));
      if (!(await sameContent(fs, legacy, staging)))
        throw new RangeError('The copy does not match the original.');
      await fs.mkdir(dirname(target));
      await fs.rename(staging, target);
    } catch (error) {
      await fs.removeDirectory(staging).catch(() => undefined);
      throw error;
    }
    // The saves are safe at their new place; a leftover that cannot be removed now is closed to the narrator as
    // the old folder always was, and is not a reason to say the move failed.
    await fs.removeDirectory(legacy).catch(() => undefined);
    return { status: 'moved', from: legacy, to: target, files: files.length };
  } catch (error) {
    return { status: 'failed', from: legacy, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** The move for this process: its environment, its platform and the user's home directory. */
export function moveDefaultLegacySaves(): Promise<LegacyMove> {
  return moveLegacySaves({ env: process.env, platform: process.platform, homedir: homedir() });
}
