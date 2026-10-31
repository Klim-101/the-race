// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import {
  BACKGROUNDS,
  DETECTIVE,
  DETECTIVE_SKILL_PRESETS,
  LIFE_STATES,
  LOCALES,
  LocaleSchema,
} from '@the-race/engine';
import { loadRun } from '@the-race/saves';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { newPendingRun, savePending } from '../pending-run.js';
import { saveUnusable } from '../play.js';
import { ToolFailure } from '../tool-error.js';

export const runNew = defineTool({
  name: 'run_new',
  description:
    'Starts a new run: it picks a seed and a theme and waits for the player to make a hero. Call it only when ' +
    'the player asks for a new run and run_view reports no run in progress. It is refused with the code ' +
    '"run-in-progress" while a run is active: resume it with run_view, or end it with run_give_up if the ' +
    "player wants to stop. Pass the player's language as `locale`: exactly the two letters ru or en, whatever the player calls it, and a `seed` only if the player gave one. " +
    'It changes nothing about a finished run, and calling it again before the hero exists simply starts over ' +
    'with a fresh seed. The result is what the player may choose from when making the hero: the skills and the ' +
    'points to spend on them (all of them, no more, no skill above `maxSkillLevel`), ready-made builds of those ' +
    'points (`skillPresets`: offer these first, a player may still spend the points one by one), the backgrounds, the ' +
    'character signals (ids with a voice, a gift and a cost to be told from the locale text) and the ' +
    'languages. Next call hero_offer: the tavern puts three heroes forward and the player picks one (hero_create is only for a hand-made hero the player asks for).',
  inputSchema: z.object({
    locale: LocaleSchema.describe(
      'The language code of the whole run, "ru" or "en" (never a language name), fixed from now on.',
    ),
    seed: z.string().trim().min(1).max(64).optional().describe('Only when the player gave one.'),
  }),
  outputSchema: z.object({
    status: z.literal('awaiting-hero'),
    locale: LocaleSchema,
    skills: z.array(z.string()),
    skillPoints: z.int(),
    maxSkillLevel: z.int(),
    skillPresets: z.array(z.object({ id: z.string(), skills: z.record(z.string(), z.int()) })),
    backgrounds: z.array(z.string()),
    lifeStates: z.array(z.string()),
    signals: z.array(z.object({ id: z.string(), voice: z.string(), gift: z.string(), cost: z.string() })),
    locales: z.array(z.string()),
  }),
  handler: async (input, context) => {
    const existing = await loadRun(context.saveDir, context.saveFs);
    if (existing.ok && existing.run.status === 'active') {
      throw new ToolFailure({
        code: 'run-in-progress',
        message: 'A run is already in progress.',
        remediation:
          'Call run_view and resume it. Only if the player wants to stop, confirm and call run_give_up first.',
      });
    }
    if (!existing.ok && existing.reason !== 'missing') throw saveUnusable(existing.reason);
    await savePending(
      context.saveDir,
      newPendingRun(input.seed ?? context.newSeed(), input.locale),
      context.saveFs,
    );
    return {
      status: 'awaiting-hero' as const,
      locale: input.locale,
      skills: [...DETECTIVE.skills],
      skillPoints: DETECTIVE.skillPoints,
      maxSkillLevel: DETECTIVE.maxSkillLevel,
      skillPresets: DETECTIVE_SKILL_PRESETS.map(({ id, skills }) => ({ id, skills: { ...skills } })),
      backgrounds: [...BACKGROUNDS],
      lifeStates: [...LIFE_STATES],
      signals: DETECTIVE.signals.map(({ id, voice, gift, cost }) => ({ id, voice, gift, cost })),
      locales: [...LOCALES],
    };
  },
});
