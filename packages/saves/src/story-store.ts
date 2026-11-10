// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { StorySchema, type Story } from '@the-race/engine';
import { replaceFile, type SaveFs } from './save-fs.js';
import { runFiles } from './run-store.js';

/** The story of a finished run: a file of its own in the folder of the run, beside its state and its board. */
export const runStoryFile = (saveDir: string, runId: string): string =>
  join(runFiles(saveDir, runId).directory, 'story.json');

export async function saveStory(saveDir: string, story: Story, fs: SaveFs): Promise<void> {
  await fs.mkdir(runFiles(saveDir, story.runId).directory);
  await replaceFile(fs, runStoryFile(saveDir, story.runId), `${JSON.stringify(story, null, 2)}\n`);
}

/** The story of a run, or `undefined` when there is none or the file cannot be read: a story is only ever a keepsake. */
export async function loadStory(saveDir: string, runId: string, fs: SaveFs): Promise<Story | undefined> {
  const text = await fs.readFile(runStoryFile(saveDir, runId)).catch(() => undefined);
  if (text === undefined) return undefined;
  try {
    const parsed = StorySchema.safeParse(JSON.parse(text));
    return parsed.success && parsed.data.runId === runId ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
