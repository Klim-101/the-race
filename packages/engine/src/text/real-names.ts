// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// Russian inflects proper nouns ("Германия" → "в Германии"), so a long name in Cyrillic matches its stem plus a
// short case ending. Short names match whole words only, or "Ира" would flag "Ираклий". A name in any other
// script matches whole words only: English adds no case ending, and a few letters after a name are another word
// ("record" is not in "recording", "paris" is not in "parish").
const MIN_LENGTH_FOR_INFLECTION = 5;
const MAX_ENDING_LETTERS = 3;
const RUSSIAN_ENDING = /[аеиоуыэюяйь]+$/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;

/** Returns the first real-world name that appears in the text, or `undefined` when none does. */
export function findRealName(text: string, realNames: readonly string[]): string | undefined {
  const normalizedText = normalize(text);
  return realNames.find((name) => {
    const normalizedName = normalize(name.trim());
    return normalizedName.length > 0 && buildNamePattern(normalizedName).test(normalizedText);
  });
}

/**
 * The text with every occurrence of the name, inflected or not, replaced. The text is folded to NFKC first,
 * so the result is that folded text. `ё` and `е` are the same letter, as in `findRealName`. A name in Latin
 * letters is replaced as a whole word, unless `looseEndings` is set.
 */
export function replaceRealName(
  text: string,
  name: string,
  replacement: string,
  options: { readonly looseEndings?: boolean } = {},
): string {
  const normalizedName = normalize(name.trim());
  if (normalizedName.length === 0) return text;
  const pattern = buildNamePattern(normalizedName, options.looseEndings === true);
  const loose = new RegExp(pattern.source.replaceAll('е', '[её]'), 'giu');
  return text.normalize('NFKC').replace(loose, () => replacement);
}

/** `looseEndings` lets a name in any script take a few letters after it, to tell two near-equal names apart. */
function buildNamePattern(normalizedName: string, looseEndings = false): RegExp {
  const canInflect =
    normalizedName.length >= MIN_LENGTH_FOR_INFLECTION && (looseEndings || CYRILLIC.test(normalizedName));
  const stem = canInflect ? normalizedName.replace(RUSSIAN_ENDING, '') : normalizedName;
  const ending = canInflect ? `\\p{L}{0,${String(MAX_ENDING_LETTERS)}}` : '';
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(stem)}${ending}(?![\\p{L}\\p{N}])`, 'u');
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replaceAll('ё', 'е');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
