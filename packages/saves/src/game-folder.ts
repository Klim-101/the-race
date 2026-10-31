// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { homedir } from 'node:os';
import { posix, resolve, win32 } from 'node:path';

export interface SaveDirInputs {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly homedir: string;
}

export const APP_DIR = 'the-race';

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/;

/**
 * The folder that holds everything the game writes: the saves in `saves/` and the evidence board in `board/`.
 * The plugin asks the player for it at the first start and hands the answer to the server as
 * `RACE_GAME_FOLDER` (a hook reads the same answer as `CLAUDE_PLUGIN_OPTION_GAME_FOLDER`, so both names count).
 * Without an answer it is `C:\the-race` on Windows, and `the-race` in the home directory elsewhere. A folder
 * of the player's own choosing is better than one in a profile: an account name with `$`, a redirected
 * Documents folder or another browser account made the board unreachable. Pure: the environment, the
 * platform and the home directory are passed in.
 */
export function resolveGameFolder(inputs: SaveDirInputs): string {
  const { env, platform, homedir: home } = inputs;
  const server = env.RACE_GAME_FOLDER;
  const chosen = server !== undefined && server !== '' ? server : env.CLAUDE_PLUGIN_OPTION_GAME_FOLDER;
  // The plugin's own default is a Windows path; on another system it is no place, so the usual folder wins.
  const usable =
    chosen !== undefined && chosen !== '' && (platform === 'win32' || !WINDOWS_DRIVE_PATH.test(chosen));
  if (usable) return resolve(chosen);
  return platform === 'win32' ? win32.join('C:\\', APP_DIR) : posix.join(home, APP_DIR);
}

/** The game folder of this process: its environment, its platform and the user's home directory. */
export function defaultGameFolder(): string {
  return resolveGameFolder({ env: process.env, platform: process.platform, homedir: homedir() });
}

export function joinFor(platform: NodeJS.Platform, ...parts: string[]): string {
  return (platform === 'win32' ? win32 : posix).join(...parts);
}
