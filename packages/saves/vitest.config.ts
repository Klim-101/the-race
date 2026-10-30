// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

// Vitest loads its config through a default export. Coverage lives in the root config.
export default defineProject({
  resolve: {
    // Tests run against the engine's source, so they need no build of it first.
    alias: {
      '@the-race/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'saves',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
