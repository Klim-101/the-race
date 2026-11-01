// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * The short name of a clue the player can say: the hero's surname in capitals and the two-digit place of the
 * clue in the order the hero found it (`KESVIK-03`). A hero with one name uses it whole. It is made from the
 * order of finding, which is already in the run's history, so it never changes and never says what a clue is.
 * `index` is the clue's place in the finds, counted from zero.
 */
export function clueNumber(heroName: string, index: number): string {
  const words = heroName.split(/\s+/).filter((word) => word !== '');
  const surname = (words[words.length - 1] ?? heroName).toUpperCase();
  return `${surname}-${String(index + 1).padStart(2, '0')}`;
}
