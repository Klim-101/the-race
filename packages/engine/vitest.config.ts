// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { defineProject } from 'vitest/config';

// Vitest loads its config through a default export. Coverage lives in the root config.
export default defineProject({
  test: {
    name: 'engine',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
