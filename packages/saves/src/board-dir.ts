// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { runFiles } from './run-store.js';

/** The page itself: one fixed name, so a tab the player left open follows the run instead of multiplying. */
export const BOARD_FILE = 'evidence.html';

/** The folder of a run's board, inside the folder of the run. */
export const BOARD_DIR = 'board';

/**
 * Where the evidence board of a run is written: `board/evidence.html` in the folder of the run, beside its
 * state, so that a new run has a board of its own and one folder holds everything about it. The board holds
 * what `run_view` shows and nothing more; the server writes it and the player opens it in a browser, while
 * the narrator, who is kept out of the saves, is told never to open it.
 */
export function runBoardFile(saveDir: string, runId: string): string {
  return join(runFiles(saveDir, runId).directory, BOARD_DIR, BOARD_FILE);
}
