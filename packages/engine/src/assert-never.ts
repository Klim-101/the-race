// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

/** Marks the unreachable default of an exhaustive switch; fails to compile when a case is missing. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
