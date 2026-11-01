// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LEGACY_RUN_ID, endRun, type DetectiveRunState } from '@the-race/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../test/memory-fs.js';
import { RUN_ID, newRun } from '../test/new-run.js';
import { moveDefaultLegacyRun, moveLegacyRun, nodeMoveFs, type MoveFs } from './legacy-move.js';
import { isRunId, makeRunId } from './run-id.js';
import { listRunIds, loadCurrentRun, loadRun, runFiles, saveRun } from './run-store.js';
import { nodeSaveFs } from './save-fs.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const DIR = join('save-root');
/** The run as an earlier version saved it: with no id. */
function withoutId(run: DetectiveRunState): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...run };
  delete copy.runId;
  return copy;
}
const withId = (run: DetectiveRunState, runId: string): DetectiveRunState => ({ ...run, runId });

describe('the id of a run', () => {
  it('is the date, the time and the seed, in the order the runs were played', () => {
    const id = makeRunId(new Date('2026-11-01T12:46:06.789Z'), '9f3a1c2e');

    expect(id).toBe('20261101-124606-9f3a1c2e');
    expect(isRunId(id)).toBe(true);
    expect(makeRunId(new Date('2026-11-01T12:46:07Z'), 'aaaa') > id).toBe(true);
    expect(makeRunId(new Date('2027-01-01T00:00:00Z'), 'aaaa') > id).toBe(true);
    expect(LEGACY_RUN_ID < id).toBe(true);
  });

  it('keeps only letters and digits of a seed the player typed, and is never empty', () => {
    const at = new Date('2026-11-01T12:46:06Z');

    expect(makeRunId(at, '../The Seed!')).toBe('20261101-124606-the-seed');
    expect(makeRunId(at, '!!!')).toBe('20261101-124606-run');
    expect(makeRunId(at, `${'a'.repeat(23)}-bbbb`)).toBe(`20261101-124606-${'a'.repeat(23)}`);
    for (const seed of ['..', 'a/b', 'C:\\x', 'Привет', '']) {
      expect(isRunId(makeRunId(at, seed))).toBe(true);
    }
  });

  it('is told from a folder that is not a run', () => {
    expect(isRunId(LEGACY_RUN_ID)).toBe(true);
    for (const name of ['run', 'state.json', '2026-11-01', '20261101-124606', '20261101-124606-A', '..']) {
      expect(isRunId(name)).toBe(false);
    }
  });
});

describe('where a run is saved', () => {
  it('is runs/<id>/ of the save directory, and nothing is written outside it', async () => {
    const fs = memoryFs();
    const files = runFiles(DIR, RUN_ID);

    await saveRun(DIR, newRun(), fs);

    expect(files.directory).toBe(join(DIR, 'runs', RUN_ID));
    expect(files.current).toBe(join(DIR, 'runs', RUN_ID, 'state.json'));
    expect(fs.directories).toEqual([files.directory]);
    for (const path of fs.files.keys()) expect(path.startsWith(files.directory)).toBe(true);
  });

  it('refuses a run that has no id, since it has no folder', async () => {
    await expect(saveRun(DIR, withoutId(newRun()) as DetectiveRunState, memoryFs())).rejects.toThrow(/no id/);
  });

  it('keeps two runs side by side, each saved back into its own folder', async () => {
    const fs = memoryFs();
    const first = withId(newRun(), '20261101-100000-aaaa');
    const second = withId(newRun(), '20261101-110000-bbbb');

    await saveRun(DIR, first, fs);
    await saveRun(DIR, second, fs);
    const ended = endRun(first, 'gave-up', 'gave-up');
    await saveRun(DIR, ended, fs);

    expect(await listRunIds(DIR, fs)).toEqual(['20261101-100000-aaaa', '20261101-110000-bbbb']);
    expect(await loadRun(DIR, '20261101-100000-aaaa', fs)).toMatchObject({ ok: true, run: ended });
    expect(await loadRun(DIR, '20261101-110000-bbbb', fs)).toMatchObject({ ok: true, run: second });
  });

  it('lists nothing where there are no runs, and only folders that are ids', async () => {
    const fs = memoryFs();
    expect(await listRunIds(DIR, fs)).toEqual([]);

    await saveRun(DIR, newRun(), fs);
    fs.files.set(join(DIR, 'runs', 'notes', 'a.txt'), 'x');
    fs.files.set(join(DIR, 'world.json'), '{}');

    expect(await listRunIds(DIR, fs)).toEqual([RUN_ID]);
  });
});

describe('the current run', () => {
  it('is the newest run that is not over', async () => {
    const fs = memoryFs();
    const old = withId(newRun(), '20261101-100000-aaaa');
    const active = withId(newRun(), '20261101-110000-bbbb');
    const over = endRun(withId(newRun(), '20261101-120000-cccc'), 'gave-up', 'gave-up');
    await saveRun(DIR, old, fs);
    await saveRun(DIR, active, fs);
    await saveRun(DIR, over, fs);

    const current = await loadCurrentRun(DIR, fs);

    expect(current.run).toMatchObject({ runId: '20261101-110000-bbbb', run: active });
    expect(current.damaged).toEqual([]);
  });

  it('is the newest finished run when every run is over, to be read and not played', async () => {
    const fs = memoryFs();
    await saveRun(DIR, endRun(withId(newRun(), '20261101-100000-aaaa'), 'gave-up', 'gave-up'), fs);
    await saveRun(DIR, endRun(withId(newRun(), '20261101-110000-bbbb'), 'gave-up', 'gave-up'), fs);

    expect((await loadCurrentRun(DIR, fs)).run?.runId).toBe('20261101-110000-bbbb');
  });

  it('is none where there are no runs, and an empty folder is no run', async () => {
    const fs = memoryFs();
    expect(await loadCurrentRun(DIR, fs)).toEqual({ run: undefined, damaged: [] });

    fs.files.set(join(DIR, 'runs', '20261101-100000-aaaa', 'state.json.tmp'), 'x');
    expect(await loadCurrentRun(DIR, fs)).toEqual({ run: undefined, damaged: [] });
  });

  it('passes a damaged run by and names it, newest first, leaving it exactly as it was', async () => {
    const fs = memoryFs();
    const good = withId(newRun(), '20261101-100000-aaaa');
    await saveRun(DIR, good, fs);
    const brokenFile = runFiles(DIR, '20261101-110000-bbbb').current;
    const unsupportedFile = runFiles(DIR, '20261101-120000-cccc').current;
    fs.files.set(brokenFile, 'not json {');
    fs.files.set(unsupportedFile, JSON.stringify({ ...good, schemaVersion: 99 }));

    const current = await loadCurrentRun(DIR, fs);

    expect(current.run).toMatchObject({ runId: '20261101-100000-aaaa', run: good });
    expect(current.damaged).toEqual([
      { runId: '20261101-120000-cccc', reason: 'unsupported-version' },
      { runId: '20261101-110000-bbbb', reason: 'corrupt' },
    ]);
    expect(fs.files.get(brokenFile)).toBe('not json {');
  });

  it('is none, with the damaged run named, when the only run is damaged', async () => {
    const fs = memoryFs();
    fs.files.set(runFiles(DIR, '20261101-110000-bbbb').current, '{');

    expect(await loadCurrentRun(DIR, fs)).toEqual({
      run: undefined,
      damaged: [{ runId: '20261101-110000-bbbb', reason: 'corrupt' }],
    });
  });
});

describe('the run of the old layout', () => {
  it('is read like any other, takes the id of its folder and is saved back into it', async () => {
    const fs = memoryFs();
    fs.files.set(runFiles(DIR, LEGACY_RUN_ID).current, JSON.stringify(withoutId(newRun())));

    const loaded = await loadRun(DIR, LEGACY_RUN_ID, fs);

    expect(loaded).toMatchObject({ ok: true, run: { runId: LEGACY_RUN_ID } });
    if (!loaded.ok) throw new Error('The old run did not load.');
    await saveRun(DIR, loaded.run, fs);
    expect([...fs.files.keys()].every((path) => path.startsWith(join(DIR, 'runs', LEGACY_RUN_ID)))).toBe(
      true,
    );
    expect((await loadCurrentRun(DIR, fs)).run?.runId).toBe(LEGACY_RUN_ID);
  });
});

describe('moving the old run into its folder', () => {
  const OLD = join('save-root', 'run');
  const NEW = join('save-root', 'runs', LEGACY_RUN_ID);
  const norm = (path: string): string => path.replaceAll('\\', '/');

  function disk(initial: Record<string, string>) {
    const files = new Map(Object.entries(initial).map(([path, data]) => [norm(path), data]));
    const faults = { write: false, rename: false, remove: false, corrupt: false };
    const under = (directory: string) =>
      [...files.keys()].filter((path) => path.startsWith(`${norm(directory)}/`));
    const fs: MoveFs = {
      exists: (path) => Promise.resolve(files.has(norm(path)) || under(path).length > 0),
      listFiles: (directory) =>
        Promise.resolve(under(directory).map((path) => path.slice(norm(directory).length + 1))),
      readFile: (path) => Promise.resolve(files.get(norm(path)) ?? ''),
      writeFile: (path, data) => {
        if (faults.write) return Promise.reject(new Error('disk full'));
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
        if (faults.remove && norm(directory) === norm(OLD)) return Promise.reject(new Error('locked'));
        for (const path of under(directory)) files.delete(path);
        return Promise.resolve();
      },
    };
    return { fs, files, faults };
  }

  const OLD_RUN = {
    [join(OLD, 'state.json')]: '{"run":1}',
    [join(OLD, 'log.json')]: '[]',
    [join('save-root', 'world.json')]: '{}',
  };

  it('moves saves/run to saves/runs/00000000-legacy, and leaves the rest of the saves where they are', async () => {
    const d = disk(OLD_RUN);

    expect(await moveLegacyRun('save-root', d.fs)).toEqual({
      status: 'moved',
      from: OLD,
      to: NEW,
      files: 2,
    });
    expect([...d.files.keys()].sort()).toEqual(
      [`${norm(NEW)}/state.json`, `${norm(NEW)}/log.json`, 'save-root/world.json'].sort(),
    );
  });

  it('does nothing when there is no old run, the second time, or when the folder is empty', async () => {
    expect(await moveLegacyRun('save-root', disk({}).fs)).toEqual({ status: 'none' });
    const d = disk(OLD_RUN);
    await moveLegacyRun('save-root', d.fs);
    expect(await moveLegacyRun('save-root', d.fs)).toEqual({ status: 'none' });
  });

  it('removes a leftover old folder only when it holds the same files as the new one', async () => {
    const same = disk({ ...OLD_RUN, [join(NEW, 'state.json')]: '{"run":1}', [join(NEW, 'log.json')]: '[]' });
    expect(await moveLegacyRun('save-root', same.fs)).toEqual({ status: 'cleaned', from: OLD, to: NEW });
    expect([...same.files.keys()].some((path) => path.startsWith(`${norm(OLD)}/`))).toBe(false);

    const different = disk({ ...OLD_RUN, [join(NEW, 'state.json')]: '{"run":2}' });
    expect(await moveLegacyRun('save-root', different.fs)).toEqual({ status: 'none' });
    expect(different.files.get(`${norm(OLD)}/state.json`)).toBe('{"run":1}');
  });

  it('removes nothing when a copy fails, a copy does not match or the rename fails', async () => {
    for (const fault of ['write', 'corrupt', 'rename'] as const) {
      const d = disk(OLD_RUN);
      d.faults[fault] = true;

      const moved = await moveLegacyRun('save-root', d.fs);

      expect(moved.status).toBe('failed');
      expect(d.files.get(`${norm(OLD)}/state.json`)).toBe('{"run":1}');
      expect(d.files.get(`${norm(OLD)}/log.json`)).toBe('[]');
      expect([...d.files.keys()].some((path) => path.includes('.moving'))).toBe(false);
    }
  });

  it('counts a leftover that cannot be removed as moved, since the run is safe at its new place', async () => {
    const d = disk(OLD_RUN);
    d.faults.remove = true;

    expect((await moveLegacyRun('save-root', d.fs)).status).toBe('moved');
    expect(d.files.get(`${norm(NEW)}/state.json`)).toBe('{"run":1}');
  });

  it('moves a real folder, in the save directory of this process', async () => {
    const home = await mkdtemp(join(tmpdir(), 'race-runs-'));
    try {
      vi.stubEnv('RACE_HOME', home);
      expect(await moveDefaultLegacyRun()).toEqual({ status: 'none' });

      await mkdir(join(home, 'run'), { recursive: true });
      await writeFile(join(home, 'run', 'state.json'), '{"run":1}', 'utf8');
      const moved = await moveDefaultLegacyRun();

      expect(moved.status).toBe('moved');
      expect(await readFile(join(home, 'runs', LEGACY_RUN_ID, 'state.json'), 'utf8')).toBe('{"run":1}');
      expect(await nodeMoveFs.exists(join(home, 'run'))).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe('listing a real directory', () => {
  it('names what it holds, and nothing for a directory that is not there', async () => {
    const home = await mkdtemp(join(tmpdir(), 'race-list-'));
    try {
      await mkdir(join(home, 'a'));
      await writeFile(join(home, 'b.txt'), 'x', 'utf8');

      expect((await nodeSaveFs.list(home)).sort()).toEqual(['a', 'b.txt']);
      expect(await nodeSaveFs.list(join(home, 'missing'))).toEqual([]);
      await expect(nodeSaveFs.list(join(home, 'b.txt'))).rejects.toThrow();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
