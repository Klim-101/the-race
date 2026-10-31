// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { EntityKindSchema, LocaleSchema, viewWorld } from '@the-race/engine';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { requireWorld } from '../world.js';

export const worldView = defineTool({
  name: 'world_view',
  description:
    'Shows the mirror world as the player may know it: its one fixed name and every country, organisation ' +
    'and role that has been given a name, in the language asked for. It holds mirror names only, never a ' +
    'real one. Changes nothing, so it is safe to call at any time.',
  inputSchema: z.object({ locale: LocaleSchema.describe('"ru" or "en".') }),
  outputSchema: z.object({
    name: z.string(),
    entries: z.array(z.object({ id: z.string(), kind: EntityKindSchema, name: z.string() })),
  }),
  handler: async ({ locale }, context) => {
    const view = viewWorld(await requireWorld(context), locale);
    return { name: view.name, entries: [...view.entries] };
  },
});
