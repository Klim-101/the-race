// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { homedir } from 'node:os';
import { posix, resolve, win32 } from 'node:path';
import type { SaveDirInputs } from './save-dir.js';

const APP_DIR = 'the-race';
const DOCUMENTS = 'Documents';

/** The page itself: one fixed name, so a tab the player left open follows the run instead of multiplying. */
export const BOARD_FILE = 'evidence.html';

/**
 * Where the evidence board is written: a folder the player can open from their own file manager and browser,
 * which the save directory is not (it sits in the profile of the account the agent runs under, and is closed
 * to the narrator). The board holds what `run_view` shows and nothing more, so it can live outside the closed
 * directory. `RACE_BOARD_DIR` overrides the default, and a relative one is resolved like `RACE_HOME`. Pure:
 * the environment, the platform and the home directory are passed in.
 */
export function resolveBoardDir(inputs: SaveDirInputs): string {
  const { env, platform, homedir: home } = inputs;
  const override = env.RACE_BOARD_DIR;
  if (override !== undefined && override !== '') return resolve(override);
  const path = platform === 'win32' ? win32 : posix;
  return path.join(home, DOCUMENTS, APP_DIR);
}

/** The board folder of this process: its environment, its platform and the user's home directory. */
export function defaultBoardDir(): string {
  return resolveBoardDir({ env: process.env, platform: process.platform, homedir: homedir() });
}
