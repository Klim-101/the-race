// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { EntityIdSchema, RereadIntentSchema, UseIntentSchema } from '@the-race/engine';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { TurnResultSchema, TurnSchema, playIntent } from '../play.js';

/** The intents `act` carries; talking, deducing and accusing have tools of their own. */
const ActIntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('look') }),
  z.object({ kind: z.literal('move'), locationId: EntityIdSchema }),
  z.object({ kind: z.literal('search') }),
  z.object({ kind: z.literal('rest') }),
  UseIntentSchema,
  RereadIntentSchema,
]);

export const act = defineTool({
  name: 'act',
  description:
    'Carries out one action of the hero in the world: look (a glance: what lies in plain sight), move ' +
    '(`locationId` of a neighbouring place from run_view exits), search (a thorough search of the place), ' +
    'rest (sleep through the night), use (`itemId` of a supply in the kit) or reread (`clueId` of a found ' +
    'clue that run_view marks garbled). Call it once per player action, only while the run is active, with ' +
    'ids exactly as run_view gave them. Pass `turn` from run_view: a stale one is refused with "stale-turn" ' +
    'and nothing changes, so repeating a call that already worked is harmless. The result is `outcome` ' +
    '(what the engine decided: tell it faithfully, see the outcomes reference) and `view`, a short summary ' +
    'of the run after the turn; read run_view for clue texts. A refusal (a locked door, an unknown id) ' +
    'changes nothing and costs no time. Do not use it to talk to a suspect (question), link clues (deduce) ' +
    'or accuse (accuse).',
  inputSchema: z.object({ turn: TurnSchema, intent: ActIntentSchema }),
  outputSchema: TurnResultSchema,
  handler: ({ turn, intent }, context) => playIntent(context, turn, intent),
});
