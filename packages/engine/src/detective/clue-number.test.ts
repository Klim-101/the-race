// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { clueNumber } from './clue-number.js';

describe('the number of a clue', () => {
  it('is the surname in capitals and the order of finding in two digits', () => {
    expect(clueNumber('Tony Kesvik', 0)).toBe('KESVIK-01');
    expect(clueNumber('Тони Кесвик', 2)).toBe('КЕСВИК-03');
    expect(clueNumber('Mira Ann Dole-Rask', 11)).toBe('DOLE-RASK-12');
  });

  it('uses a single name whole, and grows past ninety-nine', () => {
    expect(clueNumber('Mira', 4)).toBe('MIRA-05');
    expect(clueNumber('  Mira  Dole ', 99)).toBe('DOLE-100');
    expect(clueNumber('', 0)).toBe('-01');
  });
});
