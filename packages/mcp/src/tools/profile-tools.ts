// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { END_REASONS, computeProfileStats } from '@the-race/engine';
import { exportProfile, importProfile } from '@the-race/saves';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { requireProfile } from '../profile.js';
import { ToolFailure } from '../tool-error.js';

const RECENT_RUNS = 5;

export const profileView = defineTool({
  name: 'profile_view',
  description:
    "The player's profile: how many runs they have played, how they ended (won, lost for each reason, given " +
    'up), days and clues over all of them, the longest run, the streak of wins, and the last few runs with ' +
    'the hero, the case title and how it ended. Only runs that are over are in it, so it never touches the ' +
    "case in play. Call it once at the end of a run, after the closing scene, for one line of the hero's " +
    "tally in the narrator's voice, or when the player asks how they are doing. Changes nothing. The profile " +
    'is a local file and nothing in it leaves the machine.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    stats: z.looseObject({ runs: z.int(), won: z.int(), winRate: z.int() }),
    reasons: z.array(z.string()),
    recent: z.array(
      z.object({
        title: z.string(),
        hero: z.string(),
        background: z.string(),
        endReason: z.string(),
        won: z.boolean(),
        days: z.int(),
      }),
    ),
  }),
  handler: async (_input, context) => {
    const records = await requireProfile(context);
    return {
      stats: { ...computeProfileStats(records) },
      reasons: [...END_REASONS],
      recent: records
        .slice(-RECENT_RUNS)
        .reverse()
        .map(({ title, hero, endReason, won, days }) => ({
          title,
          hero: hero.name,
          background: hero.background,
          endReason,
          won,
          days,
        })),
    };
  },
});

export const profileExport = defineTool({
  name: 'profile_export',
  description:
    "Writes the player's profile as `export.json` in the profile folder and returns the `path`, for the " +
    'player to copy to another machine. Call it only when the player asks to export or back up their ' +
    'profile. Nothing is sent anywhere; the file stays where it is until they move it.',
  inputSchema: z.object({}),
  outputSchema: z.object({ path: z.string() }),
  handler: async (_input, context) => {
    await requireProfile(context);
    return { path: await exportProfile(context.profileDir, context.saveFs) };
  },
});

export const profileImport = defineTool({
  name: 'profile_import',
  description:
    'Takes the runs of an `import.json` the player has put in the profile folder (an `export.json` from ' +
    'another machine, renamed) into their profile. A run the profile already has is skipped, so importing ' +
    'twice adds nothing. Call it only when the player asks to import. The result is how many runs were ' +
    '`added` and `skipped`. Refused with "no-import-file" or "invalid-import-file" when there is nothing ' +
    'usable to take; tell the player in a sentence where the file belongs.',
  inputSchema: z.object({}),
  outputSchema: z.object({ added: z.int(), skipped: z.int() }),
  handler: async (_input, context) => {
    const result = await importProfile(context.profileDir, context.saveFs);
    if (result.ok) return { added: result.added, skipped: result.skipped };
    const reasons = {
      'no-file': ['no-import-file', 'There is no import.json in the profile folder.'],
      invalid: ['invalid-import-file', 'The import.json is not a profile of the RACE.'],
      'profile-unusable': ['profile-unusable', 'The profile on disk cannot be read, so nothing was added.'],
    } as const;
    const [code, message] = reasons[result.reason];
    throw new ToolFailure({
      code,
      message,
      remediation:
        'Tell the player in a sentence what to do: put the exported file in the profile folder as import.json, then ask again.',
    });
  },
});
