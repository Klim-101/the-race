// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_DIR, BOARD_FILE, runBoardFile } from './board-dir.js';
import { runFiles } from './run-store.js';

describe('runBoardFile', () => {
  it('is board/evidence.html in the folder of the run, beside its state', () => {
    const board = runBoardFile('saves', '2026-11-02T10-00-00Z');

    expect(board).toBe(join(runFiles('saves', '2026-11-02T10-00-00Z').directory, BOARD_DIR, BOARD_FILE));
    expect(dirname(dirname(board))).toBe(runFiles('saves', '2026-11-02T10-00-00Z').directory);
  });

  it('gives each run a board of its own', () => {
    expect(runBoardFile('saves', 'a')).not.toBe(runBoardFile('saves', 'b'));
  });
});

describe('BOARD_FILE', () => {
  it('is a fixed name for an html page', () => {
    expect(BOARD_FILE).toBe('evidence.html');
  });
});
