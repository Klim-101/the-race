// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOARD_FILE, defaultBoardDir, resolveBoardDir } from './board-dir.js';
import { resolveSaveDir } from './save-dir.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveBoardDir', () => {
  const win = { platform: 'win32', homedir: 'C:\\Users\\ann' } as const;
  const mac = { platform: 'darwin', homedir: '/Users/ann' } as const;
  const linux = { platform: 'linux', homedir: '/home/ann' } as const;

  it('is the-race in the Documents folder of the user, on each platform', () => {
    expect(resolveBoardDir({ ...win, env: {} })).toBe('C:\\Users\\ann\\Documents\\the-race');
    expect(resolveBoardDir({ ...mac, env: {} })).toBe('/Users/ann/Documents/the-race');
    expect(resolveBoardDir({ ...linux, env: {} })).toBe('/home/ann/Documents/the-race');
  });

  it('uses RACE_BOARD_DIR, resolved, on any platform', () => {
    const elsewhere = resolve('elsewhere', 'boards');
    for (const base of [win, mac, linux]) {
      expect(resolveBoardDir({ ...base, env: { RACE_BOARD_DIR: elsewhere } })).toBe(elsewhere);
    }
    expect(resolveBoardDir({ ...linux, env: { RACE_BOARD_DIR: 'rel' } })).toBe(resolve('rel'));
  });

  it('ignores an empty RACE_BOARD_DIR', () => {
    expect(resolveBoardDir({ ...linux, env: { RACE_BOARD_DIR: '' } })).toBe('/home/ann/Documents/the-race');
  });

  it('is never inside the save directory, which is closed to the narrator, nor the other way round', () => {
    for (const base of [win, mac, linux]) {
      const board = resolveBoardDir({ ...base, env: {} });
      const saves = resolveSaveDir({ ...base, env: {} });

      expect(board.startsWith(saves)).toBe(false);
      expect(saves.startsWith(board)).toBe(false);
    }
  });
});

describe('defaultBoardDir', () => {
  it('follows RACE_BOARD_DIR of the process', () => {
    const folder = resolve('temp-race-boards');
    vi.stubEnv('RACE_BOARD_DIR', folder);

    expect(defaultBoardDir()).toBe(folder);
  });

  it('is under the home directory without it', () => {
    vi.stubEnv('RACE_BOARD_DIR', '');

    expect(defaultBoardDir()).toMatch(/the-race$/);
  });
});

describe('BOARD_FILE', () => {
  it('is a fixed name for an html page', () => {
    expect(BOARD_FILE).toBe('evidence.html');
  });
});
