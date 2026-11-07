// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import {
  EntityIdSchema,
  GearIdSchema,
  RereadIntentSchema,
  TakeIntentSchema,
  UseIntentSchema,
} from '@the-race/engine';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { TurnResultSchema, TurnSchema, playIntent } from '../play.js';

/** The intents `act` carries; talking, deducing and accusing have tools of their own. */
const ActIntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('look') }),
  z.object({ kind: z.literal('move'), locationId: EntityIdSchema }),
  z.object({
    kind: z.literal('search'),
    partId: EntityIdSchema.optional(),
    toolId: GearIdSchema.optional(),
  }),
  z.object({ kind: z.literal('rest') }),
  z.object({ kind: z.literal('sit') }),
  z.object({
    kind: z.literal('ask'),
    toolId: GearIdSchema.optional(),
    witnessId: EntityIdSchema.optional(),
    aboutSuspectId: EntityIdSchema.optional(),
  }),
  z.object({ kind: z.literal('study'), clueId: EntityIdSchema, toolId: GearIdSchema.optional() }),
  UseIntentSchema,
  TakeIntentSchema,
  RereadIntentSchema,
]);

export const act = defineTool({
  name: 'act',
  description:
    'Carries out one action of the hero in the world: look (a quick glance round the place: it shows its parts and what lies in plain sight), move ' +
    '(`locationId` of a neighbouring place from run_view exits), search (a thorough search: of the whole place, or, in a place whose `location.parts` run_view lists, of one part, with its `partId`, and against the obstacle of a part with a `toolId` from the kit, or the best fit when it is left out), ' +
    'rest (sleep through the night), ask (ask the locals for a rumour about a place, a contacts roll, which cash from the kit eases; `toolId` names it; or, with `witnessId` of a person run_view lists under `witnesses`, ask that person what they saw, and with `aboutSuspectId` only about that one suspect), study (study a clue the hero holds, `clueId` as run_view gave it, with the best tool of the kit or the `toolId` named, for a lead), sit (sit down for a while at a venue, a teahouse or a cafe, to win back a point of nerves), use (`itemId` of a supply in the kit), take (`stockId` of something run_view lists under `location.offers`: a tool for the suitcase, with `dropId` of a tool of the suitcase to put down when it is full, or a supply for the pockets) or reread (`clueId` of a found ' +
    'clue that run_view marks garbled). Call it once per player action, only while the run is active, with ' +
    'ids exactly as run_view gave them. Pass `turn` from run_view: a stale one is refused with "stale-turn" ' +
    'and nothing changes, so repeating a call that already worked is harmless. The result is `outcome` ' +
    '(what the engine decided: tell it faithfully, see the outcomes reference) and `view`, a short summary ' +
    'of the run after the turn. The clues and conclusions the turn gave are in `clues` and `insights` with their texts, so a turn needs no run_view to be told. A refusal (a locked door, an unknown id) ' +
    'changes nothing and costs no time. Do not use it to talk to a suspect (question), link clues (deduce) ' +
    'or accuse (accuse).',
  inputSchema: z.object({ turn: TurnSchema, intent: ActIntentSchema }),
  outputSchema: TurnResultSchema,
  handler: ({ turn, intent }, context) => playIntent(context, turn, intent),
});
