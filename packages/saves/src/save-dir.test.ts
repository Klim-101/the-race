// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSaveDir, resolveSaveDir } from './save-dir.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveSaveDir', () => {
  const win = { platform: 'win32', homedir: 'C:\\Users\\ann' } as const;
  const linux = { platform: 'linux', homedir: '/home/ann' } as const;

  it('uses RACE_HOME as an absolute path, on any platform', () => {
    const home = resolve('elsewhere', 'race');
    for (const base of [win, linux, { platform: 'darwin', homedir: '/Users/ann' } as const])
      expect(resolveSaveDir({ ...base, env: { RACE_HOME: home } })).toBe(home);
  });

  it('resolves a relative RACE_HOME', () => {
    expect(resolveSaveDir({ ...linux, env: { RACE_HOME: 'rel' } })).toBe(resolve('rel'));
  });

  it('ignores an empty RACE_HOME', () => {
    expect(resolveSaveDir({ ...linux, env: { RACE_HOME: '' } })).toBe('/home/ann/.local/state/the-race');
  });

  it('uses LOCALAPPDATA on Windows', () => {
    expect(resolveSaveDir({ ...win, env: { LOCALAPPDATA: 'D:\\Local' } })).toBe('D:\\Local\\the-race');
  });

  it('falls back to AppData\\Local under the home directory on Windows', () => {
    const expected = 'C:\\Users\\ann\\AppData\\Local\\the-race';
    expect(resolveSaveDir({ ...win, env: {} })).toBe(expected);
    expect(resolveSaveDir({ ...win, env: { LOCALAPPDATA: '' } })).toBe(expected);
  });

  it('uses Application Support on macOS', () => {
    expect(resolveSaveDir({ platform: 'darwin', homedir: '/Users/ann', env: {} })).toBe(
      '/Users/ann/Library/Application Support/the-race',
    );
  });

  it('uses an absolute XDG_STATE_HOME elsewhere', () => {
    expect(resolveSaveDir({ ...linux, env: { XDG_STATE_HOME: '/var/state' } })).toBe('/var/state/the-race');
  });

  it('falls back to ~/.local/state without XDG_STATE_HOME', () => {
    expect(resolveSaveDir({ ...linux, env: {} })).toBe('/home/ann/.local/state/the-race');
  });

  it('ignores a relative XDG_STATE_HOME', () => {
    expect(resolveSaveDir({ ...linux, env: { XDG_STATE_HOME: 'state' } })).toBe(
      '/home/ann/.local/state/the-race',
    );
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
