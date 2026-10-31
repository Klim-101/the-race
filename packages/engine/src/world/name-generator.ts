// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { createRng, type Rng } from '../dice.js';
import { proposeEntry, type MirrorForms, type World, type WorldProposal } from './world.js';

// The engine names the mirror world, not a model: a name is put together from tables of sounds, each of which
// is spelled in both languages at once, so the Russian and the English form are one name and not two guesses.
// A candidate is built from a seed that depends on the real entity alone, so every player who meets the same
// entity is offered the same names in the same order; it is kept only if the dictionary accepts it, which is
// the check against every real name and every name already given.

interface Sound {
  readonly en: string;
  readonly ru: string;
}
const sound = (en: string, ru: string): Sound => ({ en, ru });

export const NAME_REGIONS = ['neutral', 'north', 'south', 'east', 'west', 'island'] as const;
export type NameRegion = (typeof NAME_REGIONS)[number];

/** A short neutral country name, a descriptive union of the kind "Northern League", or a company brand. */
export const NAME_STYLES = ['country', 'union', 'brand'] as const;
export type NameStyle = (typeof NAME_STYLES)[number];

interface Palette {
  readonly onsets: readonly Sound[];
  readonly vowels: readonly Sound[];
  readonly codas: readonly Sound[];
  readonly countryEndings: readonly Sound[];
}

const VOWELS = [sound('a', 'а'), sound('e', 'е'), sound('i', 'и'), sound('o', 'о'), sound('u', 'у')];

const PALETTES: Readonly<Record<NameRegion, Palette>> = {
  neutral: {
    onsets: [
      sound('b', 'б'),
      sound('d', 'д'),
      sound('f', 'ф'),
      sound('g', 'г'),
      sound('k', 'к'),
      sound('l', 'л'),
      sound('m', 'м'),
      sound('n', 'н'),
      sound('p', 'п'),
      sound('r', 'р'),
      sound('s', 'с'),
      sound('t', 'т'),
      sound('v', 'в'),
      sound('z', 'з'),
    ],
    vowels: VOWELS,
    codas: [sound('n', 'н'), sound('r', 'р'), sound('s', 'с'), sound('l', 'л'), sound('m', 'м')],
    countryEndings: [sound('ia', 'ия'), sound('land', 'ленд'), sound('mar', 'мар'), sound('via', 'вия')],
  },
  north: {
    onsets: [
      sound('sk', 'ск'),
      sound('st', 'ст'),
      sound('gr', 'гр'),
      sound('br', 'бр'),
      sound('v', 'в'),
      sound('h', 'х'),
      sound('k', 'к'),
      sound('t', 'т'),
    ],
    vowels: [sound('a', 'а'), sound('o', 'о'), sound('u', 'у'), sound('e', 'е')],
    codas: [sound('rd', 'рд'), sound('rk', 'рк'), sound('nd', 'нд'), sound('lf', 'льф')],
    countryEndings: [
      sound('mark', 'марк'),
      sound('heim', 'хейм'),
      sound('gard', 'гард'),
      sound('vik', 'вик'),
    ],
  },
  south: {
    onsets: [
      sound('l', 'л'),
      sound('r', 'р'),
      sound('s', 'с'),
      sound('m', 'м'),
      sound('t', 'т'),
      sound('c', 'к'),
    ],
    vowels: [sound('a', 'а'), sound('o', 'о'), sound('i', 'и'), sound('e', 'е')],
    codas: [sound('n', 'н'), sound('s', 'с'), sound('r', 'р')],
    countryEndings: [sound('ora', 'ора'), sound('ena', 'ена'), sound('ana', 'ана'), sound('ia', 'ия')],
  },
  east: {
    onsets: [
      sound('z', 'з'),
      sound('sh', 'ш'),
      sound('kh', 'х'),
      sound('d', 'д'),
      sound('b', 'б'),
      sound('ch', 'ч'),
      sound('k', 'к'),
    ],
    vowels: [sound('a', 'а'), sound('u', 'у'), sound('o', 'о'), sound('i', 'и')],
    codas: [sound('r', 'р'), sound('k', 'к'), sound('m', 'м'), sound('z', 'з')],
    countryEndings: [sound('stan', 'стан'), sound('ovia', 'овия'), sound('ia', 'ия'), sound('abad', 'абад')],
  },
  west: {
    onsets: [
      sound('br', 'бр'),
      sound('cr', 'кр'),
      sound('w', 'в'),
      sound('h', 'х'),
      sound('p', 'п'),
      sound('d', 'д'),
      sound('f', 'ф'),
    ],
    vowels: VOWELS,
    codas: [sound('n', 'н'), sound('l', 'л'), sound('th', 'т'), sound('rd', 'рд')],
    countryEndings: [
      sound('land', 'ленд'),
      sound('ford', 'форд'),
      sound('mont', 'монт'),
      sound('ton', 'тон'),
    ],
  },
  island: {
    onsets: [
      sound('m', 'м'),
      sound('k', 'к'),
      sound('l', 'л'),
      sound('n', 'н'),
      sound('h', 'х'),
      sound('t', 'т'),
    ],
    vowels: VOWELS,
    codas: [],
    countryEndings: [sound('ara', 'ара'), sound('oa', 'оа'), sound('ui', 'уи'), sound('ana', 'ана')],
  },
};

const BRAND_ENDINGS = [
  sound('tek', 'тек'),
  sound('ron', 'рон'),
  sound('ix', 'икс'),
  sound('ora', 'ора'),
  sound('ent', 'ент'),
  sound('ium', 'иум'),
];

interface Adjective {
  readonly en: string;
  readonly ruStem: string;
}
const ADJECTIVES: readonly Adjective[] = [
  { en: 'Northern', ruStem: 'Северн' },
  { en: 'Eastern', ruStem: 'Восточн' },
  { en: 'Southern', ruStem: 'Южн' },
  { en: 'Western', ruStem: 'Западн' },
  { en: 'Amber', ruStem: 'Янтарн' },
  { en: 'Silver', ruStem: 'Серебрян' },
  { en: 'Iron', ruStem: 'Железн' },
  { en: 'Coastal', ruStem: 'Прибрежн' },
  { en: 'Free', ruStem: 'Вольн' },
];

type Gender = 'm' | 'f' | 'n';
const GENDER_ENDINGS: Readonly<Record<Gender, string>> = { m: 'ый', f: 'ая', n: 'ое' };
interface UnionNoun {
  readonly en: string;
  readonly ru: string;
  readonly gender: Gender;
}
const UNION_NOUNS: readonly UnionNoun[] = [
  { en: 'Union', ru: 'Союз', gender: 'm' },
  { en: 'League', ru: 'Лига', gender: 'f' },
  { en: 'Accord', ru: 'Договор', gender: 'm' },
  { en: 'Alliance', ru: 'Альянс', gender: 'm' },
  { en: 'Compact', ru: 'Пакт', gender: 'm' },
  { en: 'Commonwealth', ru: 'Содружество', gender: 'n' },
];

// `roll(n)` is between 1 and n, so the index is always inside a list that is not empty.
const pick = <T>(rng: Rng, items: readonly T[]): T => items[rng.roll(items.length) - 1] as T;

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const join = (parts: readonly Sound[]): MirrorForms => ({
  en: capital(parts.map(({ en }) => en).join('')),
  ru: capital(parts.map(({ ru }) => ru).join('')),
});

/** One or two syllables, the last of which may close on a consonant: the body of a country or a brand. */
function body(rng: Rng, palette: Palette, syllables: number): Sound[] {
  const parts: Sound[] = [];
  for (let index = 0; index < syllables; index += 1) {
    parts.push(pick(rng, palette.onsets), pick(rng, palette.vowels));
    const closes = index === syllables - 1 && palette.codas.length > 0 && rng.roll(2) === 1;
    if (closes) parts.push(pick(rng, palette.codas));
  }
  return parts;
}

/** A name for one attempt. The same rng gives the same name. */
function candidate(rng: Rng, style: NameStyle, region: NameRegion): MirrorForms {
  const palette = PALETTES[region];
  if (style === 'country')
    return join([...body(rng, palette, rng.roll(2)), pick(rng, palette.countryEndings)]);
  if (style === 'brand') return join([...body(rng, palette, 2), pick(rng, BRAND_ENDINGS)]);
  const adjective = pick(rng, ADJECTIVES);
  const noun = pick(rng, UNION_NOUNS);
  return {
    en: `${adjective.en} ${noun.en}`,
    ru: `${adjective.ruStem}${GENDER_ENDINGS[noun.gender]} ${noun.ru}`,
  };
}

export interface NameRequest {
  readonly kind: WorldProposal['kind'];
  /** Every way the headlines write the real entity: what the names are seeded from, and what they must not be. */
  readonly real: readonly string[];
  readonly style: NameStyle;
  readonly region: NameRegion;
}

export const MAX_NAME_ATTEMPTS = 200;

const fold = (name: string): string => name.normalize('NFKC').toLowerCase().replaceAll('ё', 'е');

/**
 * A proposal for the dictionary with a name made by the engine, or `undefined` when no candidate was accepted
 * within `attempts`. The candidates depend on the real entity, the style and the region alone, so the same
 * entity gets the same name for every player until a clash with a name already given moves it on to the next
 * candidate. A candidate is kept only if `proposeEntry` accepts it, so a name that is a real one, in either
 * script, or one already in use, is never returned.
 */
export function nameEntity(
  world: World,
  request: NameRequest,
  knownRealNames: readonly string[] = [],
  attempts: number = MAX_NAME_ATTEMPTS,
): WorldProposal | undefined {
  const seed = `${request.style}:${request.region}:${request.real.map(fold).sort().join('|')}`;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const proposal: WorldProposal = {
      kind: request.kind,
      real: [...request.real],
      mirror: candidate(createRng(`${seed}:${String(attempt)}`), request.style, request.region),
    };
    if (proposeEntry(world, proposal, knownRealNames).ok) return proposal;
  }
  return undefined;
}
