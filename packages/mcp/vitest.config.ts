// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

// Vitest loads its config through a default export. Coverage lives in the root config.
export default defineProject({
  resolve: {
    // Tests run against the sources of the engine and the saves, so they need no build of them first.
    alias: {
      '@the-race/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@the-race/saves': fileURLToPath(new URL('../saves/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'mcp',
    // The process test builds the package first; a cold build on a busy machine can be slow.
    testTimeout: 60_000,
    hookTimeout: 180_000,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
