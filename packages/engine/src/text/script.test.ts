// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { isInLocaleScript } from './script.js';

describe('isInLocaleScript', () => {
  it('accepts Russian text for ru and English text for en', () => {
    expect(isInLocaleScript('Сыр пропал с ярмарки.', 'ru')).toBe(true);
    expect(isInLocaleScript('The cheese is gone.', 'en')).toBe(true);
  });

  it('rejects text written in another script', () => {
    expect(isInLocaleScript('The cheese is gone.', 'ru')).toBe(false);
    expect(isInLocaleScript('Сыр пропал с ярмарки.', 'en')).toBe(false);
  });

  it('tolerates a foreign brand inside a sentence', () => {
    expect(isInLocaleScript('Акции компании Nordell упали на бирже Эльмвика.', 'ru')).toBe(true);
  });

  it('does not judge texts with too few letters', () => {
    expect(isInLocaleScript('OK', 'ru')).toBe(true);
    expect(isInLocaleScript('42', 'en')).toBe(true);
  });
});
