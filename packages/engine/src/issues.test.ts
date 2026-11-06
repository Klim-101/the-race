// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SHARED_ISSUE_CODES, schemaIssues, sortIssuesBy, type Issue } from './issues.js';

const issue = (code: string, path = 'p'): Issue => ({ code, path, message: 'm' });

describe('the codes every archetype shares', () => {
  it('name no code twice', () => {
    expect(new Set(SHARED_ISSUE_CODES).size).toBe(SHARED_ISSUE_CODES.length);
  });

  it('are the ones of a case that does not parse, a patch, a blank text, a reference, the language and a real name', () => {
    expect([...SHARED_ISSUE_CODES].sort()).toEqual(
      [
        'duplicate-id',
        'locale-mismatch',
        'patch-failed',
        'real-name',
        'schema',
        'text-missing',
        'unknown-reference',
        'wrong-language',
        'wrong-script',
      ].sort(),
    );
  });
});

describe('sorting issues by the list of an archetype', () => {
  const order = ['first', 'second', 'third'];

  it('puts the code that comes first in the list first, whatever order the issues came in', () => {
    const sorted = sortIssuesBy(order, [issue('third'), issue('first'), issue('second')]);

    expect(sorted.map(({ code }) => code)).toEqual(['first', 'second', 'third']);
  });

  it('keeps the issues of one code in the order they came in', () => {
    const sorted = sortIssuesBy(order, [issue('second', 'b'), issue('first', 'x'), issue('second', 'a')]);

    expect(sorted.map(({ code, path }) => `${code} ${path}`)).toEqual(['first x', 'second b', 'second a']);
  });

  it('leaves the list it was given as it was, and gives nothing for nothing', () => {
    const given = [issue('third'), issue('first')];

    sortIssuesBy(order, given);

    expect(given.map(({ code }) => code)).toEqual(['third', 'first']);
    expect(sortIssuesBy(order, [])).toEqual([]);
  });

  it('uses the list it is given, so that two archetypes may order the same codes differently', () => {
    const issues = [issue('a'), issue('b')];

    expect(sortIssuesBy(['a', 'b'], issues).map(({ code }) => code)).toEqual(['a', 'b']);
    expect(sortIssuesBy(['b', 'a'], issues).map(({ code }) => code)).toEqual(['b', 'a']);
  });
});

describe('the issues of a schema', () => {
  it('are one issue of the code `schema` for each problem, with the path joined by dots', () => {
    const result = z.object({ list: z.array(z.object({ id: z.string().min(2) })) }).safeParse({
      list: [{ id: 'x' }, { id: 5 }],
    });

    expect(result.success).toBe(false);
    expect(result.success ? [] : schemaIssues(result.error.issues)).toMatchObject([
      { code: 'schema', path: 'list.0.id' },
      { code: 'schema', path: 'list.1.id' },
    ]);
  });
});
