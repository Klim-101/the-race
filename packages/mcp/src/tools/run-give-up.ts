// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { deriveStats, endRun } from '@the-race/engine';
import { saveRun } from '@the-race/saves';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { RunSummarySchema, TurnSchema, assertFreshTurn, requireRun, summarizeRun } from '../play.js';
import { keepProfile } from '../profile.js';
import { ToolFailure } from '../tool-error.js';

export const runGiveUp = defineTool({
  name: 'run_give_up',
  description:
    'Ends the run because the player gives up. It cannot be undone: ask the player to confirm first, and ' +
    'call it only when they clearly want to stop, never to dodge a bad outcome you dislike. Pass `turn` from ' +
    'run_view: a stale one is refused with "stale-turn". Calling it again on a run that has just been given ' +
    'up returns the end view again, so a retry is harmless; on a run that ended another way it is refused with ' +
    '"run-over". The result is the end `view` and a few numbers of the run (turns, minutes, clues found, ' +
    'insights). It does not reveal the truth: close with a brief, gentle epilogue and offer a new run.',
  inputSchema: z.object({ turn: TurnSchema }),
  outputSchema: z.object({
    view: RunSummarySchema,
    stats: z.object({ turns: z.int(), minutes: z.int(), cluesFound: z.int(), insights: z.int() }),
  }),
  handler: async ({ turn }, context) => {
    const { run, log } = await requireRun(context);
    assertFreshTurn(run, turn);
    if (run.status !== 'active' && run.status !== 'gave-up') {
      throw new ToolFailure({
        code: 'run-over',
        message: `The run is already over (${run.status}).`,
        remediation: 'Call run_view for the end of the run and offer the player a new one.',
      });
    }
    // Giving up is not a turn, so the log cannot replay to the ended state; the run is saved without it.
    const ended = run.status === 'active' ? endRun(run, 'gave-up', 'gave-up') : run;
    if (ended !== run) await saveRun(context.saveDir, ended, context.saveFs);
    await keepProfile(context, ended, log);
    const { turns, minutes, cluesFound, insights } = deriveStats(log);
    return { view: summarizeRun(ended), stats: { turns, minutes, cluesFound, insights } };
  },
});
