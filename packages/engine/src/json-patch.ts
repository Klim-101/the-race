// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

// The subset of JSON Patch (RFC 6902) a case generator needs to fix what the engine rejected: `add`, `remove` and
// `replace` on JSON Pointers (RFC 6901). `move`, `copy` and `test` are left out: a fix names the thing it changes.

export const PatchOpSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('add'), path: z.string(), value: z.json() }),
  z.strictObject({ op: z.literal('replace'), path: z.string(), value: z.json() }),
  z.strictObject({ op: z.literal('remove'), path: z.string() }),
]);
export type PatchOp = z.infer<typeof PatchOpSchema>;

export type PatchResult =
  | { readonly ok: true; readonly document: unknown }
  | {
      readonly ok: false;
      /** The place of the operation that did not apply, from 0, and the operation itself. */
      readonly index: number;
      readonly operation: PatchOp;
      readonly reason: string;
    };

const ARRAY_INDEX = /^(?:0|[1-9]\d*)$/;

/** An object or a list. Every use below tests for a list first, so what is left is an object. */
const isContainer = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The place in an array a token names, or `undefined` for a token that is not a plain index. */
const indexOf = (token: string): number | undefined => (ARRAY_INDEX.test(token) ? Number(token) : undefined);

/** The pointer as its tokens, or the reason it cannot be used. */
function parsePointer(path: string): readonly string[] | string {
  if (path === '') return 'a patch cannot replace the whole case: send the case itself';
  if (!path.startsWith('/')) return 'the path must be a JSON Pointer, which starts with "/"';
  const tokens = path
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
  // Assigning to this key would change the prototype of the object and not add a key.
  return tokens.includes('__proto__') ? 'the path names a key that is not allowed' : tokens;
}

function childOf(node: unknown, token: string): unknown {
  if (Array.isArray(node)) {
    const index = indexOf(token);
    return index === undefined ? undefined : node[index];
  }
  return isContainer(node) && Object.hasOwn(node, token) ? node[token] : undefined;
}

const NO_SUCH_PATH = 'there is nothing at that path';

/** Applies one operation to the document in place, and says why it did not apply, or nothing. */
function applyOp(root: unknown, op: PatchOp): string | undefined {
  const tokens = parsePointer(op.path);
  if (typeof tokens === 'string') return tokens;
  // A pointer that starts with "/" always has a last token, so this joins exactly one.
  const last = tokens.slice(-1).join('');
  const parent = tokens.slice(0, -1).reduce(childOf, root);

  if (Array.isArray(parent)) {
    if (op.op === 'add' && last === '-') {
      parent.push(op.value);
      return undefined;
    }
    const index = indexOf(last);
    // A new item may go in at the end of the list; replacing or removing needs an item there.
    const limit = op.op === 'add' ? parent.length : parent.length - 1;
    if (index === undefined || index > limit) return NO_SUCH_PATH;
    if (op.op === 'add') parent.splice(index, 0, op.value);
    else if (op.op === 'replace') parent[index] = op.value;
    else parent.splice(index, 1);
    return undefined;
  }
  if (!isContainer(parent)) return NO_SUCH_PATH;
  if (op.op === 'add') {
    parent[last] = op.value;
    return undefined;
  }
  if (!Object.hasOwn(parent, last)) return NO_SUCH_PATH;
  if (op.op === 'replace') parent[last] = op.value;
  else Reflect.deleteProperty(parent, last);
  return undefined;
}

/**
 * Applies the operations in order to a copy of the document. All of them apply or none does: the first one that does
 * not stops the patch and the document is left as it was.
 */
export function applyPatch(document: unknown, operations: readonly PatchOp[]): PatchResult {
  const copy: unknown = structuredClone(document);
  for (const [index, op] of operations.entries()) {
    const reason = applyOp(copy, op);
    if (reason !== undefined) return { ok: false, index, operation: op, reason };
  }
  return { ok: true, document: copy };
}

/**
 * The path of an issue (`clues[3].description`, or `locations.2.id` from the schema) as a JSON Pointer
 * (`/clues/3/description`), so that a generator can patch the very place it was told about.
 */
export function toJsonPointer(path: string): string {
  if (path === '') return '';
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((token) => `/${token.replaceAll('~', '~0').replaceAll('/', '~1')}`)
    .join('');
}
