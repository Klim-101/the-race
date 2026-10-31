// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultGameFolder, resolveGameFolder } from './game-folder.js';
import { chooseSaveDir, defaultSaveDir, legacySaveDir, resolveSaveDir } from './save-dir.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const win = { platform: 'win32', homedir: 'C:\\Users\\ann' } as const;
const mac = { platform: 'darwin', homedir: '/Users/ann' } as const;
const linux = { platform: 'linux', homedir: '/home/ann' } as const;

describe('resolveGameFolder', () => {
  it('is C:\\the-race on Windows and the-race in the home directory elsewhere', () => {
    expect(resolveGameFolder({ ...win, env: {} })).toBe('C:\\the-race');
    expect(resolveGameFolder({ ...mac, env: {} })).toBe('/Users/ann/the-race');
    expect(resolveGameFolder({ ...linux, env: {} })).toBe('/home/ann/the-race');
  });

  it('takes the folder the plugin asked for, from the server variable or the hook variable', () => {
    const chosen = '/srv/games';
    expect(resolveGameFolder({ ...linux, env: { RACE_GAME_FOLDER: chosen } })).toBe(resolve(chosen));
    expect(resolveGameFolder({ ...linux, env: { CLAUDE_PLUGIN_OPTION_GAME_FOLDER: chosen } })).toBe(
      resolve(chosen),
    );
    expect(resolveGameFolder({ ...win, env: { RACE_GAME_FOLDER: 'D:\\play' } })).toBe(resolve('D:\\play'));
  });

  it('resolves a relative folder', () => {
    expect(resolveGameFolder({ ...linux, env: { RACE_GAME_FOLDER: 'rel' } })).toBe(resolve('rel'));
  });

  it('ignores an empty answer', () => {
    expect(
      resolveGameFolder({ ...linux, env: { RACE_GAME_FOLDER: '', CLAUDE_PLUGIN_OPTION_GAME_FOLDER: '' } }),
    ).toBe('/home/ann/the-race');
  });

  it("ignores the plugin's Windows default on another system, which has no such drive", () => {
    for (const base of [mac, linux]) {
      const env = { RACE_GAME_FOLDER: 'C:\\the-race' };
      expect(resolveGameFolder({ ...base, env })).toBe(resolveGameFolder({ ...base, env: {} }));
    }
  });
});

describe('defaultGameFolder', () => {
  it('reads the process environment', () => {
    const folder = resolve('process-game-folder');
    vi.stubEnv('RACE_GAME_FOLDER', folder);
    expect(defaultGameFolder()).toBe(folder);
  });
});

describe('resolveSaveDir', () => {
  it('uses RACE_HOME as an absolute path, on any platform', () => {
    const home = resolve('elsewhere', 'race');
    for (const base of [win, mac, linux])
      expect(resolveSaveDir({ ...base, env: { RACE_HOME: home } })).toBe(home);
  });

  it('resolves a relative RACE_HOME', () => {
    expect(resolveSaveDir({ ...linux, env: { RACE_HOME: 'rel' } })).toBe(resolve('rel'));
  });

  it('is saves/ in the game folder, also when RACE_HOME is empty', () => {
    expect(resolveSaveDir({ ...win, env: {} })).toBe('C:\\the-race\\saves');
    expect(resolveSaveDir({ ...linux, env: { RACE_HOME: '' } })).toBe('/home/ann/the-race/saves');
    expect(resolveSaveDir({ ...linux, env: { RACE_GAME_FOLDER: '/srv/g' } })).toBe(
      `${resolve('/srv/g')}/saves`,
    );
  });
});

describe('legacySaveDir', () => {
  it('uses LOCALAPPDATA on Windows', () => {
    expect(legacySaveDir({ ...win, env: { LOCALAPPDATA: 'D:\\Local' } })).toBe('D:\\Local\\the-race');
  });

  it('falls back to AppData\\Local under the home directory on Windows', () => {
    const expected = 'C:\\Users\\ann\\AppData\\Local\\the-race';
    expect(legacySaveDir({ ...win, env: {} })).toBe(expected);
    expect(legacySaveDir({ ...win, env: { LOCALAPPDATA: '' } })).toBe(expected);
  });

  it('uses Application Support on macOS', () => {
    expect(legacySaveDir({ ...mac, env: {} })).toBe('/Users/ann/Library/Application Support/the-race');
  });

  it('uses an absolute XDG_STATE_HOME elsewhere, and ~/.local/state otherwise', () => {
    expect(legacySaveDir({ ...linux, env: { XDG_STATE_HOME: '/var/state' } })).toBe('/var/state/the-race');
    expect(legacySaveDir({ ...linux, env: {} })).toBe('/home/ann/.local/state/the-race');
    expect(legacySaveDir({ ...linux, env: { XDG_STATE_HOME: 'state' } })).toBe(
      '/home/ann/.local/state/the-race',
    );
  });
});

describe('chooseSaveDir', () => {
  const current = '/home/ann/the-race/saves';
  const legacy = '/home/ann/.local/state/the-race';

  it('is the new directory when nothing is saved anywhere', () => {
    expect(chooseSaveDir({ ...linux, env: {} }, () => false)).toBe(current);
  });

  it('keeps the earlier saves when only the legacy directory exists', () => {
    expect(chooseSaveDir({ ...linux, env: {} }, (path) => path === legacy)).toBe(legacy);
  });

  it('prefers the new directory when both exist', () => {
    expect(chooseSaveDir({ ...linux, env: {} }, () => true)).toBe(current);
  });

  it('never looks aside when RACE_HOME names the directory', () => {
    const home = resolve('named');
    expect(chooseSaveDir({ ...linux, env: { RACE_HOME: home } }, () => true)).toBe(home);
  });
});

describe('defaultSaveDir', () => {
  it('reads the process environment', () => {
    const home = resolve('process-race-home');
    vi.stubEnv('RACE_HOME', home);
    expect(defaultSaveDir()).toBe(home);
  });

  it('never lands in the working directory when RACE_HOME is unset', () => {
    vi.stubEnv('RACE_HOME', '');
    expect(defaultSaveDir().startsWith(process.cwd())).toBe(false);
    expect(defaultSaveDir()).toContain('the-race');
  });
});
