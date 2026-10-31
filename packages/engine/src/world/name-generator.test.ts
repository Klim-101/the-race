// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { findRealName } from '../text/real-names.js';
import { isInLocaleScript } from '../text/script.js';
import {
  NAME_REGIONS,
  NAME_STYLES,
  nameEntity,
  type NameRegion,
  type NameRequest,
  type NameStyle,
} from './name-generator.js';
import { EMPTY_WORLD, MirrorFormsSchema, proposeEntry, type World } from './world.js';

const request = (
  real: string[],
  style: NameStyle = 'country',
  region: NameRegion = 'neutral',
): NameRequest => ({ kind: style === 'country' ? 'country' : 'organisation', real, style, region });

const named = (world: World, asked: NameRequest, known: string[] = []): World => {
  const proposal = nameEntity(world, asked, known);
  if (proposal === undefined) throw new Error('A name was expected.');
  const added = proposeEntry(world, proposal, known);
  if (!added.ok) throw new Error("The engine's own proposal must be accepted.");
  return added.world;
};

describe('nameEntity', () => {
  it('gives the same names for the same entity, style and region', () => {
    const asked = request(['Россия', 'Russia'], 'country', 'north');

    expect(nameEntity(EMPTY_WORLD, asked)).toEqual(nameEntity(EMPTY_WORLD, asked));
    // The order in which the spellings are listed does not matter.
    expect(nameEntity(EMPTY_WORLD, request(['Russia', 'Россия'], 'country', 'north'))?.mirror).toEqual(
      nameEntity(EMPTY_WORLD, asked)?.mirror,
    );
  });

  it('gives different entities different names', () => {
    const names = new Set(
      ['Norway', 'Chile', 'Peru', 'Japan', 'Kenya', 'Spain', 'Egypt', 'Iran'].map(
        (country) => nameEntity(EMPTY_WORLD, request([country]))?.mirror.en,
      ),
    );

    expect(names.size).toBeGreaterThan(5);
  });

  it('writes both forms in their own script, as a valid mirror name', () => {
    for (const style of NAME_STYLES) {
      for (const region of NAME_REGIONS) {
        const proposal = nameEntity(EMPTY_WORLD, request([`Entity ${style} ${region}`], style, region));

        expect(MirrorFormsSchema.safeParse(proposal?.mirror).success).toBe(true);
        expect(isInLocaleScript(proposal?.mirror.en ?? '', 'en')).toBe(true);
        expect(isInLocaleScript(proposal?.mirror.ru ?? '', 'ru')).toBe(true);
      }
    }
  });

  it('keeps to the sound of the region', () => {
    const endings = ['mark', 'heim', 'gard', 'vik'];
    const north = Array.from({ length: 30 }, (_, index) =>
      nameEntity(EMPTY_WORLD, request([`Place ${String(index)}`], 'country', 'north')),
    );

    for (const proposal of north)
      expect(endings.some((ending) => proposal?.mirror.en.endsWith(ending))).toBe(true);
  });

  it('puts the adjective of a union in the gender of its noun', () => {
    const forms = Array.from(
      { length: 60 },
      (_, index) => nameEntity(EMPTY_WORLD, request([`Pact ${String(index)}`], 'union'))?.mirror,
    );
    const agree = (en: string, ru: string): boolean =>
      (en.endsWith('League') && ru.endsWith('ая Лига')) ||
      (en.endsWith('Commonwealth') && ru.endsWith('ое Содружество')) ||
      (!en.endsWith('League') && !en.endsWith('Commonwealth') && ru.includes('ый '));

    for (const form of forms) expect(agree(form?.en ?? '', form?.ru ?? ''), form?.ru).toBe(true);
    expect(new Set(forms.map((form) => form?.en.split(' ')[1])).size).toBeGreaterThan(2);
  });

  it('never gives a real name, whatever the headlines carry, in either script', () => {
    for (let index = 0; index < 120; index += 1) {
      const asked = request([`Entity ${String(index)}`]);
      const first = nameEntity(EMPTY_WORLD, asked);
      // The real names of the day include the very name that would have been chosen.
      const known = [first?.mirror.en ?? '', first?.mirror.ru ?? ''];

      const second = nameEntity(EMPTY_WORLD, asked, known);

      expect(second?.mirror).not.toEqual(first?.mirror);
      expect(findRealName(second?.mirror.en ?? '', known)).toBeUndefined();
      expect(findRealName(second?.mirror.ru ?? '', known)).toBeUndefined();
    }
  });

  it('never repeats a name of the dictionary, in either language', () => {
    let world = EMPTY_WORLD;
    for (let index = 0; index < 80; index += 1) {
      world = named(
        world,
        request([`Entity ${String(index)}`], index % 2 === 0 ? 'country' : 'brand', 'island'),
      );
    }

    expect(new Set(world.entries.map(({ mirror }) => mirror.en.toLowerCase())).size).toBe(80);
    expect(new Set(world.entries.map(({ mirror }) => mirror.ru.toLowerCase())).size).toBe(80);
    expect(new Set(world.entries.map(({ id }) => id)).size).toBe(80);
  });

  it('moves on to the next candidate when the first one is taken', () => {
    const asked = request(['Freedonia']);
    const first = nameEntity(EMPTY_WORLD, asked);
    if (first === undefined) throw new Error('A name was expected.');
    const crowded = proposeEntry(EMPTY_WORLD, { ...first, real: ['Sylvania'] });
    if (!crowded.ok) throw new Error('The name must be free in an empty world.');

    const next = nameEntity(crowded.world, asked);

    expect(next).toBeDefined();
    expect(next?.mirror).not.toEqual(first.mirror);
  });

  it('says so when no candidate is accepted within the attempts', () => {
    expect(nameEntity(EMPTY_WORLD, request(['Freedonia']), [], 0)).toBeUndefined();
  });
});
