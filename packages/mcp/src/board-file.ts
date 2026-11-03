// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { dirname } from 'node:path';
import { viewDayStrip, viewRun, viewTurns, type DetectiveRunState, type RunLog } from '@the-race/engine';
import { replaceFile, runBoardFile } from '@the-race/saves';
import { renderEvidenceBoard } from './board/render-board.js';
import type { ServerContext } from './context.js';

/**
 * Writes the evidence board of a run to its file, always the same one. It is replaced whole, so a browser that
 * reloads at that moment gets the old page or the new one, never half. Given the run as it stood before the last
 * turn, the page marks what that turn changed. Throws when the folder cannot be written.
 */
export async function writeBoard(
  context: ServerContext,
  runId: string,
  run: DetectiveRunState,
  log: RunLog,
  before?: DetectiveRunState,
): Promise<string> {
  const path = runBoardFile(context.saveDir, runId);
  await context.saveFs.mkdir(dirname(path));
  await replaceFile(
    context.saveFs,
    path,
    renderEvidenceBoard(
      viewRun(run),
      viewTurns(run, log, log.length),
      before === undefined ? undefined : viewRun(before),
      viewDayStrip(run, log),
    ),
  );
  return path;
}

/**
 * Writes the board of a run unless the file already shows its current turn. A page written after a turn carries
 * the marks of what that turn changed; writing it again from the run alone would wipe them.
 */
export async function ensureBoard(
  context: ServerContext,
  runId: string,
  run: DetectiveRunState,
  log: RunLog,
): Promise<string> {
  const path = runBoardFile(context.saveDir, runId);
  const page = await context.saveFs.readFile(path);
  if (page?.includes(`<meta name="turn" content="${String(run.turn)}">`) === true) return path;
  return writeBoard(context, runId, run, log);
}

/**
 * Keeps the board current after a turn. The board is a convenience, so a failure to write it (a full disk, a
 * folder that cannot be made) never costs the player the turn: the next turn writes it again.
 */
export async function keepBoard(
  context: ServerContext,
  runId: string,
  run: DetectiveRunState,
  log: RunLog,
  before: DetectiveRunState,
): Promise<void> {
  try {
    await writeBoard(context, runId, run, log, before);
  } catch {
    // See above: nothing to do and nothing to tell.
  }
}
