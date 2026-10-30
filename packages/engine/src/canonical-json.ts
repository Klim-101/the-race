// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';

/**
 * One text for one value: object keys sorted by code point, no whitespace, arrays in order. Two values
 * that are equal as data give the same text, whatever order their keys were written in, so the text of
 * a value read back from a file is byte for byte the text of the value that was written.
 *
 * It takes plain JSON data. A value JSON has no text for (`undefined`, a function, a number that is
 * not finite) is refused instead of being quietly left out.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new RangeError('JSON has no text for a number that is not finite.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item: unknown) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  throw new RangeError(`JSON has no text for a value of type ${typeof value}.`);
}

/** SHA-256 of the UTF-8 bytes of a text, as 64 lower-case hex digits. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
