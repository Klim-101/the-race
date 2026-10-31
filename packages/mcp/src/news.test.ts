// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { EMPTY_WORLD, proposeEntry } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { realNamesOfDay, type DayNews } from './news.js';

const NEWS: DayNews = {
  day: '2026-10-31',
  block: '',
  entries: [
    {
      id: 'h00000001',
      topic: 'world',
      headline: { title: 'Talks with Norway stall', summary: 'Oslo waits.' },
    },
    { id: 'h00000002', topic: 'tech', headline: { title: 'Cloud outage in Berlin' } },
  ],
};

describe('realNamesOfDay', () => {
  it('collects the names in the titles and summaries, whether or not a headline has a summary', () => {
    const names = realNamesOfDay(NEWS, EMPTY_WORLD);

    expect(names).toEqual(expect.arrayContaining(['norway', 'berlin']));
  });

  it('adds every real name of the dictionary, once', () => {
    const added = proposeEntry(EMPTY_WORLD, {
      kind: 'country',
      real: ['Freedonia', 'Freedonian'],
      mirror: { ru: 'Вальдмарк', en: 'Valdmark' },
    });
    if (!added.ok) throw new Error('The test world must be valid.');

    const names = realNamesOfDay(NEWS, added.world);

    expect(names).toEqual(expect.arrayContaining(['Freedonia', 'Freedonian']));
    expect(new Set(names).size).toBe(names.length);
  });
});
