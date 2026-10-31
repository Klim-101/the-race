// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DetectiveHero } from '../src/detective/archetype.js';
import { validateCase } from '../src/detective/case-validator.js';
import { DETECTIVE_TRAITS } from '../src/detective/traits.js';
import type { Locale } from '../src/locale.js';
import type { Trait } from '../src/traits.js';

const CASES_DIR = new URL('../../../content/cases/', import.meta.url);

// A plausible list of what a news pipeline would hand over; the authored cases must keep clear of it.
const REAL_NAMES = [
  'London',
  'Paris',
  'Berlin',
  'Moscow',
  'New York',
  'Washington',
  'Tokyo',
  'Google',
  'Apple',
  'Amazon',
  'Microsoft',
  'Tesla',
  'Lloyds',
  'Лондон',
  'Париж',
  'Берлин',
  'Москва',
  'Нью-Йорк',
  'Вашингтон',
  'Гугл',
  'Эппл',
  'Амазон',
  'Тесла',
  'Valdmark',
  'Вальдмарк',
];

const HEROES: readonly DetectiveHero[] = [
  {
    name: 'Mira Kos, former auditor',
    gender: 'female',
    archetype: 'detective',
    skills: { perception: 4, reasoning: 5, social: 1, pressure: 0, tech: 0, contacts: 0 },
    background: 'analyst',
  },
  {
    name: 'Dante Rook, street private eye',
    gender: 'male',
    archetype: 'detective',
    skills: { perception: 1, reasoning: 0, social: 5, pressure: 0, tech: 0, contacts: 4 },
    background: 'locksmith',
  },
  {
    name: 'Sasha Vell, investigative blogger',
    gender: 'nonbinary',
    archetype: 'detective',
    skills: { perception: 0, reasoning: 1, social: 0, pressure: 4, tech: 5, contacts: 0 },
    background: 'journalist',
  },
];

const TRAIT_SETS: readonly { label: string; traits: Trait[] }[] = [
  { label: 'no traits', traits: [] },
  ...DETECTIVE_TRAITS.map((trait) => ({ label: trait.id, traits: [trait] })),
];

interface CaseFile {
  readonly name: string;
  readonly locale: Locale;
  readonly caseId: string;
  readonly json: Record<string, unknown>;
}

const files: CaseFile[] = readdirSync(CASES_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => {
    const [caseId, locale] = name.split('.');
    return {
      name,
      locale: locale as Locale,
      caseId: caseId ?? name,
      json: JSON.parse(readFileSync(new URL(name, CASES_DIR), 'utf8')) as Record<string, unknown>,
    };
  });

function collectIds(json: Record<string, unknown>): string[] {
  const idsOf = (key: string): string[] => (json[key] as { id: string }[]).map((entity) => entity.id).sort();
  const suspects = json.suspects as { id: string; lies: { id: string }[] }[];
  return [
    ...idsOf('locations'),
    ...idsOf('clues'),
    ...idsOf('suspects'),
    ...suspects.flatMap((suspect) => suspect.lies.map((lie) => lie.id)).sort(),
    ...idsOf('deductions'),
  ];
}

describe('sample cases', () => {
  it('ships two cases, each in Russian and in English', () => {
    expect(files.map((file) => file.name)).toEqual([
      'goose-of-elmwick.en.json',
      'goose-of-elmwick.ru.json',
      'leaked-memo-of-larkspur.en.json',
      'leaked-memo-of-larkspur.ru.json',
    ]);
  });

  it('tells each case in both languages with the same ids and shape', () => {
    for (const caseId of new Set(files.map((file) => file.caseId))) {
      const en = files.find((file) => file.caseId === caseId && file.locale === 'en');
      const ru = files.find((file) => file.caseId === caseId && file.locale === 'ru');
      expect(en, `${caseId} has an English file`).toBeDefined();
      expect(ru, `${caseId} has a Russian file`).toBeDefined();
      if (!en || !ru) continue;
      expect(collectIds(ru.json)).toEqual(collectIds(en.json));
      for (const key of ['crimeType', 'tone', 'startLocationId', 'solution']) {
        expect(ru.json[key], key).toEqual(en.json[key]);
      }
      const truthOf = (json: Record<string, unknown>) => {
        const { culpritId, crimeLocationId, crimeAtMinute, timeline } = json.truth as {
          culpritId: string;
          crimeLocationId: string;
          crimeAtMinute: number;
          timeline: { atMinute: number; actorId: string; locationId: string }[];
        };
        return {
          culpritId,
          crimeLocationId,
          crimeAtMinute,
          timeline: timeline.map(({ atMinute, actorId, locationId }) => ({ atMinute, actorId, locationId })),
        };
      };
      expect(truthOf(ru.json)).toEqual(truthOf(en.json));
    }
  });

  it('keeps clear of the name of the old test world', () => {
    for (const file of files) {
      expect(JSON.stringify(file.json).toLowerCase()).not.toContain('valdmark');
      expect(JSON.stringify(file.json).toLowerCase()).not.toContain('вальдмарк');
    }
  });

  describe.each(files)('$name', ({ locale, json }) => {
    it('has the structure the design asks for', () => {
      const clues = json.clues as { isRedHerring: boolean }[];
      const locations = json.locations as { access: { kind: string }; situations?: string[] }[];
      const suspects = json.suspects as unknown[];
      expect(locations.length).toBeGreaterThanOrEqual(6);
      expect(locations.length).toBeLessThanOrEqual(8);
      expect(clues.length).toBeGreaterThanOrEqual(8);
      expect(clues.length).toBeLessThanOrEqual(12);
      expect(clues.filter((clue) => clue.isRedHerring).length / clues.length).toBeLessThanOrEqual(0.3);
      expect(suspects.length).toBeGreaterThanOrEqual(3);
      expect(suspects.length).toBeLessThanOrEqual(4);
      expect(new Set(locations.map((location) => location.access.kind))).toEqual(
        new Set(['open', 'clue', 'skill']),
      );
      expect(locations.some((location) => (location.situations ?? []).length > 0)).toBe(true);
      expect((json.clock as { days: number }).days).toBe(3);
    });

    describe.each(HEROES)('for hero $name', (hero) => {
      it.each(TRAIT_SETS)('is solvable with $label', ({ traits }) => {
        const result = validateCase(json, { hero, traits, locale, realNames: REAL_NAMES });

        expect(result).toMatchObject({ isValid: true });
      });
    });
  });
});

describe('traits and the sample cases', () => {
  // The engine itself brings these scenes to any case: a talk, a second search, the evening, the next day.
  const OF_THE_ENGINE = ['interrogation', 'reinspection', 'night', 'second-day'];
  const tagged = new Set(
    files.flatMap(({ json }) =>
      [
        ...(json.locations as { situations?: string[] }[]),
        ...(json.clues as { situations?: string[] }[]),
      ].flatMap(({ situations }) => situations ?? []),
    ),
  );

  it.each(DETECTIVE_TRAITS.filter(({ effects }) => effects.every(({ kind }) => kind !== 'lock-out')))(
    '$id has a scene to act in: one the engine brings or one a sample case has',
    ({ trigger }) => {
      expect(OF_THE_ENGINE.includes(trigger) || tagged.has(trigger)).toBe(true);
    },
  );
});
