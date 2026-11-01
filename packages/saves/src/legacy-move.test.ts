// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moveDefaultLegacySaves, moveLegacySaves, nodeMoveFs, type MoveFs } from './legacy-move.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const INPUTS = { platform: 'linux', homedir: '/home/ann', env: {} } as const;
const LEGACY = '/home/ann/.local/state/the-race';
const TARGET = '/home/ann/the-race/saves';

const norm = (path: string): string => path.replaceAll('\\', '/');

/** An in-memory disk of files, with directories implied, whose steps can be made to fail or to lie. */
function fakeDisk(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial).map(([path, data]) => [norm(path), data]));
  const faults = {
    write: undefined as string | undefined,
    rename: false,
    removeLegacy: false,
    corrupt: false,
  };
  const under = (directory: string) =>
    [...files.keys()].filter((path) => path.startsWith(`${norm(directory)}/`));
  const fs: MoveFs = {
    exists: (path) => Promise.resolve(files.has(norm(path)) || under(path).length > 0),
    listFiles: (directory) =>
      Promise.resolve(under(directory).map((path) => path.slice(norm(directory).length + 1))),
    readFile: (path) => Promise.resolve(files.get(norm(path)) ?? ''),
    writeFile: (path, data) => {
      if (faults.write !== undefined && norm(path).includes(faults.write)) {
        return Promise.reject(new Error('disk full'));
      }
      files.set(norm(path), faults.corrupt ? `${data}!` : data);
      return Promise.resolve();
    },
    mkdir: () => Promise.resolve(),
    rename: (from, to) => {
      if (faults.rename) return Promise.reject(new Error('rename failed'));
      for (const path of under(from)) {
        files.set(`${norm(to)}${path.slice(norm(from).length)}`, files.get(path) ?? '');
        files.delete(path);
      }
      return Promise.resolve();
    },
    removeDirectory: (directory) => {
      if (faults.removeLegacy && norm(directory) === LEGACY) return Promise.reject(new Error('locked'));
      for (const path of under(directory)) files.delete(path);
      return Promise.resolve();
    },
  };
  return { fs, files, faults };
}

const SAVES = {
  [`${LEGACY}/run/state.json`]: '{"run":1}',
  [`${LEGACY}/run/log.json`]: '[]',
  [`${LEGACY}/world.json`]: '{"entries":[]}',
  [`${LEGACY}/seeds.json`]: '{"days":{}}',
};

describe('moveLegacySaves', () => {
  it('moves the saves, the world and the seeds into saves/ of the game folder and removes the old folder', async () => {
    const disk = fakeDisk(SAVES);

    const moved = await moveLegacySaves(INPUTS, disk.fs);

    expect(moved).toEqual({ status: 'moved', from: LEGACY, to: TARGET, files: 4 });
    expect([...disk.files.keys()].sort()).toEqual(
      [
        `${TARGET}/run/state.json`,
        `${TARGET}/run/log.json`,
        `${TARGET}/world.json`,
        `${TARGET}/seeds.json`,
      ].sort(),
    );
    expect(disk.files.get(`${TARGET}/run/state.json`)).toBe('{"run":1}');
  });

  it('does nothing the second time, and does nothing where there is nothing to move', async () => {
    const disk = fakeDisk(SAVES);
    await moveLegacySaves(INPUTS, disk.fs);

    expect(await moveLegacySaves(INPUTS, disk.fs)).toEqual({ status: 'none' });
    expect(await moveLegacySaves(INPUTS, fakeDisk().fs)).toEqual({ status: 'none' });
  });

  it('leaves alone a player who named the save directory', async () => {
    const disk = fakeDisk(SAVES);

    expect(await moveLegacySaves({ ...INPUTS, env: { RACE_HOME: '/elsewhere' } }, disk.fs)).toEqual({
      status: 'none',
    });
    expect(disk.files.has(`${LEGACY}/world.json`)).toBe(true);
  });

  it('leaves an empty old folder as it is', async () => {
    const disk = fakeDisk();
    const empty: MoveFs = { ...disk.fs, exists: () => Promise.resolve(true) };

    expect(await moveLegacySaves(INPUTS, empty)).toEqual({ status: 'none' });
  });

  it('takes no step towards a save at the new place that differs from the old one, and removes a leftover that is the same', async () => {
    const differs = fakeDisk({ ...SAVES, [`${TARGET}/world.json`]: '{"entries":["other"]}' });
    expect(await moveLegacySaves(INPUTS, differs.fs)).toEqual({ status: 'none' });
    expect(differs.files.has(`${LEGACY}/world.json`)).toBe(true);

    const sameAfterStop = fakeDisk(SAVES);
    for (const [path, data] of Object.entries(SAVES)) {
      sameAfterStop.files.set(path.replace(LEGACY, TARGET), data);
    }
    expect(await moveLegacySaves(INPUTS, sameAfterStop.fs)).toEqual({
      status: 'cleaned',
      from: LEGACY,
      to: TARGET,
    });
    expect(sameAfterStop.files.has(`${LEGACY}/world.json`)).toBe(false);

    // A new place with an extra file, or with a file of other content, is not the same.
    const extra = fakeDisk(SAVES);
    for (const [path, data] of Object.entries(SAVES)) extra.files.set(path.replace(LEGACY, TARGET), data);
    extra.files.set(`${TARGET}/more.json`, '{}');
    expect(await moveLegacySaves(INPUTS, extra.fs)).toEqual({ status: 'none' });
  });
});

describe('a move that goes wrong', () => {
  it('removes nothing when a file cannot be copied, and leaves no half copy behind', async () => {
    const disk = fakeDisk(SAVES);
    disk.faults.write = 'world.json';

    const moved = await moveLegacySaves(INPUTS, disk.fs);

    expect(moved).toMatchObject({ status: 'failed', from: LEGACY, reason: 'disk full' });
    expect([...disk.files.keys()].sort()).toEqual(Object.keys(SAVES).sort());
  });

  it('removes nothing when a copy does not match its original', async () => {
    const disk = fakeDisk(SAVES);
    disk.faults.corrupt = true;

    expect(await moveLegacySaves(INPUTS, disk.fs)).toMatchObject({
      status: 'failed',
      reason: 'The copy does not match the original.',
    });
    expect([...disk.files.keys()].sort()).toEqual(Object.keys(SAVES).sort());
  });

  it('removes nothing when the copy cannot be put in place, and tries again on the next start', async () => {
    const disk = fakeDisk(SAVES);
    disk.faults.rename = true;
    expect(await moveLegacySaves(INPUTS, disk.fs)).toMatchObject({
      status: 'failed',
      reason: 'rename failed',
    });
    expect([...disk.files.keys()].sort()).toEqual(Object.keys(SAVES).sort());

    disk.faults.rename = false;
    expect(await moveLegacySaves(INPUTS, disk.fs)).toMatchObject({ status: 'moved' });
  });

  it('clears a half copy that an earlier start left, and still says moved when the old folder cannot be removed', async () => {
    const disk = fakeDisk({ ...SAVES, [`${TARGET}.moving/stale.json`]: 'old' });
    disk.faults.removeLegacy = true;

    expect(await moveLegacySaves(INPUTS, disk.fs)).toMatchObject({ status: 'moved', files: 4 });
    expect(disk.files.has(`${TARGET}.moving/stale.json`)).toBe(false);
    expect(disk.files.get(`${TARGET}/world.json`)).toBe('{"entries":[]}');
  });

  it('says what went wrong even when what was thrown is no error, and survives a failed cleanup', async () => {
    const disk = fakeDisk(SAVES);
    let removals = 0;
    const odd: MoveFs = {
      ...disk.fs,
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a thrown string is the case under test
      writeFile: () => Promise.reject('plain text'),
      // The first removal (a half copy of an earlier start) is fine; the cleanup after the failure is not.
      removeDirectory: () =>
        removals++ === 0 ? Promise.resolve() : Promise.reject(new Error('cannot clean')),
    };

    expect(await moveLegacySaves(INPUTS, odd)).toMatchObject({ status: 'failed', reason: 'plain text' });
  });
});

describe('moving on a real disk', () => {
  it('copies nested files, checks them and removes the old folder', async () => {
    const home = await mkdtemp(join(tmpdir(), 'race-move-'));
    try {
      const legacy = join(home, '.local', 'state', 'the-race');
      await mkdir(join(legacy, 'run'), { recursive: true });
      await writeFile(join(legacy, 'run', 'state.json'), '{"run":1}');
      await writeFile(join(legacy, 'world.json'), '{"entries":[]}');

      const moved = await moveLegacySaves({ platform: 'linux', homedir: home, env: {} });

      expect(moved).toMatchObject({ status: 'moved', files: 2 });
      const target = join(home, 'the-race', 'saves');
      expect(await readFile(join(target, 'run', 'state.json'), 'utf8')).toBe('{"run":1}');
      await expect(stat(legacy)).rejects.toThrow();
      expect(await moveLegacySaves({ platform: 'linux', homedir: home, env: {} })).toEqual({
        status: 'none',
      });
      expect(await nodeMoveFs.exists(join(home, 'nowhere'))).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it('leaves a player who named the save directory alone, for this process too', async () => {
    vi.stubEnv('RACE_HOME', join(tmpdir(), 'race-home-named'));

    expect(await moveDefaultLegacySaves()).toEqual({ status: 'none' });
  });
});
