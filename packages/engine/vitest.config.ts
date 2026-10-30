// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { defineProject } from 'vitest/config';

// Vitest loads its config through a default export. Coverage lives in the root config.
export default defineProject({
  test: {
    name: 'engine',
    // Property checks replay hundreds of runs; under coverage on a busy machine the default 5 s is too tight.
    testTimeout: 30_000,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
