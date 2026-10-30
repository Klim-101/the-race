// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import { findViolence } from '../../text/violence.js';
import type { CaseIssue } from '../case-issue.js';
import { DetectiveCaseSchema, RandomEventSchema } from '../case-schema.js';
import { validateCase } from '../case-validator.js';

type RawCase = ReturnType<typeof buildCheeseCase>;

const FLAVOR = {
  id: 'fair-music',
  description: 'A brass band marches through the square.',
  weight: 2,
  effect: { kind: 'flavor' },
  duration: { kind: 'instant' },
};

function withPool(events: readonly Record<string, unknown>[]): RawCase {
  const raw = buildCheeseCase();
  raw.locations.push({
    id: 'side-alley',
    name: 'Side alley',
    description: 'A narrow alley that leads nowhere in particular.',
    connections: ['market-square'],
    access: { kind: 'open' },
  });
  raw.randomEvents = [...events];
  return raw;
}

function issuesOf(raw: RawCase, locale: 'en' | 'ru' = 'en'): CaseIssue[] {
  const result = validateCase(raw, { hero: buildHero(), traits: [], locale, realNames: [] });
  return result.isValid ? [] : [...result.issues];
}

function codesOf(raw: RawCase): string[] {
  return issuesOf(raw).map(({ code }) => code);
}

describe('the schema of a random event', () => {
  it('fills in what a generator may leave out', () => {
    expect(RandomEventSchema.parse(FLAVOR)).toMatchObject({
      tones: [],
      fromDay: 1,
      untilDay: null,
      traitTriggers: [],
    });
  });

  it.each([
    ['an effect outside the vocabulary', { effect: { kind: 'kills-suspect', suspectId: 'baker' } }],
    [
      'a condition of violence',
      { effect: { kind: 'condition', condition: 'injured' }, duration: { kind: 'instant' } },
    ],
    ['no weight', { weight: 0 }],
    ['an empty description', { description: '  ' }],
    ['a lasting duration on an effect that happens once', { duration: { kind: 'permanent' } }],
    [
      'an instant duration on an effect that lasts',
      {
        effect: { kind: 'location-closes', locationId: 'side-alley' },
        duration: { kind: 'instant' },
      },
    ],
    ['a last day before the first', { fromDay: 3, untilDay: 2 }],
    ['too long a delay', { effect: { kind: 'time-lost', minutes: 600 }, duration: { kind: 'instant' } }],
  ])('rejects %s', (_name, change) => {
    expect(RandomEventSchema.safeParse({ ...FLAVOR, ...change }).success).toBe(false);
  });

  it('leaves a case without a pool as it was, so that its seal does not change', () => {
    const parsed = DetectiveCaseSchema.parse(buildCheeseCase());
    expect('randomEvents' in parsed).toBe(false);
  });
});

describe('the random events of a case', () => {
  it('accepts a pool that the hero can live with', () => {
    const raw = withPool([
      FLAVOR,
      {
        id: 'road-works',
        description: 'The alley is dug up for the week.',
        weight: 3,
        effect: { kind: 'location-closes', locationId: 'side-alley' },
        duration: { kind: 'until-day', day: 3 },
      },
      {
        id: 'baker-moves',
        description: 'The baker takes her stall to the alley.',
        weight: 1,
        effect: { kind: 'suspect-moves', suspectId: 'baker', locationId: 'side-alley' },
        duration: { kind: 'permanent' },
      },
      {
        id: 'late-train',
        description: 'The morning train is late again.',
        weight: 1,
        effect: { kind: 'time-lost', minutes: 45 },
        duration: { kind: 'instant' },
      },
    ]);
    expect(issuesOf(raw)).toEqual([]);
  });

  it('accepts a case without a pool', () => {
    expect(codesOf(buildCheeseCase())).toEqual([]);
  });

  it.each(['cheese-stall', 'storage-cellar', 'mayor-office', 'market-square'])(
    'rejects an event that closes "%s", a place the hero needs',
    (locationId) => {
      const raw = withPool([
        {
          ...FLAVOR,
          id: 'closure',
          effect: { kind: 'location-closes', locationId },
          duration: { kind: 'permanent' },
        },
      ]);
      expect(codesOf(raw)).toContain('random-event-cuts-solution');
    },
  );

  it('rejects an event that moves a suspect to a place the hero cannot reach', () => {
    // both are fine alone; the engine rechecks them together at the table
    const raw = withPool([
      {
        ...FLAVOR,
        id: 'closure',
        effect: { kind: 'location-closes', locationId: 'side-alley' },
        duration: { kind: 'permanent' },
      },
      {
        ...FLAVOR,
        id: 'baker-moves',
        effect: { kind: 'suspect-moves', suspectId: 'baker', locationId: 'side-alley' },
        duration: { kind: 'permanent' },
      },
    ]);
    expect(codesOf(raw)).toEqual([]);

    raw.clock.worldEvents.push({
      day: 2,
      description: 'The alley is closed for works.',
      effect: { kind: 'location-closes', locationId: 'side-alley' },
    });
    expect(codesOf(raw)).toEqual(['random-event-cuts-solution']);
  });

  it('rejects an event that shuts a source the evidence depends on', () => {
    const raw = withPool([
      {
        ...FLAVOR,
        id: 'records-down',
        effect: { kind: 'source-closes', source: 'police-data' },
        duration: { kind: 'permanent' },
      },
    ]);
    expect(codesOf(raw)).toEqual([]);
    const cartTracks = raw.clues.find(({ id }) => id === 'cart-tracks');
    if (!cartTracks) throw new Error('The fixture lost a clue.');
    cartTracks.source = 'police-data';
    expect(codesOf(raw)).toEqual(['random-event-cuts-solution']);
  });

  it('rejects ids that are taken, also by another event', () => {
    expect(codesOf(withPool([{ ...FLAVOR, id: 'baker' }]))).toEqual(['duplicate-id']);
    expect(codesOf(withPool([FLAVOR, FLAVOR]))).toEqual(['duplicate-id']);
  });

  it('rejects references that name nothing, and does not guess about solvability then', () => {
    const raw = withPool([
      {
        ...FLAVOR,
        id: 'a',
        effect: { kind: 'location-closes', locationId: 'nowhere' },
        duration: { kind: 'permanent' },
      },
      {
        ...FLAVOR,
        id: 'b',
        effect: { kind: 'suspect-moves', suspectId: 'nobody', locationId: 'side-alley' },
        duration: { kind: 'permanent' },
      },
      {
        ...FLAVOR,
        id: 'c',
        effect: { kind: 'suspect-moves', suspectId: 'baker', locationId: 'nowhere' },
        duration: { kind: 'permanent' },
      },
    ]);
    expect(issuesOf(raw).map(({ code, path }) => `${code} ${path}`)).toEqual([
      'unknown-reference randomEvents[0].effect.locationId',
      'unknown-reference randomEvents[1].effect.suspectId',
      'unknown-reference randomEvents[2].effect.locationId',
    ]);
  });

  it('rejects days outside the case', () => {
    const raw = withPool([
      { ...FLAVOR, fromDay: 4 },
      {
        ...FLAVOR,
        id: 'long',
        effect: { kind: 'location-closes', locationId: 'side-alley' },
        duration: { kind: 'until-day', day: 5 },
      },
      {
        ...FLAVOR,
        id: 'last-night',
        effect: { kind: 'location-closes', locationId: 'side-alley' },
        duration: { kind: 'until-day', day: 4 },
      },
    ]);
    expect(issuesOf(raw).map(({ code, path }) => `${code} ${path}`)).toEqual([
      'random-event-out-of-range randomEvents[0].fromDay',
      'random-event-out-of-range randomEvents[1].duration.day',
    ]);
  });

  it('rejects a description of violence or death, and names the word', () => {
    const raw = withPool([{ ...FLAVOR, description: 'A man is murdered in the alley.' }]);
    const issues = issuesOf(raw);
    expect(issues.map(({ code }) => code)).toEqual(['random-event-violence']);
    expect(issues[0]?.message).toContain('murdered');
  });

  it('holds the descriptions to the same rules of language and names as every other text', () => {
    const raw = withPool([{ ...FLAVOR, description: 'Музыка играет на площади.' }]);
    expect(codesOf(raw)).toEqual(['wrong-script']);
  });

  it('checks the words of violence in the language of the case', () => {
    const raw = withPool([{ ...FLAVOR, description: 'Нашли труп.' }]);
    raw.locale = 'ru';
    expect(issuesOf(raw, 'ru').map(({ code }) => code)).toContain('random-event-violence');
  });
});

describe('the simple check for violence', () => {
  it.each([
    ['en', 'He was killed at dawn.'],
    ['en', 'Someone is DEAD.'],
    ['en', 'A gunshot rings out.'],
    ['en', 'He was stabbed.'],
    ['ru', 'Его убили вчера.'],
    ['ru', 'В подвале нашли труп.'],
    ['ru', 'Повсюду кровь.'],
  ] as const)('finds it in "%s": %s', (locale, text) => {
    expect(findViolence(text, locale)).toBeDefined();
  });

  it.each([
    ['en', 'The deadline moves to Friday.'],
    ['en', 'A stable boy sells skills for cheese.'],
    ['en', 'A rainy morning slows the market.'],
    ['ru', 'Труппа приехала на ярмарку.'],
    ['ru', 'Кровать в гостинице занята.'],
    ['ru', 'Рынок открылся позже обычного.'],
  ] as const)('leaves alone "%s": %s', (locale, text) => {
    expect(findViolence(text, locale)).toBeUndefined();
  });
});
