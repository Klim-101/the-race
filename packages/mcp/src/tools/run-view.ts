// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { viewHero, viewRun } from '@the-race/engine';
import { loadRun } from '@the-race/saves';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { defineTool } from '../define-tool.js';
import { loadPending } from '../pending-run.js';
import { saveUnusable } from '../play.js';
import { takeNotices } from '../startup-notice.js';

/** Where things stand, as far as the player may know: the run's public view, a pending run's state, or none. */
async function stateOf(context: ServerContext) {
  const loaded = await loadRun(context.saveDir, context.saveFs);
  // An active run wins over a pending one: a pending file left behind by a crash must not hide it.
  if (loaded.ok && loaded.run.status === 'active') return { ...viewRun(loaded.run), endReason: null };
  const pending = await loadPending(context.saveDir, context.saveFs);
  if (pending !== undefined) {
    if (pending.hero === null) return { status: 'awaiting-hero', locale: pending.locale };
    return {
      status: 'awaiting-case',
      locale: pending.locale,
      ...viewHero({ hero: pending.hero, traits: pending.traits }),
    };
  }
  if (loaded.ok) return { ...viewRun(loaded.run), endReason: loaded.run.endReason };
  if (loaded.reason !== 'missing') throw saveUnusable(loaded.reason);
  return { status: 'no-run' };
}

export const runView = defineTool({
  name: 'run_view',
  description:
    'Shows where things stand, as far as the player may know. Changes nothing, so it is safe to call at any ' +
    'time: at the start of a session to resume, and whenever you need the state. With a run, the result is ' +
    'its public view: `status` (active, won, lost or gave-up), `endReason` once it is over, `turn` (the ' +
    'number the state-changing tools expect), the place, the clues and insights found, the suspects (name ' +
    'and persona only), the clock and the hero. It never holds the truth, the culprit or an unrevealed ' +
    'trait. With no run, `status` is "awaiting-hero" (run_new was called: ask the player to make a hero), ' +
    '"awaiting-case" (the hero exists: run the case generator) or "no-run" (offer a new run). Do not call ' +
    'it again right after a tool whose result you have not yet narrated. Once, after the saves were moved ' +
    'into the game folder, the result also has `savesMoved` (`from`, `to`): tell the player in one plain ' +
    'line, out of the fiction, that their saves now live in `to`.',
  inputSchema: z.object({}),
  outputSchema: z.looseObject({ status: z.string() }),
  handler: async (_input, context) => {
    const notices = takeNotices(context);
    return { ...(await stateOf(context)), ...notices };
  },
});
