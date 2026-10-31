// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import {
  MirrorFormsSchema,
  NAME_REGIONS,
  NAME_STYLES,
  WorldProposalSchema,
  climateFor,
  nameEntity,
  proposeEntry,
  type NameStyle,
  type WorldProposal,
} from '@the-race/engine';
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

/** What the engine names when the style is not asked for. A role has no style: it is named by hand. */
const DEFAULT_STYLE: Readonly<Partial<Record<WorldProposal['kind'], NameStyle>>> = {
  country: 'country',
  organisation: 'brand',
};

const issue = (code: string, message: string) => ({ accepted: false, issues: [{ code, message }] });

export const worldPropose = defineTool({
  name: 'world_propose',
  description:
    "For the seed extractor only. Gives one real country, organisation or role from the day's headlines its " +
    'name in the mirror world. `real` lists every way the headlines write it, in Russian and in English ' +
    '("Россия", "Russia", "РФ"); `kind` is country, organisation or role. Leave `mirror` out: the engine ' +
    'makes the name itself, in both languages, from tables of sounds, and never one that is real or taken. ' +
    '`region` (neutral, north, south, east, west, island) is the sound the name should have, the region of ' +
    'the real entity; `style` is country, union (a descriptive name such as "Northern League") or brand, and ' +
    'defaults to country for a country and brand for an organisation. A role cannot be named by the engine: ' +
    'give its `mirror` yourself ("Вальдмарк" and "Valdmark" are one name in two scripts). `knownRealNames` ' +
    'carries the other real names you saw, so that the name is checked against them too. A country also keeps the climate of the real one, which the engine looks up. The result is ' +
    '{"accepted":true,"id":...,"mirror":{...}} and the name is then fixed for good in every run, or ' +
    '{"accepted":false,"issues":[...]} with what to change: a real name that already has an entry, a form in ' +
    'the wrong script, a mirror name that is real or taken. Entries are never edited or removed.',
  inputSchema: WorldProposalSchema.omit({ mirror: true, climate: true }).extend({
    mirror: MirrorFormsSchema.optional(),
    style: z.enum(NAME_STYLES).optional(),
    region: z.enum(NAME_REGIONS).default('neutral'),
    knownRealNames: z.array(z.string().trim().min(1).max(60)).max(300).default([]),
  }),
  outputSchema: z.object({
    accepted: z.boolean(),
    id: z.string().optional(),
    mirror: MirrorFormsSchema.optional(),
    issues: z.array(z.object({ code: z.string(), message: z.string() })).optional(),
  }),
  handler: ({ knownRealNames, mirror, style, region, ...entity }, context) =>
    serialized(async () => {
      const world = await requireWorld(context);
      let proposal: WorldProposal;
      if (mirror !== undefined) {
        proposal = { ...entity, mirror };
      } else {
        const chosen = style ?? DEFAULT_STYLE[entity.kind];
        if (chosen === undefined) {
          return issue(
            'mirror-required',
            'The engine does not name a role: give its `mirror` in both languages.',
          );
        }
        const named = nameEntity(world, { ...entity, style: chosen, region }, knownRealNames);
        if (named === undefined) {
          return issue('no-name', 'No free name could be made for it. Try another region or style.');
        }
        proposal = named;
      }
      // A country keeps the climate of the real one; the table decides it, not the agent.
      if (proposal.kind === 'country') proposal = { ...proposal, climate: climateFor(proposal.real, region) };
      const result = proposeEntry(world, proposal, knownRealNames);
      if (!result.ok)
        return { accepted: false, issues: result.issues.map(({ code, message }) => ({ code, message })) };
      await saveWorld(context.saveDir, result.world, context.saveFs);
      return { accepted: true, id: result.entry.id, mirror: result.entry.mirror };
    }),
});
