// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

/** One way a language's file differs from the reference language's, at a key such as `tabs.map.title`. */
export interface LocaleProblem {
  readonly kind: 'missing' | 'extra' | 'empty' | 'placeholders';
  readonly path: string;
}

/** Every path to a string in a locale, such as `tabs.map.title`, with the string, in the order of the file. */
export function leaves(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  return Object.entries(node as object).flatMap(([key, child]) =>
    leaves(child, path === '' ? key : `${path}.${key}`),
  );
}

/** The `{name}` places in a text, sorted: what the code fills in, and so what every language must keep. */
const placeholders = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).sort();

/**
 * What is wrong with a language's file against the reference language's: a key it lacks, a key the reference
 * lacks, a text left empty, a text that fills in other places than the reference's. Empty when it is complete.
 */
export function compareLocale(reference: unknown, own: unknown): LocaleProblem[] {
  const expected = new Map(leaves(reference));
  const actual = new Map(leaves(own));
  const problems: LocaleProblem[] = [];
  for (const [path, text] of expected) {
    const found = actual.get(path);
    if (found === undefined) problems.push({ kind: 'missing', path });
    else if (found.trim() === '') problems.push({ kind: 'empty', path });
    else if (placeholders(found).join() !== placeholders(text).join()) {
      problems.push({ kind: 'placeholders', path });
    }
  }
  for (const path of actual.keys()) if (!expected.has(path)) problems.push({ kind: 'extra', path });
  return problems;
}
