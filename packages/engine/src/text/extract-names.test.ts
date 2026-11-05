// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { extractRealNames } from './extract-names.js';
import { findRealName } from './real-names.js';
import { transliterate } from './transliterate.js';

describe('extractRealNames and a headline in Title Case', () => {
  it('takes no word of it for a name, as every word stands capitalised', () => {
    expect(extractRealNames(['Man Shocked As Dog Barks At Mailman Again'])).toEqual([]);
    expect(
      extractRealNames(['Court Shuts Independent Newsroom For Lacking Licence No Applicant Could Obtain']),
    ).toEqual([]);
  });

  it('still takes an acronym from it, and the names of the headlines in sentence case beside it', () => {
    const names = extractRealNames([
      'UK Man Shocked As Dog Barks At Mailman Again',
      'Trucks stalled outside Berlin',
    ]);

    expect(names).toEqual(expect.arrayContaining(['uk', 'berlin']));
    expect(names).not.toContain('mailman');
  });

  it('does not take a function word for a name when a summary runs two sentences together', () => {
    const names = extractRealNames([
      'Party expected to get less than a third of the vote amid power cuts The African National Congress faces voters',
      'Court rules on Monday On Tuesday Berlin answers',
      'Die Bundesregierung und der Bundestag streiten',
    ]);

    expect(names).toEqual(
      expect.arrayContaining(['african', 'national', 'congress', 'berlin', 'bundesregierung', 'bundestag']),
    );
    for (const word of ['the', 'on', 'die', 'und', 'der']) expect(names).not.toContain(word);
  });

  it('cuts the hyphens and apostrophes off the end of a word, however many, without slowing down', () => {
    expect(extractRealNames(["Talks with Norway-' stalled", 'Talks with Norway’’ stalled'])).toEqual(
      expect.arrayContaining(['norway']),
    );

    const started = Date.now();
    const names = extractRealNames([`Talks with Norway${"'-".repeat(50_000)} stalled`]);

    expect(names).toContain('norway');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('takes the whole name of a person and the last word, and not the given name that points at no one', () => {
    const names = extractRealNames([
      'Beau Lamarre-Condon tells court he deleted a phone',
      'Talks with Pope Francis stalled',
    ]);

    expect(names).toEqual(
      expect.arrayContaining(['beau lamarre-condon', 'lamarre-condon', 'pope francis', 'francis']),
    );
    expect(names).not.toContain('beau');
    expect(names).not.toContain('pope');
  });

  it('keeps the first word of a run that is not a person: a place, or a name of four words or more', () => {
    const names = extractRealNames([
      'Ten years of the Paris Agreement: has the world kept its promises?',
      'Talks with Alpha Beta Gamma Delta Omega failed',
    ]);

    expect(names).toEqual(expect.arrayContaining(['paris', 'alpha', 'beta', 'gamma', 'delta']));
  });

  it('lets go of a part of a name that the same texts use as an ordinary word, and keeps a word that stands alone', () => {
    const names = extractRealNames([
      'Talks with the African National Congress stalled',
      'A national mood and the congress hall',
    ]);

    expect(names).toContain('african national congress');
    expect(names).not.toContain('congress');
    expect(names).not.toContain('national');
    // Capitalised by itself in the middle of a sentence, it is a name whatever else the texts say.
    expect(extractRealNames(['Aid blocked by Congress on Monday', 'the congress hall'])).toContain(
      'congress',
    );
  });

  it('does not take the generic head of a name for a name: the Paris Agreement is not "agreement"', () => {
    const names = extractRealNames(['Ten years of the Paris Agreement: has the world kept its promises?']);

    expect(names).toEqual(expect.arrayContaining(['paris', 'paris agreement']));
    expect(names).not.toContain('agreement');
  });

  it('leaves a short run of names in sentence case alone: it is a list of names, not Title Case', () => {
    expect(extractRealNames(['Talks with Apple Google Microsoft Amazon stalled'])).toEqual(
      expect.arrayContaining(['apple', 'google', 'microsoft', 'amazon']),
    );
  });
});

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
