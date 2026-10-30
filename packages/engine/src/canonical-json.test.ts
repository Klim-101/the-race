// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from './canonical-json.js';

describe('canonicalJson', () => {
  it('sorts keys at every depth and leaves arrays in order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1, 2], c: null } })).toBe('{"a":{"c":null,"d":[3,1,2]},"b":1}');
  });

  it('gives one text for the same data written in any key order', () => {
    expect(canonicalJson({ x: 1, y: { p: true, q: 'z' } })).toBe(
      canonicalJson({ y: { q: 'z', p: true }, x: 1 }),
    );
  });

  it('is the text of what is read back after a trip through JSON', () => {
    const value = { title: 'Сыр «Ёлка» 🧀', n: [1.5, -2, 0], nested: { ok: false } };

    expect(canonicalJson(JSON.parse(JSON.stringify(value)) as unknown)).toBe(canonicalJson(value));
  });

  it('writes strings with JSON escapes and handles every scalar', () => {
    expect(canonicalJson('a"b\n')).toBe('"a\\"b\\n"');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(-0)).toBe('0');
    expect(canonicalJson([])).toBe('[]');
    expect(canonicalJson({})).toBe('{}');
  });

  it('sorts keys by code point, not by locale', () => {
    expect(canonicalJson({ b: 1, B: 2, a: 3, ä: 4 })).toBe('{"B":2,"a":3,"b":1,"ä":4}');
  });

  it('refuses what JSON has no text for', () => {
    expect(() => canonicalJson(undefined)).toThrow(RangeError);
    expect(() => canonicalJson({ a: undefined })).toThrow(RangeError);
    expect(() => canonicalJson(() => 1)).toThrow(RangeError);
    expect(() => canonicalJson(Number.NaN)).toThrow(RangeError);
    expect(() => canonicalJson([Number.POSITIVE_INFINITY])).toThrow(RangeError);
  });
});

describe('sha256Hex', () => {
  it('matches the known digests of the UTF-8 bytes', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('digests the UTF-8 bytes of non-ASCII text', () => {
    const digest = (bytes: number[]): string => createHash('sha256').update(Buffer.from(bytes)).digest('hex');

    expect(sha256Hex('é')).toBe(digest([0xc3, 0xa9]));
    expect(sha256Hex('é')).not.toBe(digest([0xe9]));
  });
});
