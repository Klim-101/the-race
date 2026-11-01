// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { profileRecordOf } from '../profile.js';
import { LEGACY_RUN_ID, RUN_ID_PATTERN } from '../run.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { DetectiveRunStateSchema, createDetectiveRun, endRun } from './run-state.js';

const runWith = (runId?: string) =>
  createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'run-id',
    ...(runId === undefined ? {} : { runId }),
    rngState: 1,
    locale: 'en',
  });

describe('the id of a run', () => {
  it('is kept in the state, and a run without one is still a run', () => {
    expect(runWith('20261101-124606-9f3a1c2e').runId).toBe('20261101-124606-9f3a1c2e');
    expect('runId' in runWith()).toBe(false);
    expect(DetectiveRunStateSchema.safeParse(runWith('20261101-124606-9f3a1c2e')).success).toBe(true);
  });

  it('is a date, a time and a seed, or the legacy id, and nothing that could name another folder', () => {
    for (const id of ['20261101-124606-9f3a1c2e', '20261101-124606-the-seed', LEGACY_RUN_ID]) {
      expect(RUN_ID_PATTERN.test(id)).toBe(true);
    }
    for (const id of [
      '',
      '..',
      '../x',
      'run',
      '20261101-124606',
      '20261101-124606-A',
      'a/b',
      '20261101-124606-x/y',
    ]) {
      expect(RUN_ID_PATTERN.test(id)).toBe(false);
      expect(() => runWith(id)).toThrow();
    }
  });

  it('goes into the profile record of a finished run, for opening that run later', () => {
    const ended = endRun(runWith('20261101-124606-run-id'), 'gave-up', 'gave-up');

    expect(profileRecordOf(ended, [])).toMatchObject({ runId: 'run-id', folder: '20261101-124606-run-id' });
    expect(profileRecordOf(endRun(runWith(), 'gave-up', 'gave-up'), [])).not.toHaveProperty('folder');
  });
});
