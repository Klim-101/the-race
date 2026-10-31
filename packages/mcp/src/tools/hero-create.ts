// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import {
  BackgroundSchema,
  DetectiveSkillSchema,
  GenderSchema,
  LifeStateSchema,
  createRng,
} from '@the-race/engine';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { requirePending, storeHero } from '../hero-assembly.js';

export const heroCreate = defineTool({
  name: 'hero_create',
  description:
    "Makes the player's hero from their choices: a name, a gender, a background, optionally one character " +
    'signal, and how the skill points are spent (every skill listed, adding up to exactly the budget run_new ' +
    'reported, none above the maximum). Call it after run_new, once the player has chosen. The engine rolls ' +
    "the hero's hidden traits itself; you cannot choose or see them. The result is the hero and " +
    '`hiddenTraitCount`, the number of traits the player does not know yet: never guess what they are. An ' +
    'invalid choice is refused with "invalid-hero" and the reasons; ask the player to adjust and call again. ' +
    'Safe to repeat: the same seed and the same choices always give the same hero, and the player may change ' +
    'their mind until the case has been set up. It needs no turn number. After it, run the case generator; ' +
    'do not call it when a run is in progress ("no-pending-run").',
  inputSchema: z.object({
    name: z.string().trim().min(1).max(60),
    gender: GenderSchema,
    background: BackgroundSchema,
    lifeState: LifeStateSchema.optional().describe(
      'One of the `lifeStates` from run_new; leave out for none.',
    ),
    signalId: z.string().optional().describe('One of the signal ids from run_new; leave out for none.'),
    skills: z.record(DetectiveSkillSchema, z.int()).describe('Points per skill, for every skill.'),
  }),
  outputSchema: z.object({
    status: z.literal('awaiting-case'),
    hero: z.looseObject({ name: z.string() }),
    hiddenTraitCount: z.int(),
  }),
  handler: async (input, context) => {
    const pending = await requirePending(context);
    return storeHero(context, pending, { ...input, archetype: 'detective' }, createRng(pending.seed));
  },
});
