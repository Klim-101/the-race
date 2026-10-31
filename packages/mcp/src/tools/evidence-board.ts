// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { viewRun, viewTurns } from '@the-race/engine';
import { BOARD_FILE, replaceFile } from '@the-race/saves';
import { z } from 'zod';
import { renderEvidenceBoard } from '../board/render-board.js';
import { defineTool } from '../define-tool.js';
import { requireRun } from '../play.js';

export const evidenceBoard = defineTool({
  name: 'evidence_board',
  description:
    'Writes the evidence board: a single HTML page the player opens in a browser, in five tabs: the map of ' +
    'the places the detective knows with the news of the world, the suspects with what each has said, the ' +
    'clues with the links between them and the conclusions, a chronicle (the time left, what the world has ' +
    'done, what is still open and the last turns the player took) and the hero with their condition, kit ' +
    'and the climate of the country. It holds exactly what the player may know and nothing more, which is why it is written to a folder of the player ' +
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
    const { run, log } = await requireRun(context);
    const view = viewRun(run);
    const path = join(context.boardDir, BOARD_FILE);
    await context.saveFs.mkdir(context.boardDir);
    // Replaced whole, so a browser that reloads at that moment gets the old page or the new one, never half.
    await replaceFile(context.saveFs, path, renderEvidenceBoard(view, viewTurns(run, log)));
    return {
      path,
      link: pathToFileURL(path).href,
      clueCount: view.clues.length,
      insightCount: view.insights.length,
    };
  },
});
