// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { isDay, shiftDay } from './day.js';

describe('isDay', () => {
  it('accepts a real day and refuses anything else', () => {
    expect(isDay('2026-10-31')).toBe(true);
    expect(isDay('2024-02-29')).toBe(true);
    expect(isDay('2026-02-29')).toBe(false);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay('31-10-2026')).toBe(false);
    expect(isDay('')).toBe(false);
  });
});

describe('shiftDay', () => {
  it('goes back across months and years, and forward when negative', () => {
    expect(shiftDay('2026-10-31', 0)).toBe('2026-10-31');
    expect(shiftDay('2026-10-31', 1)).toBe('2026-10-30');
    expect(shiftDay('2026-03-01', 1)).toBe('2026-02-28');
    expect(shiftDay('2026-01-01', 1)).toBe('2025-12-31');
    expect(shiftDay('2026-10-31', -1)).toBe('2026-11-01');
  });

  it('refuses text that is not a day', () => {
    expect(() => shiftDay('yesterday', 1)).toThrow(RangeError);
  });
});
