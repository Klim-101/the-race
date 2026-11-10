// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { pathToFileURL } from 'node:url';
import { StoryInputSchema, checkStory, storyOf, worldRealNames } from '@the-race/engine';
import { runBoardFile, saveStory } from '@the-race/saves';
import { z } from 'zod';
import { writeBoard } from '../board-file.js';
import { defineTool } from '../define-tool.js';
import { seedsOfRun } from '../news.js';
import { requireRun } from '../play.js';
import { ToolFailure } from '../tool-error.js';
import { requireWorld } from '../world.js';

export const runStory = defineTool({
  name: 'run_story',
  description:
    'Keeps the story of a finished run, for the player to read on the evidence board in a tab of its own (the ' +
    '"Story" tab). Call it once, after the closing scene, on a run that has ended in any way; on a run still on ' +
    'it is refused with "run-active". The story is a short detective tale of the case as it went, in the ' +
    'language of the run: a `title` and 3 to 12 `paragraphs` of plain text (no markup), told from what the ' +
    'outcome and the view of the run hold and nothing else. It is checked like any text of a case: the ' +
    'language of the run, and no name from the real world; a rejected story names the paragraph to fix. ' +
    'Calling it again replaces the story. It changes nothing in the run. The result says whether the board ' +
    'was rewritten, and carries its `link` when it was.',
  inputSchema: StoryInputSchema,
  outputSchema: z.object({
    kept: z.literal(true),
    /** The board with the story in it, when it could be written: a path to say and a `file://` link to give. */
    board: z.object({ path: z.string(), link: z.string() }).optional(),
  }),
  handler: async (input, context) => {
    const { runId, run, log } = await requireRun(context);
    if (run.status === 'active') {
      throw new ToolFailure({
        code: 'run-active',
        message: 'The run is not over, so it has no story yet.',
        remediation: 'Tell the story only after the run has ended, with the closing scene.',
      });
    }
    const world = await requireWorld(context);
    const realNames = [
      ...new Set([...worldRealNames(world), ...((await seedsOfRun(context))?.realNames ?? [])]),
    ];
    const issues = checkStory(input, run.locale, realNames);
    if (issues.length > 0) {
      throw new ToolFailure({
        code: 'story-rejected',
        message: issues.map(({ path, message }) => `${path}: ${message}`).join(' '),
        remediation: 'Fix those parts of the story and call run_story again with the whole of it.',
      });
    }
    await saveStory(context.saveDir, storyOf(input, runId, run.locale), context.saveFs);
    // The board is a convenience: a folder that cannot be written costs the player the tab, never the story.
    try {
      await writeBoard(context, runId, run, log);
    } catch {
      return { kept: true as const };
    }
    const path = runBoardFile(context.saveDir, runId);
    return { kept: true as const, board: { path, link: pathToFileURL(path).href } };
  },
});
