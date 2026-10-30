// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale } from '../locale.js';

// A random event is a small trouble, never a harm. This is a deliberately simple check, a denylist of
// words of violence and death in each language, and it catches the plain cases only. The generator's
// own rule, that no event may hurt or kill anyone, is what keeps the rest out; the vocabulary of effects
// is closed, so no effect can do it either.

// Each entry is a stem that may take any ending: `kill` also catches "killed". Words that are only the
// start of a harmless one ("dead" in "deadline") are written out whole in WHOLE_WORDS instead.
const STEMS: Readonly<Record<Locale, readonly string[]>> = {
  en: [
    'kill',
    'murder',
    'slain',
    'slay',
    'corpse',
    'bloodshed',
    'blood',
    'gunshot',
    'gunfire',
    'shooting',
    'wound',
    'assault',
    'massacre',
    'hostage',
    'strangl',
    'suicid',
    'bomb',
    'explosion',
  ],
  ru: [
    'убий',
    'убил',
    'убит',
    'убив',
    'убью',
    'смерт',
    'мертв',
    'мёртв',
    'умер',
    'погиб',
    'кровав',
    'кровотеч',
    'кровь',
    'крови',
    'зарезан',
    'застрел',
    'расстрел',
    'ранен',
    'ранил',
    'нападен',
    'избит',
    'заложник',
    'самоубий',
    'взрыв',
  ],
};

const WHOLE_WORDS: Readonly<Record<Locale, readonly string[]>> = {
  en: [
    'dead',
    'death',
    'deaths',
    'die',
    'dies',
    'died',
    'dying',
    'shot',
    'shoot',
    'gun',
    'guns',
    'shotgun',
    'stab',
    'stabs',
    'stabbed',
    'stabbing',
  ],
  ru: ['труп', 'трупа', 'трупу', 'трупом', 'трупы', 'трупов'],
};

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The first word of violence or death in a text, or `undefined` if there is none. */
export function findViolence(text: string, locale: Locale): string | undefined {
  const stems = STEMS[locale].map(escape).join('|');
  const whole = WHOLE_WORDS[locale].map(escape).join('|');
  const pattern = `(?<![\\p{L}])(?:${stems})[\\p{L}]*|(?<![\\p{L}])(?:${whole})(?![\\p{L}])`;
  return new RegExp(pattern, 'iu').exec(text)?.[0];
}
