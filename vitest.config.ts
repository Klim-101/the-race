// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';

// Vitest loads its config through a default export.
export default defineConfig({
  test: {
    // Without this, the root config also matches test files itself, so every package's tests
    // would run twice: once here and once under its own project.
    include: [],
    projects: ['packages/*', 'scripts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Without `include`, a source file no test imports is silently absent instead of failing at 0%.
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.test.ts', 'packages/*/src/index.ts'],
      // Raised as coverage improves, never lowered to make a change pass.
      thresholds: {
        // The engine decides truth, dice and verdicts: a missed branch is a silent rules bug.
        'packages/engine/src/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        // A save that silently loses a run, or a summary that leaks the truth, breaks the game.
        'packages/saves/src/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});
