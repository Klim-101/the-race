// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { LOCALES, type Locale } from '../locale.js';

/**
 * A deterministic language check built on common function words; it uses no model and no network.
 *
 * What it can tell: a text of enough words that is plainly written in another language than the run's
 * (Spanish, German, French or Italian prose in an English run, or one locale's prose in another's).
 * What it cannot tell: closely related languages that share most function words, dialects, a text mixed
 * from several languages, or a language that has no profile here. It only rejects a text when another
 * language's function words clearly outweigh the run's own, so a text full of fictional proper nouns
 * (which match no profile) is never rejected. Missing a wrong-language text is accepted; rejecting a
 * right one is not.
 *
 * Every locale must have a profile (the type enforces it); the reference languages exist only so that
 * texts in them are recognised and never become a run language.
 */
const LOCALE_PROFILES: Readonly<Record<Locale, string>> = {
  en: 'the of and to in is was were it that with for as on at by this his her their from have has had not but be are an or which who she he they we you there been would could into than then them its what when out up about over after before while because',
  ru: 'и в не на что он она они я с как это по но из за от все его ее их то так же для бы был была были было мы вы мне ему ей до при или если только уже еще ни да нет когда который которая которые чтобы этот эта эти там тут был под над без через потому себя свой ничего никто него нее их',
};

const REFERENCE_PROFILES: Readonly<Record<string, string>> = {
  es: 'el la los las de del que y en un una por con para es no se su al lo como más pero sus le ya o fue este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante estaba noche había',
  de: 'der die das und ist nicht ein eine einen einem einer den dem des mit von zu auf für im sich auch es dass als wie nach bei aus er sie wir ihr war wurde wird sind aber nur noch wenn oder um über vor durch hatte haben diese dieser',
  fr: 'le la les des du de un une et ne a ont pendant personne rien est en que qui dans pour pas sur au aux avec ce cette ces il elle ils elles nous vous je tu se sa son ses leur mais ou où par plus comme tout fait être avait sans sous chez entre très était nuit',
  it: 'il lo la gli le di del della dei delle che e un una per con non si su da come più ma sono era questo questa nel nella alla al suo sua loro ha hanno anche quando senza sotto molto tra fra notte stato',
};

const MIN_WORDS_TO_JUDGE = 6;
const MIN_FOREIGN_HITS = 3;
const FOREIGN_TO_OWN_RATIO = 2;
const WORD = /\p{L}+/gu;

function toWords(profile: string): string[] {
  return profile.split(' ');
}

const PROFILES: ReadonlyMap<string, ReadonlySet<string>> = buildProfiles();

// A word shared by two languages ("in", "a", "no") says nothing about which one the text is in.
function buildProfiles(): Map<string, Set<string>> {
  const raw = new Map<string, string[]>([
    ...LOCALES.map((locale): [string, string[]] => [locale, toWords(LOCALE_PROFILES[locale])]),
    ...Object.entries(REFERENCE_PROFILES).map(([language, words]): [string, string[]] => [
      language,
      toWords(words),
    ]),
  ]);
  const owners = new Map<string, number>();
  for (const words of raw.values()) {
    for (const word of new Set(words)) owners.set(word, (owners.get(word) ?? 0) + 1);
  }
  return new Map(
    [...raw].map(([language, words]) => [language, new Set(words.filter((word) => owners.get(word) === 1))]),
  );
}

/** The function words of the locale's language; exposed so a test can check every locale has a profile. */
export function localeStopwords(locale: Locale): string[] {
  return toWords(LOCALE_PROFILES[locale]);
}

/**
 * Whether the text is clearly not in the locale's language: another language's function words
 * outnumber the locale's own by a wide margin. Short texts are never judged.
 */
export function isClearlyOtherLanguage(text: string, locale: Locale): boolean {
  const words = [...text.toLowerCase().matchAll(WORD)].map((match) => match[0]);
  if (words.length < MIN_WORDS_TO_JUDGE) return false;
  let ownHits = 0;
  let foreignHits = 0;
  for (const [language, stopwords] of PROFILES) {
    const hits = words.filter((word) => stopwords.has(word)).length;
    if (language === locale) ownHits = hits;
    else foreignHits = Math.max(foreignHits, hits);
  }
  return foreignHits >= MIN_FOREIGN_HITS && foreignHits > ownHits * FOREIGN_TO_OWN_RATIO;
}
