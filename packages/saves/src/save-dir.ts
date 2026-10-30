// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { homedir } from 'node:os';
import { posix, resolve, win32 } from 'node:path';

export interface SaveDirInputs {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly homedir: string;
}

const APP_DIR = 'the-race';

/**
 * Where saves live: the player's own state directory, never the working directory. The save holds the sealed
 * truth as plain JSON, so it must not sit next to the project the narrator reads. Pure: the environment, the
 * platform and the home directory are passed in.
 */
export function resolveSaveDir(inputs: SaveDirInputs): string {
  const { env, platform, homedir: home } = inputs;
  const override = env.RACE_HOME;
  if (override !== undefined && override !== '') return resolve(override);

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

/** The save directory of this process: its environment, its platform and the user's home directory. */
export function defaultSaveDir(): string {
  return resolveSaveDir({ env: process.env, platform: process.platform, homedir: homedir() });
}
