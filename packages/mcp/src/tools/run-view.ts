// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { viewHero, viewRun, type DetectiveRunView } from '@the-race/engine';
import { loadCurrentRun, takeUnseenDamaged } from '@the-race/saves';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { defineTool } from '../define-tool.js';
import { loadPending } from '../pending-run.js';
import { takeNotices } from '../startup-notice.js';

/**
 * The view of a run as the narrator needs it for the moment: without the history the board draws (where each clue was
 * found, to whom it was shown, the links tried), the plan of the parts of every place visited and the events of the
 * chronicle, which `news` already says. `full` asks for all of it.
 */
function forNarrator(view: DetectiveRunView, full: boolean): Record<string, unknown> & { status: string } {
  if (full) return { ...view };
  const left = new Set(['history', 'placeParts']);
  const state = Object.fromEntries(Object.entries(view).filter(([key]) => !left.has(key)));
  const chronicle = Object.fromEntries(Object.entries(view.chronicle).filter(([key]) => key !== 'events'));
  return { ...state, status: view.status, chronicle };
}

/** Where things stand, as far as the player may know: the run's public view, a pending run's state, or none. */
async function stateOf(context: ServerContext, full: boolean) {
  const { run: loaded, damaged } = await loadCurrentRun(context.saveDir, context.saveFs);
  // An active run wins over a pending one: a pending file left behind by a crash must not hide it.
  if (loaded?.run.status === 'active') return { ...forNarrator(viewRun(loaded.run), full), endReason: null };
  const pending = await loadPending(context.saveDir, context.saveFs);
  if (pending !== undefined) {
    if (pending.hero === null) return { status: 'awaiting-hero', locale: pending.locale };
    return {
      status: 'awaiting-case',
      locale: pending.locale,
      ...viewHero({ hero: pending.hero, traits: pending.traits }),
    };
  }
  if (loaded !== undefined)
    return { ...forNarrator(viewRun(loaded.run), full), endReason: loaded.run.endReason };
  const unseen = await takeUnseenDamaged(context.saveDir, damaged, context.saveFs);
  return unseen.length === 0 ? { status: 'no-run' } : { status: 'no-run', unreadableSaves: unseen.length };
}

export const runView = defineTool({
  name: 'run_view',
  description:
    'Shows where things stand, as far as the player may know. Changes nothing, so it is safe to call at any ' +
    'time: at the start of a session to resume, and whenever you need the state. With a run, the result is ' +
    'its public view: `status` (active, won, lost or gave-up), `endReason` once it is over, `turn` (the ' +
    'number the state-changing tools expect), the place, the clues and insights found, the suspects (name ' +
    'and persona only), the clock and the hero (`toolSlots.used` counts only the pieces of the kit with `suitcase: true`; the phone and what the trade of the hero gave take no slot). It never holds the truth, the culprit or an unrevealed ' +
    'trait. With no run, `status` is "awaiting-hero" (run_new was called: ask the player to make a hero), ' +
    '"awaiting-case" (the hero exists: run the case generator) or "no-run" (offer a new run; when it has ' +
    '`unreadableSaves`, an earlier save could not be read and was left alone: say so in one plain line, it blocks nothing; a save is reported once, not at every call). Do not call ' +
    'it again right after a tool whose result you have not yet narrated. Once, after the saves were moved ' +
    'into the game folder, the result also has `savesMoved` (`from`, `to`): tell the player in one plain ' +
    'line, out of the fiction, that their saves now live in `to`. The view is the state of the moment: it leaves out the history ' +
    '(`history`: where each clue was found, to whom it was shown, the links tried), the plan of the parts of every place visited (`placeParts`) and ' +
    '`chronicle.events` (`news` says the same); the board draws them, and `full: true` returns them too, which the narrator needs rarely.',
  inputSchema: z.object({ full: z.boolean().optional() }),
  outputSchema: z.looseObject({ status: z.string() }),
  handler: async ({ full }, context) => {
    const notices = takeNotices(context);
    return { ...(await stateOf(context, full === true)), ...notices };
  },
});
