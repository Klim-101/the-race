// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { extractRealNames } from './extract-names.js';
import { findRealName } from './real-names.js';
import { transliterate } from './transliterate.js';

describe('extractRealNames', () => {
  it('takes a capitalised word in the middle of a sentence, in either language', () => {
    expect(extractRealNames(['Грузовики встали в Берлине', 'Trucks stalled outside Berlin'])).toEqual(
      expect.arrayContaining(['берлине', 'berlin']),
    );
  });

  it('takes a name that opens a sentence only when a verb of speech follows', () => {
    expect(extractRealNames(['Путин заявил, что порт закроют'])).toContain('путин');
    expect(extractRealNames(['Putin says the port will close'])).toContain('putin');
    expect(extractRealNames(['Цены упали', 'Storm hits the coast'])).toEqual([]);
  });

  it('takes a run of capitalised words whole and by part, without the heads of offices', () => {
    const names = extractRealNames(['Президент Иванов заявил о ставке', 'Банк России объявил о ставке']);

    expect(names).toEqual(expect.arrayContaining(['президент иванов', 'иванов', 'банк россии', 'россии']));
    expect(names).not.toContain('президент');
    expect(names).not.toContain('банк');
  });

  it('does not take a sentence-opening common word that only stands before a name', () => {
    const names = extractRealNames(['Сегодня Москва закрыла порт', 'Today Moscow closed the port']);

    expect(names).toEqual(expect.arrayContaining(['москва', 'moscow']));
    expect(names).not.toContain('сегодня');
    expect(names).not.toContain('today');
    // Without a verb of speech, the first name of a run that opens a sentence is given up.
    expect(extractRealNames(['Иван Петров открыл выставку'])).not.toContain('иван');
  });

  it('starts a sentence after punctuation, a quote or a dash', () => {
    expect(extractRealNames(['Минфин: Цены вырастут', 'Он сказал: «Погода» — дрянь'])).toEqual([]);
  });

  it('takes acronyms except the common ones, and leaves days, months and titles', () => {
    expect(extractRealNames(['NATO and ЕС agree as GDP and ВВП grow'])).toEqual(
      expect.arrayContaining(['nato', 'ес']),
    );
    expect(extractRealNames(['NATO and ЕС agree as GDP and ВВП grow'])).not.toContain('gdp');
    expect(extractRealNames(['It ends on Monday in March, says the Mayor'])).toEqual([]);
  });

  it('is not tripped by a lone letter, a trailing hyphen or digits', () => {
    expect(extractRealNames(['I said so - and 2024 agrees', 'A man and a plan'])).toEqual([]);
  });

  it('gives the other script too, sorted, without repeats', () => {
    const names = extractRealNames(['Путин заявил', 'Путин сообщил', 'Putin says']);

    expect(names).toEqual([...names].sort());
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['путин', 'putin']));
  });

  it('returns nothing for no text', () => {
    expect(extractRealNames([])).toEqual([]);
    expect(extractRealNames([''])).toEqual([]);
  });

  it('feeds the real-name check: case endings and the other script both match', () => {
    const names = extractRealNames(['Вчера в Москве был Путин', 'Gorbachev warned of change']);

    expect(findRealName('Мэр говорил с Москвой', names)).toBeDefined();
    expect(findRealName('Letter from Putin', names)).toBeDefined();
    expect(findRealName('Письмо Горбачёву', names)).toBeDefined();
    expect(findRealName('Письмо Алисе из Вальдмарка', names)).toBeUndefined();
  });

  it('keeps false positives on ordinary headlines at zero', () => {
    const ordinary = [
      'Цены на зерно упали второй месяц подряд',
      'Погода испортилась по всей стране',
      'Новый закон вступил в силу',
      'Рабочие вышли на смену раньше обычного',
      'Prices fall again as harvests recover',
      'Storm hits the coast overnight',
      'New rules for ferry timetables take effect',
      'Workers return after a short strike',
      'Крупный завод остановил конвейер из-за нехватки деталей',
      'Школы переходят на зимнее расписание',
    ];

    expect(extractRealNames(ordinary)).toEqual([]);
  });
});

describe('transliterate', () => {
  it('spells a Cyrillic name in Latin, the likely spellings first', () => {
    expect(transliterate('Хрущёв')).toEqual(expect.arrayContaining(['khrushchyov', 'khrushchev']));
    expect(transliterate('Путин')[0]).toBe('putin');
  });

  it('spells a Latin name in Cyrillic', () => {
    expect(transliterate('Putin')).toContain('путин');
    expect(transliterate('Tchaikovsky-3')).toEqual(expect.arrayContaining([expect.stringContaining('-3')]));
    expect(transliterate('Shchukin')).toContain('щукин');
  });

  it('gives few spellings, and none for a name that is not plainly in one script', () => {
    expect(transliterate('Жёлудьщиков').length).toBeLessThanOrEqual(8);
    expect(transliterate('Путинputin')).toEqual([]);
    expect(transliterate('12345')).toEqual([]);
  });
});
