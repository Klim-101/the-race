// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { STORY_LIMITS, StoryInputSchema, StorySchema, checkStory, storyOf } from './story.js';

const paragraphs = ['One.', 'Two.', 'Three.'];

describe('the input of a story', () => {
  it('trims the words and holds a title and a few paragraphs', () => {
    const parsed = StoryInputSchema.parse({ title: '  The folder  ', paragraphs: [' a ', 'b', 'c'] });

    expect(parsed).toEqual({ title: 'The folder', paragraphs: ['a', 'b', 'c'] });
  });

  it('refuses a story that is too short, too long, or has a blank part', () => {
    const at = (title: string, parts: string[]) =>
      StoryInputSchema.safeParse({ title, paragraphs: parts }).success;

    expect(at('T', paragraphs.slice(0, 2))).toBe(false);
    expect(
      at(
        'T',
        Array.from({ length: STORY_LIMITS.paragraphsMax + 1 }, () => 'x'),
      ),
    ).toBe(false);
    expect(
      at(
        'T',
        Array.from({ length: STORY_LIMITS.paragraphsMax }, () => 'x'),
      ),
    ).toBe(true);
    expect(at('  ', paragraphs)).toBe(false);
    expect(at('T'.repeat(STORY_LIMITS.titleMax + 1), paragraphs)).toBe(false);
    expect(at('T', ['a', ' ', 'c'])).toBe(false);
    expect(at('T', ['a', 'x'.repeat(STORY_LIMITS.paragraphMax + 1), 'c'])).toBe(false);
  });
});

describe('a kept story', () => {
  it('carries the run and the language it was told in', () => {
    const story = storyOf({ title: 'T', paragraphs }, 'run-1', 'en');

    expect(story).toEqual({ version: 1, runId: 'run-1', locale: 'en', title: 'T', paragraphs });
    expect(StorySchema.parse(story)).toEqual(story);
  });
});

describe('checkStory', () => {
  it('passes a story in the language of the run that names nothing real', () => {
    expect(checkStory({ title: 'The folder', paragraphs }, 'en', ['Paris'])).toEqual([]);
  });

  it('names the part that holds a real name, and the one in the wrong language', () => {
    const issues = checkStory(
      { title: 'The folder', paragraphs: ['One.', 'She left for Paris at dawn.', 'Это было ночью.'] },
      'en',
      ['Paris'],
    );

    expect(issues.map(({ code, path }) => `${code}@${path}`)).toEqual([
      'real-name@paragraphs/1',
      'wrong-script@paragraphs/2',
    ]);
  });
});
