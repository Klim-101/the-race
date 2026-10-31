// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { posix, resolve, win32 } from 'node:path';
import { APP_DIR, joinFor, resolveGameFolder, type SaveDirInputs } from './game-folder.js';

export type { SaveDirInputs } from './game-folder.js';

/**
 * Where saves live: `saves/` in the game folder, never the working directory. The save holds the sealed truth
 * as plain JSON, so it must not sit next to the project the narrator reads. `RACE_HOME` names the save
 * directory itself and wins. Pure: the environment, the platform and the home directory are passed in.
 */
export function resolveSaveDir(inputs: SaveDirInputs): string {
  const override = inputs.env.RACE_HOME;
  if (override !== undefined && override !== '') return resolve(override);
  return joinFor(inputs.platform, resolveGameFolder(inputs), 'saves');
}

/**
 * Where saves lived before the game had a folder of its own: the platform's per-user state directory. Kept so
 * that a run saved there is found and the spoiler guard keeps it closed.
 */
export function legacySaveDir(inputs: SaveDirInputs): string {
  const { env, platform, homedir: home } = inputs;
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA;
    const base = local !== undefined && local !== '' ? local : win32.join(home, 'AppData', 'Local');
    return win32.join(base, APP_DIR);
  }
  if (platform === 'darwin') return posix.join(home, 'Library', 'Application Support', APP_DIR);

  // The XDG spec says a relative path is invalid and must be ignored.
  const state = env.XDG_STATE_HOME;
  const base = state !== undefined && posix.isAbsolute(state) ? state : posix.join(home, '.local', 'state');
  return posix.join(base, APP_DIR);
}

/**
 * The directory the server really uses: the one `resolveSaveDir` names, unless that one is not there yet and
 * the legacy one is, in which case the player's earlier saves (and the mirror world they hold) are kept.
 */
export function chooseSaveDir(inputs: SaveDirInputs, exists: (path: string) => boolean): string {
  const current = resolveSaveDir(inputs);
  if (inputs.env.RACE_HOME) return current;
  const legacy = legacySaveDir(inputs);
  return !exists(current) && exists(legacy) ? legacy : current;
}

/** The save directory of this process: its environment, its platform and the user's home directory. */
export function defaultSaveDir(): string {
  return chooseSaveDir({ env: process.env, platform: process.platform, homedir: homedir() }, existsSync);
}
