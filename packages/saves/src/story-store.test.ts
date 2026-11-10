// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { storyOf } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { memoryFs } from '../test/memory-fs.js';
import { loadStory, runStoryFile, saveStory } from './story-store.js';

const DIR = 'save-root';
const story = storyOf({ title: 'The folder', paragraphs: ['One.', 'Two.', 'Three.'] }, 'run-1', 'en');

describe('the story of a run', () => {
  it('is kept in the folder of the run and read back', async () => {
    const fs = memoryFs();

    await saveStory(DIR, story, fs);

    expect(runStoryFile(DIR, 'run-1')).toBe(join(DIR, 'runs', 'run-1', 'story.json'));
    expect(await loadStory(DIR, 'run-1', fs)).toEqual(story);
  });

  it('is replaced by a later one', async () => {
    const fs = memoryFs();
    await saveStory(DIR, story, fs);

    await saveStory(DIR, { ...story, title: 'Again' }, fs);

    expect((await loadStory(DIR, 'run-1', fs))?.title).toBe('Again');
  });

  it('is none when there is no file, it cannot be read, or it is not a story of that run', async () => {
    const fs = memoryFs();
    expect(await loadStory(DIR, 'run-1', fs)).toBeUndefined();

    fs.files.set(runStoryFile(DIR, 'run-1'), '{broken');
    expect(await loadStory(DIR, 'run-1', fs)).toBeUndefined();

    fs.files.set(runStoryFile(DIR, 'run-1'), JSON.stringify({ title: 'x' }));
    expect(await loadStory(DIR, 'run-1', fs)).toBeUndefined();

    await saveStory(DIR, story, fs);
    fs.files.set(runStoryFile(DIR, 'run-2'), fs.files.get(runStoryFile(DIR, 'run-1')) ?? '');
    expect(await loadStory(DIR, 'run-2', fs)).toBeUndefined();

    fs.failRead(runStoryFile(DIR, 'run-1'));
    expect(await loadStory(DIR, 'run-1', fs)).toBeUndefined();
  });
});
