// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { HEADLINES } from '../../test/fixtures/headlines.js';
import { TRAGEDY_CATEGORIES, judgeHeadline } from './tragedy-filter.js';

const label = (verdict: ReturnType<typeof judgeHeadline>): string =>
  verdict.verdict === 'keep' ? 'keep' : verdict.category;

describe('judgeHeadline', () => {
  it.each(HEADLINES)('%s', (text, expected) => {
    expect(label(judgeHeadline(text))).toBe(expected);
  });

  it('keeps ordinary headlines whole: no false positive on the recorded ones', () => {
    const kept = HEADLINES.filter(([, expected]) => expected === 'keep');

    expect(kept.length).toBeGreaterThanOrEqual(20);
    expect(kept.filter(([text]) => judgeHeadline(text).verdict !== 'keep')).toEqual([]);
  });

  it('drops every headline of a tragedy, whichever the language, and every category is tried', () => {
    const dropped = HEADLINES.filter(([, expected]) => TRAGEDY_CATEGORIES.some((c) => c === expected));

    expect(new Set(dropped.map(([, expected]) => expected))).toEqual(new Set(TRAGEDY_CATEGORIES));
    expect(dropped.filter(([text]) => judgeHeadline(text).verdict !== 'drop')).toEqual([]);
  });

  it('lets a war through only as the bare fact of it, and drops it whole when people are hurt', () => {
    expect(judgeHeadline('Shelling closes the port')).toEqual({
      verdict: 'abstract',
      category: 'armed-conflict',
    });
    expect(judgeHeadline('Shelling closes the port, two dead')).toEqual({
      verdict: 'drop',
      category: 'casualties',
    });
  });

  it('reads a summary as part of the headline', () => {
    expect(judgeHeadline('Port reopens. Authorities say a child was found safe')).toEqual({
      verdict: 'drop',
      category: 'children',
    });
  });

  it('reads ё as е, any case, and full-width letters as plain ones', () => {
    expect(judgeHeadline('МЁРТВЫЕ ДУШИ')).toMatchObject({ verdict: 'drop' });
    expect(judgeHeadline('ｋｉｌｌｅｄ in the storm')).toMatchObject({ verdict: 'drop' });
  });

  it('does not mistake a harmless word that starts like a grim one', () => {
    for (const text of [
      'Diesel prices fall',
      'Skillful negotiators win a deal',
      'Stable outlook for grapes',
    ]) {
      expect(judgeHeadline(text)).toEqual({ verdict: 'keep' });
    }
  });

  it('does not take a war of prices for an armed conflict, in either language', () => {
    for (const text of [
      'Price wars hit supermarkets',
      'Торговая война за рынок кофе',
      'Налоговая война двух городов',
      'Война цен на бензин',
    ]) {
      expect(judgeHeadline(text)).toEqual({ verdict: 'keep' });
    }
  });

  it('keeps an empty text', () => {
    expect(judgeHeadline('')).toEqual({ verdict: 'keep' });
  });
});
