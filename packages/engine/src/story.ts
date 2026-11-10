// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Issue } from './issues.js';
import type { Locale } from './locale.js';
import { checkNarrativeTexts } from './text/check-texts.js';

// The story of a finished run is the one text of the game the narrator writes for the player to keep: a short tale of
// the case as it went. It decides nothing and is built from facts the run is already over for, so it is stored as data,
// shown as plain text and held to the same limits as any narrative text of a case: the language of the run, and no
// name from the real world.

export const STORY_LIMITS = {
  titleMax: 80,
  paragraphsMin: 3,
  paragraphsMax: 12,
  paragraphMax: 900,
} as const;

export const StoryInputSchema = z.object({
  title: z.string().trim().min(1).max(STORY_LIMITS.titleMax),
  paragraphs: z
    .array(z.string().trim().min(1).max(STORY_LIMITS.paragraphMax))
    .min(STORY_LIMITS.paragraphsMin)
    .max(STORY_LIMITS.paragraphsMax),
});
export type StoryInput = z.infer<typeof StoryInputSchema>;

/** The story as it is kept: what the narrator wrote, the run it belongs to and its language. */
export const StorySchema = StoryInputSchema.extend({
  version: z.literal(1),
  runId: z.string().min(1),
  locale: z.enum(['ru', 'en']),
});
export type Story = z.infer<typeof StorySchema>;

export function storyOf(input: StoryInput, runId: string, locale: Locale): Story {
  return { version: 1, runId, locale, title: input.title, paragraphs: input.paragraphs };
}

/** What is wrong with a story: a text in the wrong language, or one naming a thing of the real world. */
export function checkStory(
  input: StoryInput,
  locale: Locale,
  realNames: readonly string[],
): Issue<'real-name' | 'wrong-script' | 'wrong-language'>[] {
  return checkNarrativeTexts(
    [
      { path: 'title', text: input.title },
      ...input.paragraphs.map((text, index) => ({ path: `paragraphs/${String(index)}`, text })),
    ],
    locale,
    realNames,
  );
}
