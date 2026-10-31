// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { viewRun } from '@the-race/engine';
import { BOARD_FILE, replaceFile } from '@the-race/saves';
import { z } from 'zod';
import { renderEvidenceBoard } from '../board/render-board.js';
import { defineTool } from '../define-tool.js';
import { requireRun } from '../play.js';

export const evidenceBoard = defineTool({
  name: 'evidence_board',
  description:
    'Writes the evidence board: a single HTML page the player opens in a browser, with the case, every clue ' +
    'found so far, the conclusions, the cast with where each person can be found, and the news. It holds ' +
    'exactly what run_view shows and nothing more, which is why it is written to a folder of the player ' +
    '(not the closed save directory) that any browser account can open. Call it when the player asks to see ' +
    'the evidence, the board or the notes, and offer it now and then once there are several clues. It ' +
    'changes nothing in the run and costs no time. The page is always the same file, so a tab the player ' +
    'left open shows the new state after a reload. The result carries `link`, a file:// address to give to ' +
    'the player as a clickable link, and `path`, the same page as a path to show in words. Never open, ' +
    'read or search the file yourself.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    path: z.string(),
    link: z.string(),
    clueCount: z.int(),
    insightCount: z.int(),
  }),
  handler: async (_input, context) => {
    const { run } = await requireRun(context);
    const view = viewRun(run);
    // Only places where a clue was found are named, and the hero has been to every one of them.
    const cluePlaceIds = new Set(view.clues.map(({ locationId }) => locationId));
    const placeNames = new Map(
      run.case.locations.filter(({ id }) => cluePlaceIds.has(id)).map(({ id, name }) => [id, name]),
    );
    const path = join(context.boardDir, BOARD_FILE);
    await context.saveFs.mkdir(context.boardDir);
    // Replaced whole, so a browser that reloads at that moment gets the old page or the new one, never half.
    await replaceFile(context.saveFs, path, renderEvidenceBoard(view, placeNames));
    return {
      path,
      link: pathToFileURL(path).href,
      clueCount: view.clues.length,
      insightCount: view.insights.length,
    };
  },
});
