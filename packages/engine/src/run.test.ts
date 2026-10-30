// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, advanceClock } from './run.js';

describe('advanceClock', () => {
  it('moves within the day', () => {
    expect(advanceClock({ day: 1, minute: 100 }, 30)).toEqual({ day: 1, minute: 130 });
    expect(advanceClock({ day: 2, minute: 5 }, 0)).toEqual({ day: 2, minute: 5 });
  });

  it('rolls over midnight, once or several times', () => {
    expect(advanceClock({ day: 1, minute: MINUTES_PER_DAY - 1 }, 1)).toEqual({ day: 2, minute: 0 });
    expect(advanceClock({ day: 1, minute: 60 }, MINUTES_PER_DAY * 2 + 30)).toEqual({ day: 3, minute: 90 });
  });

  it('refuses to move backwards or by a fraction', () => {
    expect(() => advanceClock({ day: 1, minute: 0 }, -1)).toThrow(RangeError);
    expect(() => advanceClock({ day: 1, minute: 0 }, 1.5)).toThrow(RangeError);
  });
});
