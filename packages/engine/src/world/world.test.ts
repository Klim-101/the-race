// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  EMPTY_WORLD,
  WORLD_NAMES,
  WorldSchema,
  entriesIn,
  mirrorText,
  proposeEntry,
  viewWorld,
  type World,
  type WorldProposal,
} from './world.js';

const RUSSIA: WorldProposal = {
  kind: 'country',
  real: ['Россия', 'Russia', 'РФ'],
  mirror: { ru: 'Вальдмарк', en: 'Valdmark' },
};
const BANK: WorldProposal = {
  kind: 'organisation',
  real: ['Банк России', 'Bank of Russia'],
  mirror: { ru: 'Норделл', en: 'Nordell' },
};

function added(world: World, proposal: WorldProposal): World {
  const result = proposeEntry(world, proposal);
  if (!result.ok) throw new Error(result.issues.map(({ message }) => message).join(' '));
  return result.world;
}

function codes(world: World, proposal: WorldProposal, known: string[] = []): string[] {
  const result = proposeEntry(world, proposal, known);
  return result.ok ? [] : result.issues.map(({ code }) => code);
}

describe('proposeEntry', () => {
  it('adds an entry named after its English form and leaves the old world as it was', () => {
    const result = proposeEntry(EMPTY_WORLD, RUSSIA);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry).toEqual({ id: 'valdmark', ...RUSSIA });
    expect(result.world.entries).toEqual([result.entry]);
    expect(EMPTY_WORLD.entries).toEqual([]);
    expect(WorldSchema.safeParse(result.world).success).toBe(true);
  });

  it('refuses a real name listed twice and a real entity that already has an entry', () => {
    expect(codes(EMPTY_WORLD, { ...RUSSIA, real: ['Россия', 'россия'] })).toEqual(['duplicate-alias']);
    const world = added(EMPTY_WORLD, RUSSIA);

    expect(codes(world, { ...RUSSIA, mirror: { ru: 'Другой', en: 'Other' } })).toContain('alias-taken');
    // An inflected form of a name that is taken is the same name.
    expect(codes(world, { ...BANK, real: ['России'] })).toContain('alias-taken');
  });

  it('never lets two entities share a mirror name, in either language', () => {
    const world = added(EMPTY_WORLD, RUSSIA);

    expect(codes(world, { ...BANK, mirror: { ru: 'Вальдмарк', en: 'Nordell' } })).toEqual(['mirror-taken']);
    expect(codes(world, { ...BANK, mirror: { ru: 'Норделл', en: 'valdmark' } })).toEqual(['mirror-taken']);
    expect(codes(world, { ...BANK, mirror: { ru: 'Норделл', en: 'Valdmarks' } })).toEqual(['mirror-taken']);
  });

  it('refuses two names that make one id', () => {
    const world = added(EMPTY_WORLD, { ...RUSSIA, mirror: { ru: 'Северный полюс', en: 'North Pole' } });

    expect(codes(world, { ...BANK, mirror: { ru: 'Норделл', en: 'North-Pole' } })).toEqual(['mirror-taken']);
  });

  it('refuses a mirror name that is a real one: its own, the dictionary’s, a headline’s, in either script', () => {
    const world = added(EMPTY_WORLD, RUSSIA);

    expect(codes(EMPTY_WORLD, { ...RUSSIA, mirror: { ru: 'Россия', en: 'Valdmark' } })).toEqual([
      'mirror-is-real',
    ]);
    expect(codes(EMPTY_WORLD, { ...RUSSIA, mirror: { ru: 'Вальдмарк', en: 'Rossiya' } })).toEqual([
      'mirror-is-real',
    ]);
    expect(codes(world, { ...BANK, mirror: { ru: 'Норделл', en: 'Russia' } })).toContain('mirror-is-real');
    expect(codes(world, BANK, ['Нордэлл', 'Nordell'])).toEqual(['mirror-is-real', 'mirror-is-real']);
  });

  it('wants each form in its own script and the English one to name an id', () => {
    expect(codes(EMPTY_WORLD, { ...RUSSIA, mirror: { ru: 'Valdmark', en: 'Valdmark' } })).toEqual([
      'wrong-script',
    ]);
    expect(codes(EMPTY_WORLD, { ...RUSSIA, mirror: { ru: 'Вальдмарк', en: 'Вальдмарк' } })).toEqual([
      'wrong-script',
      'bad-mirror',
    ]);
  });

  it('keeps the dictionary valid however it is built up', () => {
    const world = added(added(EMPTY_WORLD, RUSSIA), BANK);

    expect(WorldSchema.safeParse(world).success).toBe(true);
    expect(world.entries.map(({ id }) => id)).toEqual(['valdmark', 'nordell']);
  });
});

describe('WorldSchema', () => {
  const entry = { id: 'valdmark', ...RUSSIA };
  const other = { id: 'nordell', ...BANK };
  const parse = (entries: unknown[]) => WorldSchema.safeParse({ schemaVersion: 1, entries });

  it('refuses a file that repeats an id, a mirror name or a real name', () => {
    expect(parse([entry, entry]).success).toBe(false);
    expect(parse([entry, { ...other, mirror: { ru: 'Вальдмарк', en: 'Nordell' } }]).success).toBe(false);
    expect(parse([entry, { ...other, real: ['россия'] }]).success).toBe(false);
    expect(parse([entry, other]).success).toBe(true);
  });

  it('refuses an unknown version, an unknown field and a bad name', () => {
    expect(WorldSchema.safeParse({ schemaVersion: 2, entries: [] }).success).toBe(false);
    expect(parse([{ ...entry, secret: 1 }]).success).toBe(false);
    expect(parse([{ ...entry, mirror: { ru: 'Валь<script>', en: 'Valdmark' } }]).success).toBe(false);
  });
});

describe('looking things up and mirroring text', () => {
  const world = added(added(EMPTY_WORLD, RUSSIA), BANK);

  it('finds the entries a text is about, inflected or not', () => {
    expect(entriesIn(world, 'Переговоры в России сорваны').map(({ id }) => id)).toEqual(['valdmark']);
    expect(entriesIn(world, 'Talks with the Bank of Russia').map(({ id }) => id)).toEqual([
      'valdmark',
      'nordell',
    ]);
    expect(entriesIn(world, 'Nothing to see')).toEqual([]);
  });

  it('swaps every real name for the mirror name in the language, the longest name first', () => {
    expect(mirrorText(world, 'Банк России объявил: Россия поднимет ставку', 'ru')).toBe(
      'Норделл объявил: Вальдмарк поднимет ставку',
    );
    expect(mirrorText(world, 'The Bank of Russia warns Russia', 'en')).toBe('The Nordell warns Valdmark');
    expect(mirrorText(world, 'Ничего', 'ru')).toBe('Ничего');
  });

  it('leaves no real name behind', () => {
    const text = 'РФ и Russia, Россией и россии. Bank of Russia.';

    const mirrored = mirrorText(world, text, 'ru');

    expect(entriesIn(world, mirrored)).toEqual([]);
  });
});

describe('viewWorld', () => {
  it('shows the mirror side only, in the language, under the one name of the world', () => {
    const world = added(EMPTY_WORLD, RUSSIA);

    const view = viewWorld(world, 'ru');

    expect(view).toEqual({
      name: WORLD_NAMES.ru,
      entries: [{ id: 'valdmark', kind: 'country', name: 'Вальдмарк' }],
    });
    expect(JSON.stringify(view)).not.toMatch(/Россия|Russia|РФ/);
    expect(viewWorld(world, 'en').name).toBe('The Draft');
    expect(viewWorld(world, 'en').entries[0]?.name).toBe('Valdmark');
  });
});
