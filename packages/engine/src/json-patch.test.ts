// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { PatchOpSchema, applyPatch, toJsonPointer, type PatchOp } from './json-patch.js';

const DOCUMENT = {
  title: 'A case',
  clues: [
    { id: 'a', text: 'one' },
    { id: 'b', text: 'two' },
  ],
  truth: { culpritId: 'x', timeline: [] as unknown[] },
  'a/b': 1,
  'm~n': 2,
};

const apply = (...operations: PatchOp[]) => applyPatch(DOCUMENT, operations);
const documentOf = (...operations: PatchOp[]): unknown => {
  const result = apply(...operations);
  return result.ok ? result.document : result;
};
const refused = (...operations: PatchOp[]) => {
  const result = apply(...operations);
  return result.ok ? undefined : result;
};

describe('replace', () => {
  it('sets a key that exists, and an item of a list', () => {
    expect(documentOf({ op: 'replace', path: '/title', value: 'Another' })).toMatchObject({
      title: 'Another',
    });
    expect(documentOf({ op: 'replace', path: '/clues/1/text', value: 'changed' })).toMatchObject({
      clues: [{ text: 'one' }, { text: 'changed' }],
    });
    expect(documentOf({ op: 'replace', path: '/clues/0', value: null })).toMatchObject({
      clues: [null, { id: 'b' }],
    });
  });

  it('refuses a key or an item that is not there', () => {
    expect(refused({ op: 'replace', path: '/missing', value: 1 })?.reason).toMatch(/nothing at that path/);
    expect(refused({ op: 'replace', path: '/clues/2', value: 1 })?.reason).toMatch(/nothing at that path/);
    expect(refused({ op: 'replace', path: '/truth/timeline/0', value: 1 })?.reason).toMatch(/nothing/);
  });
});

describe('add', () => {
  it('creates a key, or sets one that exists', () => {
    expect(documentOf({ op: 'add', path: '/premise', value: 'p' })).toMatchObject({ premise: 'p' });
    expect(documentOf({ op: 'add', path: '/title', value: 'T' })).toMatchObject({ title: 'T' });
  });

  it('puts an item into a list before the place it names, at the end, or after the last with "-"', () => {
    const ids = (document: unknown) => (document as typeof DOCUMENT).clues.map(({ id }) => id);

    expect(ids(documentOf({ op: 'add', path: '/clues/0', value: { id: 'n' } }))).toEqual(['n', 'a', 'b']);
    expect(ids(documentOf({ op: 'add', path: '/clues/2', value: { id: 'n' } }))).toEqual(['a', 'b', 'n']);
    expect(ids(documentOf({ op: 'add', path: '/clues/-', value: { id: 'n' } }))).toEqual(['a', 'b', 'n']);
  });

  it('refuses a place past the end of a list, and a path whose parent is not there', () => {
    expect(refused({ op: 'add', path: '/clues/3', value: 1 })?.reason).toMatch(/nothing at that path/);
    expect(refused({ op: 'add', path: '/clues/x', value: 1 })?.reason).toMatch(/nothing at that path/);
    expect(refused({ op: 'add', path: '/nothing/deeper', value: 1 })?.reason).toMatch(/nothing at that path/);
  });

  it('takes a null, which is a value', () => {
    expect(documentOf({ op: 'add', path: '/nothing', value: null })).toMatchObject({ nothing: null });
  });
});

describe('remove', () => {
  it('drops a key, and an item of a list, so that the rest close up', () => {
    expect(documentOf({ op: 'remove', path: '/title' })).not.toHaveProperty('title');
    expect(documentOf({ op: 'remove', path: '/clues/0' })).toMatchObject({ clues: [{ id: 'b' }] });
  });

  it('refuses what is not there, and an item of a list that is empty', () => {
    expect(refused({ op: 'remove', path: '/missing' })?.reason).toMatch(/nothing at that path/);
    expect(refused({ op: 'remove', path: '/clues/2' })?.reason).toMatch(/nothing at that path/);
    expect(refused({ op: 'remove', path: '/truth/timeline/0' })?.reason).toMatch(/nothing at that path/);
  });
});

describe('a path', () => {
  it('reads the escapes of a key: ~1 is a slash and ~0 a tilde', () => {
    expect(documentOf({ op: 'replace', path: '/a~1b', value: 9 })).toMatchObject({ 'a/b': 9 });
    expect(documentOf({ op: 'replace', path: '/m~0n', value: 9 })).toMatchObject({ 'm~n': 9 });
  });

  it('names an item of a list by a plain number only', () => {
    expect(refused({ op: 'replace', path: '/clues/01', value: 1 })).toBeDefined();
    expect(refused({ op: 'replace', path: '/clues/-1', value: 1 })).toBeDefined();
    expect(refused({ op: 'replace', path: '/clues/1.5', value: 1 })).toBeDefined();
    // Also on the way to a place, not only at the place.
    expect(refused({ op: 'replace', path: '/clues/x/text', value: 1 })?.reason).toMatch(/nothing/);
    expect(refused({ op: 'replace', path: '/clues/5/text', value: 1 })?.reason).toMatch(/nothing/);
  });

  it('may end in an empty key, which is a key like any other', () => {
    expect(documentOf({ op: 'add', path: '/', value: 1 })).toMatchObject({ '': 1 });
  });

  it('is refused when it names the whole case, does not start with a slash, or is a key that would change the prototype', () => {
    expect(refused({ op: 'replace', path: '', value: {} })?.reason).toMatch(/whole case/);
    expect(refused({ op: 'replace', path: 'title', value: 'x' })?.reason).toMatch(/starts with "\/"/);
    expect(refused({ op: 'add', path: '/__proto__', value: { polluted: true } })?.reason).toMatch(
      /not allowed/,
    );
    expect(refused({ op: 'add', path: '/truth/__proto__/x', value: 1 })?.reason).toMatch(/not allowed/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('goes through a value that is not an object or a list, as through nothing', () => {
    expect(refused({ op: 'replace', path: '/title/x', value: 1 })?.reason).toMatch(/nothing at that path/);
    expect(refused({ op: 'add', path: '/truth/culpritId/x', value: 1 })?.reason).toMatch(/nothing/);
    const withNull = applyPatch({ a: null }, [{ op: 'add', path: '/a/b', value: 1 }]);
    expect(withNull.ok).toBe(false);
  });

  it('takes a key of the object only if the object has it itself, not from its prototype', () => {
    expect(refused({ op: 'replace', path: '/constructor', value: 1 })?.reason).toMatch(
      /nothing at that path/,
    );
    expect(refused({ op: 'remove', path: '/toString' })?.reason).toMatch(/nothing at that path/);
    expect(refused({ op: 'replace', path: '/constructor/name', value: 1 })?.reason).toMatch(/nothing/);
  });
});

describe('a patch of several operations', () => {
  it('applies them in order, each to what the one before made', () => {
    const result = documentOf(
      { op: 'add', path: '/clues/-', value: { id: 'c', text: 'three' } },
      { op: 'replace', path: '/clues/2/text', value: 'THREE' },
      { op: 'remove', path: '/clues/0' },
    );

    expect(result).toMatchObject({
      clues: [
        { id: 'b', text: 'two' },
        { id: 'c', text: 'THREE' },
      ],
    });
  });

  it('applies all or none: the first one that fails is named, and nothing is changed', () => {
    const before = structuredClone(DOCUMENT);

    const result = refused(
      { op: 'replace', path: '/title', value: 'Changed' },
      { op: 'remove', path: '/clues/0' },
      { op: 'replace', path: '/missing', value: 1 },
      { op: 'remove', path: '/title' },
    );

    expect(result).toMatchObject({
      ok: false,
      index: 2,
      operation: { op: 'replace', path: '/missing', value: 1 },
    });
    expect(DOCUMENT).toEqual(before);
  });

  it('never changes the document it was given, and the result shares nothing with it', () => {
    const before = structuredClone(DOCUMENT);

    const result = apply({ op: 'replace', path: '/clues/0/text', value: 'x' });

    expect(DOCUMENT).toEqual(before);
    expect(result.ok && result.document !== DOCUMENT).toBe(true);
  });

  it('is the document itself when there is nothing to do', () => {
    expect(documentOf()).toEqual(DOCUMENT);
  });
});

describe('the schema of an operation', () => {
  it('takes the three operations, with a value where one is needed', () => {
    expect(PatchOpSchema.safeParse({ op: 'add', path: '/a', value: 1 }).success).toBe(true);
    expect(PatchOpSchema.safeParse({ op: 'replace', path: '/a', value: null }).success).toBe(true);
    expect(PatchOpSchema.safeParse({ op: 'remove', path: '/a' }).success).toBe(true);
  });

  it('refuses another operation, a missing path and a field that is not one', () => {
    for (const bad of [
      { op: 'move', from: '/a', path: '/b' },
      { op: 'copy', from: '/a', path: '/b' },
      { op: 'test', path: '/a', value: 1 },
      { op: 'remove' },
      { op: 'remove', path: '/a', value: 1 },
      // A value is needed, and null is one; nothing at all is not.
      { op: 'add', path: '/a' },
      { op: 'replace', path: '/a' },
      { op: 'add', path: '/a', value: undefined },
      { path: '/a' },
      'remove /a',
    ])
      expect(PatchOpSchema.safeParse(bad).success).toBe(false);
  });
});

describe('the path of an issue as a pointer', () => {
  it.each([
    ['', ''],
    ['locations', '/locations'],
    ['clues[3].description', '/clues/3/description'],
    ['locations.2.id', '/locations/2/id'],
    ['suspects[0].lies[1].brokenBy[0]', '/suspects/0/lies/1/brokenBy/0'],
    ['solution.evidenceChains', '/solution/evidenceChains'],
    ['a/b.m~n', '/a~1b/m~0n'],
    ['/clues/3/description', '/clues/3/description'],
  ])('turns %j into %j', (path, pointer) => {
    expect(toJsonPointer(path)).toBe(pointer);
  });

  it('gives a pointer that finds the very place a path names', () => {
    const path = 'clues[1].text';
    const result = applyPatch(DOCUMENT, [{ op: 'replace', path: toJsonPointer(path), value: 'fixed' }]);

    expect(result.ok && (result.document as typeof DOCUMENT).clues[1]?.text).toBe('fixed');
  });
});
