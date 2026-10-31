// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { MAX_REROLLS, offerHeroes } from '@the-race/engine';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { requirePending } from '../hero-assembly.js';
import { savePending } from '../pending-run.js';
import { ToolFailure } from '../tool-error.js';

export const CandidateSchema = z.object({
  id: z.enum(['a', 'b', 'c']),
  name: z.string(),
  gender: z.string(),
  background: z.string(),
  lifeState: z.string().optional(),
  build: z.string(),
  skills: z.record(z.string(), z.int()),
  signalId: z.string().optional(),
});

export const heroOffer = defineTool({
  name: 'hero_offer',
  description:
    'The tavern: three heroes the player may go into the run with, each with a name, a gender, a background, ' +
    'a ready-made build of skills (`build`, named from the locale text, with its `skills`) and, for some, a ' +
    'character signal. Call it right after run_new (and after the news), present the three as characters in ' +
    "the narrator's voice, and let the player pick one with hero_pick. The same seed always gives the same " +
    'three. `reroll: true` replaces them with three others, once per run (`rerollsLeft` says how many are ' +
    'left; it is refused with "no-rerolls-left" after that) and drops a hero already picked. The hidden traits ' +
    'are rolled when a hero is picked: never guess them, and say only that every one of them hides something. ' +
    'Do not call it when a run is in progress ("no-pending-run").',
  inputSchema: z.object({
    reroll: z.boolean().default(false).describe('Ask for three other heroes; only once per run.'),
  }),
  outputSchema: z.object({
    status: z.literal('awaiting-hero'),
    round: z.int(),
    rerollsLeft: z.int(),
    candidates: z.array(CandidateSchema),
  }),
  handler: async ({ reroll }, context) => {
    const pending = await requirePending(context);
    let current = pending;
    if (reroll) {
      if (pending.offerRound >= MAX_REROLLS) {
        throw new ToolFailure({
          code: 'no-rerolls-left',
          message: 'The tavern has already put forward a second three.',
          remediation:
            'Tell the player in one line that the choice is between these heroes, and let them pick.',
        });
      }
      current = { ...pending, offerRound: pending.offerRound + 1, hero: null, traits: [] };
      await savePending(context.saveDir, current, context.saveFs);
    }
    return {
      status: 'awaiting-hero' as const,
      round: current.offerRound,
      rerollsLeft: MAX_REROLLS - current.offerRound,
      candidates: offerHeroes(current.seed, current.offerRound, current.locale).map((candidate) => ({
        ...candidate,
        skills: { ...candidate.skills },
      })),
    };
  },
});
