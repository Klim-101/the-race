// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { EntityIdSchema, InterrogationApproachSchema } from '@the-race/engine';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { TurnResultSchema, TurnSchema, playIntent } from '../play.js';

export const question = defineTool({
  name: 'question',
  description:
    "Questions a suspect who is in the hero's current place. `suspectId` is from the suspects of run_view; " +
    '`approach` is "pressure" (lean on them) or "social" (win them over); `clueIds` are found clues the hero ' +
    'shows them, which may break a lie, or none for a plain talk. Takes game time and may cost reputation. ' +
    'Call it once per conversation, while the run is active. Pass `turn` from run_view: a stale one is ' +
    'refused with "stale-turn" and nothing changes. The result `outcome` says whether the hero got through, ' +
    "the suspect's `alibi` to voice, the `effect` of each shown clue (it does not say which clues were beside " +
    'the point), the lies that fell and a slipped `secret`; never imply the suspect holds anything you were ' +
    'not told. Do not use it to move, search or link clues.',
  inputSchema: z.object({
    turn: TurnSchema,
    suspectId: EntityIdSchema,
    approach: InterrogationApproachSchema,
    clueIds: z.array(EntityIdSchema).max(20).default([]),
  }),
  outputSchema: TurnResultSchema,
  handler: ({ turn, ...rest }, context) => playIntent(context, turn, { kind: 'interrogate', ...rest }),
});
