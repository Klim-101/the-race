// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { findWeekday } from './weekdays.js';

describe('the weekdays a text names', () => {
  it('finds an English name, in any case and in the plural', () => {
    expect(findWeekday('The deadline is 18:00 on Friday.')).toBe('Friday');
    expect(findWeekday('They meet on MONDAYS')).toBe('MONDAYS');
  });

  it('finds a Russian name in any of its forms', () => {
    expect(findWeekday('в пятницу в 18:00 срок выходит')).toBe('пятницу');
    expect(findWeekday('До Понедельника ещё далеко')).toBe('Понедельника');
    expect(findWeekday('это случилось в воскресенье')).toBe('воскресенье');
  });

  it('finds a Wednesday only after a preposition of time, since "среда" is also a surrounding', () => {
    expect(findWeekday('Встреча назначена на среду.')).toBe('на среду');
    expect(findWeekday('Среда обитания у птицы своя.')).toBeUndefined();
  });

  it('does not take a name for a part of a longer word', () => {
    expect(findWeekday('A sundae and a Fridayless week')).toBeUndefined();
    expect(findWeekday('Sunday-school')).toBe('Sunday');
  });

  it('finds nothing in a text with no weekday', () => {
    expect(findWeekday('к шести вечера третьего дня')).toBeUndefined();
  });
});
