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
    '`evidenceClueIds` the found clues laid out as proof. Call it only after the player has confirmed these ' +
    'three choices; never to test a theory. Pass `turn` from run_view: a stale one is refused with ' +
    '"stale-turn", so a retried call can never accuse twice. The result `outcome` has the verdict ' +
    '("proven", "unproven" or "wrong"), what was right, and the truth of the case (culprit, motive, method, ' +
    'place): the run is over, so this is the only place the truth is ever shown. Tell it as the closing ' +
    'scene and add nothing the outcome does not contain.',
  inputSchema: z.object({
    turn: TurnSchema,
    culpritId: EntityIdSchema,
    motiveInsightId: EntityIdSchema.nullable(),
    evidenceClueIds: z.array(EntityIdSchema),
  }),
  outputSchema: TurnResultSchema,
  handler: ({ turn, ...rest }, context) => playIntent(context, turn, { kind: 'accuse', ...rest }),
});
