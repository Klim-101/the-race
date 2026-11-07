// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { EntityIdSchema } from '@the-race/engine';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { TurnResultSchema, TurnSchema, playIntent } from '../play.js';

export const accuse = defineTool({
  name: 'accuse',
  description:
    'The final accusation, and it ends the run for good: it cannot be undone. `culpritId` is a suspect from ' +
    'run_view, `motiveInsightId` the id of an insight the hero has made as the motive (or null for none) and ' +
    '`evidenceClueIds` the found clues laid out as proof. In an abduction (`form` of the view) it also takes ' +
    '`whereaboutsId`, the id of the place on the map where the hero says the victim is kept, which an abduction ' +
    'needs and no other case accepts. Call it only after the player has confirmed these choices; never to test a theory. The fields are exactly `turn`, `culpritId`, `motiveInsightId`, `evidenceClueIds` and, in an abduction, ' +
    '`whereaboutsId`, and they are easy to confuse with the neighbouring tools: `culpritId` is not ' +
    '`suspectId`, `motiveInsightId` is not `insightId`, `evidenceClueIds` is not `clueIds`; `turn` is a ' +
    'number and `evidenceClueIds` an array of clue ids (never a string), empty if none. Pass `turn` from run_view: a stale one is refused with ' +
    '"stale-turn", so a retried call can never accuse twice. The result `outcome` has the verdict ' +
    '("proven", "unproven" or "wrong"), what was right, and the truth of the case (culprit, motive, method, ' +
    'place): the run is over, so this is the only place the truth is ever shown. For "unproven" it also has a ' +
    '`shortfall`: what the motive and the evidence lacked, clue by clue. Every verdict also has an ' +
    '`epilogue`: the true `course` of the crime in order, the clues `missed` (never found, with their place, ' +
    'part and obstacle) and the false clues that `misled` the hero. Tell it as the closing story, in the form ' +
    'endings.md gives for the verdict, and add nothing the outcome does not contain.',
  inputSchema: z.object({
    turn: TurnSchema,
    culpritId: EntityIdSchema,
    // A host that has not loaded the tool's schema sends every argument as a string, and "null" is a valid id to
    // the schema: no insight has that id, so it is read for what the caller meant, no motive.
    // An abduction names the place where the victim is kept; any other case leaves it out (or null, as a host may send).
    whereaboutsId: z.union([EntityIdSchema, z.null().transform(() => undefined)]).optional(),
    motiveInsightId: z.union([z.null(), z.literal('null').transform(() => null), EntityIdSchema]),
    evidenceClueIds: z.array(EntityIdSchema),
  }),
  outputSchema: TurnResultSchema,
  // A place left out is left out of the intent altogether: the log keeps the intent as it was sent.
  handler: ({ turn, whereaboutsId, ...rest }, context) =>
    playIntent(context, turn, {
      kind: 'accuse',
      ...rest,
      ...(whereaboutsId === undefined ? {} : { whereaboutsId }),
    }),
});
