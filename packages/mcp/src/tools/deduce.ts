// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { EntityIdSchema } from '@the-race/engine';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { TurnResultSchema, TurnSchema, playIntent } from '../play.js';

export const deduce = defineTool({
  name: 'deduce',
  description:
    'Links two or more clues the hero has found into an insight. `clueIds` are ids of found clues from ' +
    'run_view (none may be garbled: reread them first). The size of a link is public: `openLinks` of run_view ' +
    'lists how many clues each conclusion still to be made takes, and a set of any other size is refused with ' +
    '"wrong-link-size" before any time is spent, so only try sizes it lists. Takes game time, more when the link leads nowhere. ' +
    'Call it when the player connects clues, while the run is active. Pass `turn` from run_view: a stale ' +
    'one is refused with "stale-turn" and nothing changes. The `outcome.result` is "insight" (new: its text ' +
    'is in run_view), "already-known" or "nothing" (the link leads nowhere; say so without hinting how close ' +
    'it was). Do not use it to accuse and do not guess clue ids the player never found.',
  inputSchema: z.object({ turn: TurnSchema, clueIds: z.array(EntityIdSchema).min(2) }),
  outputSchema: TurnResultSchema,
  handler: ({ turn, clueIds }, context) => playIntent(context, turn, { kind: 'deduce', clueIds }),
});
