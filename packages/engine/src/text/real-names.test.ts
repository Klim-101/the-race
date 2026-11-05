// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { findRealName, replaceRealName } from './real-names.js';

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

  it('matches a name in Latin letters as a whole word, so an ordinary word that begins with it is not a name', () => {
    expect(findRealName('The recording was lost.', ['Record'])).toBeUndefined();
    expect(findRealName('A pressure gauge.', ['Press'])).toBeUndefined();
    expect(findRealName('A parish register.', ['Paris'])).toBeUndefined();
    expect(findRealName('Records of the Press.', ['Press'])).toBe('Press');
    expect(findRealName("Washington's office.", ['Washington'])).toBe('Washington');
  });

  it('still reads a Russian name with its ending, and a Latin name inside Russian text as a whole word', () => {
    expect(findRealName('Они приехали из Германии.', ['Германия'])).toBe('Германия');
    expect(findRealName('Акции Apple упали.', ['Apple'])).toBe('Apple');
    expect(findRealName('Запись яблока.', ['Яблоко'])).toBe('Яблоко');
  });

  it('escapes names with regular expression characters', () => {
    expect(findRealName('Shares of A.B.C. fell.', ['A.B.C.'])).toBe('A.B.C.');
    expect(findRealName('Shares of AxBxCx fell.', ['A.B.C.'])).toBeUndefined();
  });

  it('ignores blank names', () => {
    expect(findRealName('Anything at all.', ['  '])).toBeUndefined();
  });
});

describe('replaceRealName', () => {
  it('replaces an inflected name, whatever its case and ё', () => {
    expect(replaceRealName('Пётр у Королёва и КОРОЛЕВ', 'Королёв', 'Икс')).toBe('Пётр у Икс и Икс');
  });

  it('leaves a text without the name, and a blank name, alone', () => {
    expect(replaceRealName('Ничего', 'Германия', 'Икс')).toBe('Ничего');
    expect(replaceRealName('Ничего', '  ', 'Икс')).toBe('Ничего');
  });

  it('replaces a name in Latin letters as a whole word only', () => {
    expect(replaceRealName('Record sales and a recording', 'Record', 'Zed')).toBe(
      'Zed sales and a recording',
    );
  });

  it('takes a few letters more of a name in Latin letters only when asked, to tell near-equal names apart', () => {
    expect(replaceRealName('Valdmarks', 'Valdmark', '', { looseEndings: true })).toBe('');
    expect(replaceRealName('Valdmarks', 'Valdmark', '')).toBe('Valdmarks');
  });

  it('does not read the replacement as a pattern', () => {
    expect(replaceRealName('Norway talks', 'Norway', '$&$&')).toBe('$&$& talks');
  });
});
