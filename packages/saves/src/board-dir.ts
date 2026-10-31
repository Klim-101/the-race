// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { joinFor, resolveGameFolder, type SaveDirInputs } from './game-folder.js';

/** The page itself: one fixed name, so a tab the player left open follows the run instead of multiplying. */
export const BOARD_FILE = 'evidence.html';

/**
 * Where the evidence board is written: `board/` in the game folder, which the player chose and can open from
 * their own file manager and browser. It is a sibling of `saves/`, which is closed to the narrator; the board
 * holds what `run_view` shows and nothing more. `RACE_BOARD_DIR` overrides it, and a relative one is resolved
 * like `RACE_HOME`. Pure: the environment, the platform and the home directory are passed in.
 */
export function resolveBoardDir(inputs: SaveDirInputs): string {
  const override = inputs.env.RACE_BOARD_DIR;
  if (override !== undefined && override !== '') return resolve(override);
  return joinFor(inputs.platform, resolveGameFolder(inputs), 'board');
}

/** The board folder of this process: its environment, its platform and the user's home directory. */
export function defaultBoardDir(): string {
  return resolveBoardDir({ env: process.env, platform: process.platform, homedir: homedir() });
}
