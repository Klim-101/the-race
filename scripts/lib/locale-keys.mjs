// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// The work file of a translation: every text of the English locale with a place for its translation, so that a
// contributor can translate it with whatever tool they like, outside this repository, and bring the result back. Nothing
// here translates, and nothing here calls out: it only lays the keys out and checks what comes back.

/** Every path to a string in a nested locale, such as `tabs.map.title`, with the string, in the order of the file. */
export function flatten(node, path = '') {
  if (typeof node === 'string') return [[path, node]];
  return Object.entries(node).flatMap(([key, child]) => flatten(child, path === '' ? key : `${path}.${key}`));
}

/** The nested locale with the shape and the key order of `shape`, filled from a flat map of paths to texts. */
export function unflatten(shape, flat, path = '') {
  if (typeof shape === 'string') return flat.get(path) ?? '';
  return Object.fromEntries(
    Object.entries(shape).map(([key, child]) => [
      key,
      unflatten(child, flat, path === '' ? key : `${path}.${key}`),
    ]),
  );
}

const placeholdersOf = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join();

/**
 * The work file for a language: each key of `english` with its English text, the translation (what a language that
 * already has the key says, else empty) and whether a human has reviewed it. A key already translated in a
 * committed file is counted as reviewed; a new one is not until the contributor says so.
 */
export function buildWorkFile(locale, english, existing) {
  const have = new Map(existing === undefined ? [] : flatten(existing));
  return {
    locale,
    note:
      'Fill in "text" for every key, keeping every {placeholder} as it is. Set "reviewed" to true only for a text ' +
      `a person who reads the language has checked. Then run: npm run locale:keys -- import ${locale}`,
    keys: Object.fromEntries(
      flatten(english).map(([path, source]) => [
        path,
        { en: source, text: have.get(path) ?? '', reviewed: have.has(path) },
      ]),
    ),
  };
}

/**
 * What the work file brings back: the nested locale, the keys no one has reviewed, and the problems that stop it
 * being written (a key left empty, a key the English locale does not have, a changed set of placeholders).
 */
export function readWorkFile(work, english) {
  const source = new Map(flatten(english));
  const problems = [];
  const texts = new Map();
  const unreviewed = [];
  for (const path of Object.keys(work.keys)) {
    if (!source.has(path)) problems.push(`${path}: not a key of the English locale`);
  }
  for (const [path, englishText] of source) {
    const entry = work.keys[path];
    if (entry === undefined) {
      problems.push(`${path}: missing from the work file`);
    } else if (entry.text.trim() === '') {
      problems.push(`${path}: no translation`);
    } else if (placeholdersOf(entry.text) !== placeholdersOf(englishText)) {
      problems.push(`${path}: the placeholders differ from the English text`);
    } else {
      texts.set(path, entry.text);
      if (entry.reviewed !== true) unreviewed.push(path);
    }
  }
  return { locale: unflatten(english, texts), unreviewed, problems };
}
