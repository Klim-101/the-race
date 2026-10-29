// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';

// Vitest loads its config through a default export; it is the only one in the repository.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
