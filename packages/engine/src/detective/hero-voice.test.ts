// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DETECTIVE } from './archetype.js';
import { BACKGROUNDS } from './gear.js';
import { LIFE_STATES } from './life-state.js';

const VOICE = new URL('../../../../agents/skills/play-the-race/reference/hero-voice.md', import.meta.url);

// The narrator is the hero's own thoughts, and the voice comes from what the view says about the hero. A
// background, a situation or a signal the reference has no row for would leave the narrator to make one up.
describe('the hero voice reference', () => {
  const text = readFileSync(VOICE, 'utf8');

  it.each(BACKGROUNDS)('has a way of thinking for the background %s', (background) => {
    expect(text).toContain(`| \`${background}\``);
  });

  it.each(LIFE_STATES)('has an undertone for the situation %s', (state) => {
    expect(text).toContain(`| \`${state}\``);
  });

  it.each(DETECTIVE.signals.map(({ voice }) => voice))(
    'has a way of speaking for the signal voice %s',
    (voice) => {
      expect(text).toContain(`| \`${voice}\``);
    },
  );
});
