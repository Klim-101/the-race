// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { describeSighting } from './sighting-text.js';

const base = { witnessName: 'Pip', suspectName: 'Anna', placeName: 'the square' };

describe('the words of a sighting', () => {
  it('say who saw whom, where, and when, in English', () => {
    const describe_ = describeSighting('en');

    expect(describe_({ ...base, minutesOfDay: [150] })).toBe('Pip saw Anna at the square around 02:30.');
    expect(describe_({ ...base, minutesOfDay: [150, 165] })).toBe(
      'Pip saw Anna at the square around 02:30 and 02:45.',
    );
    expect(describe_({ ...base, minutesOfDay: [5, 150, 1000] })).toBe(
      'Pip saw Anna at the square around 00:05, 02:30 and 16:40.',
    );
  });

  it('say the same in Russian', () => {
    const describe_ = describeSighting('ru');

    expect(describe_({ ...base, minutesOfDay: [150] })).toBe(
      'Свидетель Pip: Anna — the square, около 02:30.',
    );
    expect(describe_({ ...base, minutesOfDay: [150, 165, 180] })).toBe(
      'Свидетель Pip: Anna — the square, около 02:30, 02:45 и 03:00.',
    );
  });

  it('draw no conclusion: no marker of one is in the words', () => {
    for (const locale of ['en', 'ru'] as const) {
      const words = describeSighting(locale)({ ...base, minutesOfDay: [150] }).toLowerCase();
      expect(words).not.toMatch(/looks like|apparently|clearly|похоже|очевидно|явно/);
    }
  });
});
