// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join, resolve } from 'node:path';
import type { ProfileRecord } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { memoryFs } from '../test/memory-fs.js';
import {
  PROFILE_EXPORT_FILE,
  PROFILE_FILE,
  PROFILE_IMPORT_FILE,
  defaultProfileDir,
  exportProfile,
  importProfile,
  loadProfile,
  recordRun,
  resolveProfileDir,
} from './profile-store.js';

const DIR = 'profile-dir';

function record(runId: string, overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    version: 1,
    runId,
    locale: 'en',
    title: 'The Goose',
    hero: { name: 'Mira', background: 'police', lifeState: undefined },
    endReason: 'proven',
    won: true,
    days: 3,
    turns: 12,
    minutes: 400,
    cluesFound: 5,
    insights: 2,
    traitsRevealed: 1,
    traitsTotal: 2,
    ...overrides,
  };
}

describe('resolveProfileDir', () => {
  const linux = { platform: 'linux', homedir: '/home/ann' } as const;

  it('is profile/ in the game folder, on each platform, and follows the folder the player chose', () => {
    expect(resolveProfileDir({ platform: 'win32', homedir: 'C:\\Users\\ann', env: {} })).toBe(
      'C:\\the-race\\profile',
    );
    expect(resolveProfileDir({ ...linux, env: {} })).toBe('/home/ann/the-race/profile');
    expect(resolveProfileDir({ ...linux, env: { RACE_GAME_FOLDER: '/srv/chosen' } })).toBe(
      `${resolve('/srv/chosen')}/profile`,
    );
  });

  it('uses RACE_PROFILE_DIR, resolved, and ignores an empty one', () => {
    expect(resolveProfileDir({ ...linux, env: { RACE_PROFILE_DIR: '/elsewhere' } })).toBe(
      resolve('/elsewhere'),
    );
    expect(resolveProfileDir({ ...linux, env: { RACE_PROFILE_DIR: 'rel' } })).toBe(resolve('rel'));
    expect(resolveProfileDir({ ...linux, env: { RACE_PROFILE_DIR: '' } })).toBe('/home/ann/the-race/profile');
  });

  it('has a default for this process', () => {
    expect(defaultProfileDir()).toMatch(/profile$/);
  });
});

describe('loadProfile and recordRun', () => {
  it('is a profile with no runs while there is no file', async () => {
    expect(await loadProfile(DIR, memoryFs())).toEqual({ ok: true, records: [] });
  });

  it('keeps the records of the runs that ended, oldest first, one for each run', async () => {
    const fs = memoryFs();
    await recordRun(DIR, record('a'), fs);
    await recordRun(DIR, record('b', { won: false, endReason: 'wrong' }), fs);
    await recordRun(DIR, record('a', { days: 9 }), fs);

    const loaded = await loadProfile(DIR, fs);
    expect(loaded.ok && loaded.records.map(({ runId, days }) => [runId, days])).toEqual([
      ['a', 9],
      ['b', 3],
    ]);
    expect(fs.directories).toContain(DIR);
  });

  it('reports a file it cannot use, never replaces it, and refuses to record over it', async () => {
    const fs = memoryFs();
    fs.files.set(join(DIR, PROFILE_FILE), '{ not json');

    expect(await loadProfile(DIR, fs)).toEqual({ ok: false, reason: 'corrupt' });
    await expect(recordRun(DIR, record('a'), fs)).rejects.toThrow(/unusable/);
    expect(fs.files.get(join(DIR, PROFILE_FILE))).toBe('{ not json');
    fs.files.set(join(DIR, PROFILE_FILE), JSON.stringify({ version: 2, records: [] }));
    expect(await loadProfile(DIR, fs)).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('reports a disk that cannot be read', async () => {
    const fs = memoryFs();
    fs.failRead(join(DIR, PROFILE_FILE));

    expect(await loadProfile(DIR, fs)).toEqual({ ok: false, reason: 'unreadable' });
  });
});

describe('export and import', () => {
  it('writes the profile as export.json, which the same profile reads back', async () => {
    const fs = memoryFs();
    await recordRun(DIR, record('a'), fs);

    const path = await exportProfile(DIR, fs);

    expect(path).toBe(join(DIR, PROFILE_EXPORT_FILE));
    expect(JSON.parse(fs.files.get(path) ?? '')).toMatchObject({ version: 1, records: [{ runId: 'a' }] });
  });

  it('refuses to export a profile it cannot read', async () => {
    const fs = memoryFs();
    fs.files.set(join(DIR, PROFILE_FILE), 'nope');

    await expect(exportProfile(DIR, fs)).rejects.toThrow(/unusable/);
  });

  it('takes the runs of import.json it does not have, and twice adds nothing', async () => {
    const fs = memoryFs();
    await recordRun(DIR, record('a'), fs);
    const other = memoryFs();
    await recordRun(DIR, record('a'), other);
    await recordRun(DIR, record('b', { won: false, endReason: 'breakdown' }), other);
    await recordRun(DIR, record('c'), other);
    fs.files.set(join(DIR, PROFILE_IMPORT_FILE), other.files.get(join(DIR, PROFILE_FILE)) ?? '');

    expect(await importProfile(DIR, fs)).toEqual({ ok: true, added: 2, skipped: 1 });
    expect(await importProfile(DIR, fs)).toEqual({ ok: true, added: 0, skipped: 3 });
    const loaded = await loadProfile(DIR, fs);
    expect(loaded.ok && loaded.records.map(({ runId }) => runId)).toEqual(['a', 'b', 'c']);
  });

  it('counts a run listed twice in the file once', async () => {
    const fs = memoryFs();
    fs.files.set(
      join(DIR, PROFILE_IMPORT_FILE),
      JSON.stringify({ version: 1, records: [record('x'), record('x')] }),
    );

    expect(await importProfile(DIR, fs)).toEqual({ ok: true, added: 1, skipped: 1 });
  });

  it('says there is no file, that a file is not a profile, and that the profile is unusable', async () => {
    const fs = memoryFs();
    expect(await importProfile(DIR, fs)).toEqual({ ok: false, reason: 'no-file' });

    fs.files.set(join(DIR, PROFILE_IMPORT_FILE), JSON.stringify({ hello: 1 }));
    expect(await importProfile(DIR, fs)).toEqual({ ok: false, reason: 'invalid' });
    expect(fs.files.has(join(DIR, PROFILE_FILE))).toBe(false);

    fs.failRead(join(DIR, PROFILE_IMPORT_FILE));
    expect(await importProfile(DIR, fs)).toEqual({ ok: false, reason: 'no-file' });

    fs.failRead(undefined);
    fs.files.set(join(DIR, PROFILE_FILE), 'broken');
    expect(await importProfile(DIR, fs)).toEqual({ ok: false, reason: 'profile-unusable' });
  });

  it('adds nothing for an empty file of records', async () => {
    const fs = memoryFs();
    fs.files.set(join(DIR, PROFILE_IMPORT_FILE), JSON.stringify({ version: 1, records: [] }));

    expect(await importProfile(DIR, fs)).toEqual({ ok: true, added: 0, skipped: 0 });
    expect(fs.files.has(join(DIR, PROFILE_FILE))).toBe(false);
  });
});
