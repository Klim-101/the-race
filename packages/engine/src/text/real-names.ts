// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// Russian inflects proper nouns ("Германия" → "в Германии"), so a long name matches its stem plus a
// short case ending. Short names match whole words only, or "Ира" would flag "Ираклий".
const MIN_LENGTH_FOR_INFLECTION = 5;
const MAX_ENDING_LETTERS = 3;
const RUSSIAN_ENDING = /[аеиоуыэюяйь]+$/u;

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
 * so the result is that folded text. `ё` and `е` are the same letter, as in `findRealName`.
 */
export function replaceRealName(text: string, name: string, replacement: string): string {
  const normalizedName = normalize(name.trim());
  if (normalizedName.length === 0) return text;
  const pattern = buildNamePattern(normalizedName);
  const loose = new RegExp(pattern.source.replaceAll('е', '[её]'), 'giu');
  return text.normalize('NFKC').replace(loose, () => replacement);
}

function buildNamePattern(normalizedName: string): RegExp {
  const canInflect = normalizedName.length >= MIN_LENGTH_FOR_INFLECTION;
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
