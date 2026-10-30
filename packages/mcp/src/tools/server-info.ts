// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { LOCALES, RULESET_VERSION } from '@the-race/engine';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { SERVER_NAME, SERVER_VERSION } from '../server-identity.js';

export const serverInfo = defineTool({
  name: 'server_info',
  description:
    'Reports which game server this is: its name and version, the version of the rules it plays by, and the ' +
    'languages the game can be told in. Takes no arguments and changes nothing, so it is safe to call at any ' +
    'time. Call it once at the start of a session to check the server is the-race and that the ruleset matches ' +
    'what you expect; the locales are the only values the later tools accept as a language.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    name: z.string(),
    version: z.string(),
    rulesetVersion: z.number().int(),
    locales: z.array(z.string()),
  }),
  handler: () =>
    Promise.resolve({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      rulesetVersion: RULESET_VERSION,
      locales: [...LOCALES],
    }),
});
