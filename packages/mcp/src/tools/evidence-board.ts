// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { viewRun } from '@the-race/engine';
import { z } from 'zod';
import { renderEvidenceBoard } from '../board/render-board.js';
import { defineTool } from '../define-tool.js';
import { requireRun } from '../play.js';

export const evidenceBoard = defineTool({
  name: 'evidence_board',
  description:
    'Writes the evidence board: a single HTML page the player opens in a browser, with the case, every clue ' +
    'found so far, the conclusions, the cast with where each person can be found, and the news. It holds ' +
    'exactly what run_view shows and nothing more. Call it when the player asks to see the evidence, the ' +
    'board or the notes, and offer it now and then once there are several clues. It changes nothing in the ' +
    'run and costs no time. The result is the `path` of the page: give it to the player as a link they can ' +
    'open. Never open, read or search the file yourself.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    path: z.string(),
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
    const directory = join(context.saveDir, 'board');
    const path = join(directory, 'evidence.html');
    await context.saveFs.mkdir(directory);
    await context.saveFs.writeFileSynced(path, renderEvidenceBoard(view, placeNames));
    return { path, clueCount: view.clues.length, insightCount: view.insights.length };
  },
});
