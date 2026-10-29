// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { assertNever } from './assert-never.js';

describe('assertNever', () => {
  it('throws with the unexpected value', () => {
    expect(() => assertNever('surprise' as never)).toThrow('Unexpected value: "surprise"');
  });
});
