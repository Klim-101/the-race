// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { findRealName } from './real-names.js';

describe('findRealName', () => {
  it('finds a name regardless of case', () => {
    expect(findRealName('Talks with NORWAY stalled.', ['Norway'])).toBe('Norway');
  });

  it('finds an inflected Russian name', () => {
    expect(findRealName('Переговоры в Германии сорваны.', ['Германия'])).toBe('Германия');
    expect(findRealName('Санкции против Норвегией', ['Норвегия'])).toBe('Норвегия');
  });

  it('treats ё and е as the same letter', () => {
    expect(findRealName('Пётр Королев', ['Королёв'])).toBe('Королёв');
  });

  it('matches a short name only as a whole word', () => {
    expect(findRealName('Ираклий пришёл', ['Ира'])).toBeUndefined();
    expect(findRealName('Пришла Ира', ['Ира'])).toBe('Ира');
  });

  it('does not match a long name inside a longer unrelated word', () => {
    expect(findRealName('Germanicus was a general.', ['German'])).toBeUndefined();
  });

  it('escapes names with regular expression characters', () => {
    expect(findRealName('Shares of A.B.C. fell.', ['A.B.C.'])).toBe('A.B.C.');
    expect(findRealName('Shares of AxBxCx fell.', ['A.B.C.'])).toBeUndefined();
  });

  it('ignores blank names', () => {
    expect(findRealName('Anything at all.', ['  '])).toBeUndefined();
  });
});
