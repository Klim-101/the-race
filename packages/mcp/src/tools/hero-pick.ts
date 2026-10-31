// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { CANDIDATE_IDS, candidateHeroInput, createRng, offeredHero } from '@the-race/engine';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { requirePending, storeHero } from '../hero-assembly.js';

export const heroPick = defineTool({
  name: 'hero_pick',
  description:
    'Takes one of the three heroes the tavern put forward (hero_offer) as the hero of the run: `choiceId` is ' +
    'their id, "a", "b" or "c", and `name` an optional name of the player\'s own instead of the one on the ' +
    "card. The engine rolls the hero's hidden traits itself; you cannot choose or see them. The result is the " +
    'hero and `hiddenTraitCount`, the number of traits the player does not know yet: never guess what they ' +
    'are. Safe to repeat: the same seed and the same pick always give the same hero, and the player may pick ' +
    'again until the case has been set up. After it, run the case generator. Do not call it before hero_offer ' +
    'or when a run is in progress ("no-pending-run").',
  inputSchema: z.object({
    choiceId: z.enum(CANDIDATE_IDS),
    name: z.string().trim().min(1).max(60).optional().describe("A name instead of the card's."),
  }),
  outputSchema: z.object({
    status: z.literal('awaiting-case'),
    hero: z.looseObject({ name: z.string() }),
    hiddenTraitCount: z.int(),
  }),
  handler: async ({ choiceId, name }, context) => {
    const pending = await requirePending(context);
    const candidate = offeredHero(pending.seed, pending.offerRound, pending.locale, choiceId);
    // Dice of the pick itself, so each hero of the offer hides something of their own.
    const rng = createRng(`${pending.seed}:hero:${String(pending.offerRound)}:${choiceId}`);
    return storeHero(context, pending, candidateHeroInput(candidate, name), rng);
  },
});
