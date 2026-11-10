// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import {
  END_REASONS,
  computeProfileStats,
  luckTokensOf,
  toolSlotsOf,
  traitSlotsOf,
  winsOf,
} from '@the-race/engine';
import { exportProfile, importProfile } from '@the-race/saves';
import { z } from 'zod';
import { hallLocation, keepHall } from '../hall.js';
import { defineTool } from '../define-tool.js';
import { requireProfile } from '../profile.js';
import { ToolFailure } from '../tool-error.js';

const RECENT_RUNS = 5;

export const profileView = defineTool({
  name: 'profile_view',
  description:
    "The player's profile: how many runs they have played, how they ended (won, lost for each reason, given " +
    'up), days and clues over all of them, the longest run, the streak of wins, `earned` (the tool slots and the hidden trait slots the next hero has, which win after win open up; it counts the run that has just ended, so after a win it is one more than the hero who played it had), and the last few runs with' +
    'the hero, the case title and how it ended. Only runs that are over are in it, so it never touches the ' +
    "case in play. Call it once at the end of a run, after the closing scene, for one line of the hero's " +
    "tally in the narrator's voice, or when the player asks how they are doing. Changes nothing. The profile " +
    'is a local file and nothing in it leaves the machine.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    stats: z.looseObject({ runs: z.int(), won: z.int(), winRate: z.int() }),
    reasons: z.array(z.string()),
    /**
     * What the runs have earned the next hero: tool slots in the suitcase and hidden trait slots. It counts every run
     * that is over, the last one too, so the hero who just played had one tool slot fewer after a win.
     */
    earned: z.object({ toolSlots: z.int(), traitSlots: z.int(), luckTokens: z.int() }),
    /** The hall of heroes, written afresh for the call: a path to say and a `file://` link to give; absent if it could not be written. */
    hall: z.object({ path: z.string(), link: z.string() }).optional(),
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
    const hall = (await keepHall(context)) ? hallLocation(context) : undefined;
    return {
      ...(hall === undefined ? {} : { hall }),
      stats: { ...computeProfileStats(records) },
      reasons: [...END_REASONS],
      earned: {
        toolSlots: toolSlotsOf(records),
        traitSlots: traitSlotsOf(winsOf(records)),
        luckTokens: luckTokensOf(winsOf(records)),
      },
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
