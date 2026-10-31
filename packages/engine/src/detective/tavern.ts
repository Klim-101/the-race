// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { createRng, type Rng } from '../dice.js';
import type { Gender } from '../archetype.js';
import type { Locale } from '../locale.js';
import { DETECTIVE } from './archetype.js';
import { BACKGROUNDS, type Background } from './gear.js';
import { LIFE_STATES, type LifeState } from './life-state.js';
import { BACKGROUND_BUILDS, DETECTIVE_SKILL_PRESETS, type SkillPreset } from './skill-presets.js';

// The tavern offers the player three heroes and the player walks into the run with one of them. The offer is
// the engine's: the same seed and the same round always give the same three, and nothing in them is the
// narrator's to make up. The hidden traits are not part of it, they are rolled when a hero is picked, so a
// card can say who the hero is and never what they hide.

/** How many heroes the tavern puts forward. */
export const OFFER_SIZE = 3;
/** How many times the player may ask for another three. */
export const MAX_REROLLS = 1;

export const CANDIDATE_IDS = ['a', 'b', 'c'] as const;
export type CandidateId = (typeof CANDIDATE_IDS)[number];

export interface HeroCandidate {
  readonly id: CandidateId;
  readonly name: string;
  readonly gender: Gender;
  readonly background: Background;
  /** What the hero is going through, or absent for one who is simply starting out. */
  readonly lifeState?: LifeState;
  /** The id of the ready-made build the skills come from; the locale files name it. */
  readonly build: string;
  readonly skills: SkillPreset['skills'];
  /** The one visible character signal, or absent for a hero without one. */
  readonly signalId?: string;
}

/** The three heroes of one round, in the order of their ids. */
export type HeroOffer = readonly [HeroCandidate, HeroCandidate, HeroCandidate];

interface Spelled {
  readonly en: string;
  readonly ru: string;
}
const spelled = (en: string, ru: string): Spelled => ({ en, ru });

// Given names and surnames are invented in the same spirit as the places of the mirror world: they sound like
// somebody, and nobody real carries the pair. Each is spelled in both languages at once, so the Russian and
// the English card show one hero. The surnames do not change with the gender of the hero in Russian.
const GIVEN: Readonly<Record<Gender, readonly Spelled[]>> = {
  female: [
    spelled('Maren', 'Марен'),
    spelled('Ilsa', 'Ильза'),
    spelled('Tova', 'Това'),
    spelled('Nell', 'Нелл'),
    spelled('Sabine', 'Сабина'),
    spelled('Odile', 'Одиль'),
    spelled('Greta', 'Грета'),
    spelled('Imke', 'Имке'),
    spelled('Liv', 'Лив'),
    spelled('Marta', 'Марта'),
    spelled('Petra', 'Петра'),
    spelled('Yara', 'Яра'),
  ],
  male: [
    spelled('Anton', 'Антон'),
    spelled('Bram', 'Брам'),
    spelled('Corin', 'Корин'),
    spelled('Emil', 'Эмиль'),
    spelled('Hollis', 'Холлис'),
    spelled('Lev', 'Лев'),
    spelled('Dmitri', 'Дмитрий'),
    spelled('Gideon', 'Гидеон'),
    spelled('Jonas', 'Йонас'),
    spelled('Matej', 'Матей'),
    spelled('Nils', 'Нильс'),
    spelled('Teodor', 'Теодор'),
  ],
  nonbinary: [
    spelled('Robin', 'Робин'),
    spelled('Sasha', 'Саша'),
    spelled('Vale', 'Вейл'),
    spelled('Wren', 'Рен'),
    spelled('Ari', 'Ари'),
    spelled('Quinn', 'Куинн'),
    spelled('Alex', 'Алекс'),
    spelled('Eli', 'Эли'),
    spelled('Jules', 'Жюль'),
    spelled('Noor', 'Нур'),
    spelled('Sam', 'Сэм'),
    spelled('Toni', 'Тони'),
  ],
};

const SURNAMES: readonly Spelled[] = [
  spelled('Vellmark', 'Веллмарк'),
  spelled('Ostrander', 'Острандер'),
  spelled('Hallowen', 'Халловен'),
  spelled('Brightwell', 'Брайтуэлл'),
  spelled('Kessling', 'Кесслинг'),
  spelled('Marrowby', 'Мэрроуби'),
  spelled('Tindall', 'Тиндалл'),
  spelled('Fenwick', 'Фенвик'),
  spelled('Dorrance', 'Дорранс'),
  spelled('Pellegrin', 'Пеллегрин'),
  spelled('Ashgrove', 'Эшгроув'),
  spelled('Lindqvist', 'Линдквист'),
  spelled('Aldermoor', 'Олдермур'),
  spelled('Corvane', 'Корвейн'),
  spelled('Draycott', 'Дрейкотт'),
  spelled('Eastlake', 'Истлейк'),
  spelled('Garrow', 'Гэрроу'),
  spelled('Holloway', 'Холлоуэй'),
  spelled('Ironside', 'Айронсайд'),
  spelled('Keswick', 'Кесвик'),
  spelled('Lanyon', 'Ланьон'),
  spelled('Merrick', 'Мэррик'),
  spelled('Northcott', 'Норткотт'),
  spelled('Pryor', 'Прайор'),
];

const GENDERS: readonly Gender[] = ['female', 'male', 'nonbinary'];
// "No life state" is one of the options too: not everyone is in the middle of something.
const LIFE_STATE_OPTIONS: readonly (LifeState | undefined)[] = [undefined, ...LIFE_STATES];
// "No signal" is one of the options, as it is in the hand-made poll.
const SIGNALS: readonly (string | undefined)[] = [undefined, ...DETECTIVE.signals.map((signal) => signal.id)];

// Every index used here is inside its list: a die has one face per item, and the three slots are the first
// three of lists that are longer.
function at<T>(items: readonly T[], index: number): T {
  return items[index] as T;
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return at(items, rng.roll(items.length) - 1);
}

/** A shuffled copy (Fisher-Yates on the run's dice), so that the first few are distinct by construction. */
function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = [...items];
  for (let last = copy.length - 1; last > 0; last -= 1) {
    const other = rng.roll(last + 1) - 1;
    [copy[last], copy[other]] = [at(copy, other), at(copy, last)];
  }
  return copy;
}

/** One of the two builds that suit a background; the one another hero of the round has not taken, if there is one. */
function buildFor(rng: Rng, background: Background, taken: readonly string[]): SkillPreset {
  const suited = BACKGROUND_BUILDS[background];
  const free = suited.filter((id) => !taken.includes(id));
  const id = pick(rng, free.length > 0 ? free : suited);
  // The ids come from the ready-made builds themselves (a test holds `BACKGROUND_BUILDS` to them), so one is there.
  return at(
    DETECTIVE_SKILL_PRESETS.filter((preset) => preset.id === id),
    0,
  );
}

/**
 * Three heroes for a run: three different backgrounds, each with a build that suits who they were (a different
 * one for each when the backgrounds allow it), so the choice is between kinds of detective and not between
 * three of one. Dice of their own, seeded from the run's seed and the
 * round, so asking again never moves any other roll of the run.
 */
export function offerHeroes(seed: string, round: number, locale: Locale): HeroOffer {
  const rng = createRng(`${seed}:tavern:${String(round)}`);
  const backgrounds = shuffled(rng, BACKGROUNDS);
  const taken: string[] = [];
  const surnames = shuffled(rng, SURNAMES);
  const candidate = (id: CandidateId, slot: number): HeroCandidate => {
    const gender = pick(rng, GENDERS);
    const signalId = pick(rng, SIGNALS);
    const background = at(backgrounds, slot);
    const build = buildFor(rng, background, taken);
    taken.push(build.id);
    const lifeState = pick(rng, LIFE_STATE_OPTIONS);
    const given = pick(rng, GIVEN[gender])[locale];
    const surname = at(surnames, slot)[locale];
    return {
      id,
      name: `${given} ${surname}`,
      gender,
      background,
      ...(lifeState === undefined ? {} : { lifeState }),
      build: build.id,
      skills: build.skills,
      ...(signalId === undefined ? {} : { signalId }),
    };
  };
  return [candidate('a', 0), candidate('b', 1), candidate('c', 2)];
}

/**
 * The first name of someone who matters to the hero (a partner, a family member): drawn from the invented
 * given names on dice of the run's own, so it is fictional, the same all the run and in both languages one
 * person. Never a surname, and never a name the narrator has to make up.
 */
export function companionName(seed: string, locale: Locale, role: string): string {
  const rng = createRng(`${seed}:companion:${role}`);
  return pick(rng, GIVEN[pick(rng, GENDERS)])[locale];
}

/** One hero of the offer by their id. */
export function offeredHero(seed: string, round: number, locale: Locale, id: CandidateId): HeroCandidate {
  const [a, b, c] = offerHeroes(seed, round, locale);
  return { a, b, c }[id];
}

/** The choices `assembleHero` takes, from a candidate; the player may give the hero another name. */
export function candidateHeroInput(candidate: HeroCandidate, name?: string) {
  return {
    name: name ?? candidate.name,
    gender: candidate.gender,
    archetype: 'detective' as const,
    background: candidate.background,
    ...(candidate.lifeState === undefined ? {} : { lifeState: candidate.lifeState }),
    skills: candidate.skills,
    ...(candidate.signalId === undefined ? {} : { signalId: candidate.signalId }),
  };
}
