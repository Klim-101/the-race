// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { WorldProposalSchema, proposeEntry } from '@the-race/engine';
import { saveWorld } from '@the-race/saves';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { requireWorld } from '../world.js';

/**
 * Proposals are applied one at a time: two at once would both read the same dictionary, and the second
 * save would be refused for dropping the first one's entry.
 */
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

export const worldPropose = defineTool({
  name: 'world_propose',
  description:
    'For the seed extractor only. Proposes the mirror name of one real country, organisation or role from ' +
    "the day's headlines. `real` lists every way the headlines write it, in Russian and in English " +
    '("Россия", "Russia", "РФ"); `mirror` is its invented name in both languages ("Вальдмарк", "Valdmark"); ' +
    '`kind` is country, organisation or role. `knownRealNames` may carry the other real names you saw, ' +
    'so that the mirror name is checked against them too. The result is {"accepted":true,"id":...} and the ' +
    'name is then fixed for good in every run, or {"accepted":false,"issues":[...]} with what to change: ' +
    'a mirror name that is a real one, one that another entity already has, a real name that already has ' +
    'an entry, a form in the wrong script. Entries are never edited or removed.',
  inputSchema: WorldProposalSchema.extend({
    knownRealNames: z.array(z.string().trim().min(1).max(60)).max(300).default([]),
  }),
  outputSchema: z.object({
    accepted: z.boolean(),
    id: z.string().optional(),
    issues: z.array(z.object({ code: z.string(), message: z.string() })).optional(),
  }),
  handler: ({ knownRealNames, ...proposal }, context) =>
    serialized(async () => {
      const world = await requireWorld(context);
      const result = proposeEntry(world, proposal, knownRealNames);
      if (!result.ok)
        return { accepted: false, issues: result.issues.map(({ code, message }) => ({ code, message })) };
      await saveWorld(context.saveDir, result.world, context.saveFs);
      return { accepted: true, id: result.entry.id };
    }),
});
