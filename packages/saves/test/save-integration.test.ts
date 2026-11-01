// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  endTurn,
  findClue,
  moveTo,
  restoreRng,
  spendTime,
  type DetectiveRunState,
  type Rng,
} from '@the-race/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRun, nodeSaveFs, resolveSaveDir, runFiles, saveRun } from '../src/index.js';
import { newRun, RUN_ID } from './new-run.js';

let workingDirectory = '';

/** The save directory the way a player sets it: RACE_HOME, here a temp directory. */
function defaultSaveDir(root: string): string {
  return resolveSaveDir({ env: { RACE_HOME: root }, platform: process.platform, homedir: root });
}

beforeEach(async () => {
  workingDirectory = await mkdtemp(join(tmpdir(), 'race-saves-'));
});

afterEach(async () => {
  await rm(workingDirectory, { recursive: true, force: true });
});

/** The same transitions, whatever dice they are given. */
function playTurn(run: DetectiveRunState, rng: Rng): { run: DetectiveRunState; die: number } {
  const die = rng.roll(20);
  const moved = spendTime(moveTo(run, 'cheese-stall'), 30);
  const found = die >= 10 ? findClue(moved, 'flour-crumbs') : moved;
  return { run: endTurn(found, rng), die };
}

describe('save and resume over a real directory', () => {
  it('writes under run/ in the save directory and leaves no temp file behind', async () => {
    const saveDir = defaultSaveDir(workingDirectory);

    await saveRun(saveDir, newRun());
    await saveRun(saveDir, newRun());

    expect((await readdir(runFiles(saveDir, RUN_ID).directory)).sort()).toEqual([
      'state.json',
      'state.prev.json',
    ]);
  });

  it('resumes the exact state and the next roll', async () => {
    const saveDir = defaultSaveDir(workingDirectory);
    const start = newRun();
    const rng = restoreRng(start.rngState);
    const first = playTurn(start, rng);
    await saveRun(saveDir, first.run);

    const inMemory = playTurn(first.run, rng);

    const loaded = await loadRun(saveDir, RUN_ID);
    if (!loaded.ok) throw new Error('The save did not load.');
    expect(loaded.run).toEqual(first.run);
    const resumed = playTurn(loaded.run, restoreRng(loaded.run.rngState));

    expect(resumed.die).toBe(inMemory.die);
    expect(resumed.run).toEqual(inMemory.run);
  });

  it('falls back to the previous generation when the current file is truncated on disk', async () => {
    const saveDir = defaultSaveDir(workingDirectory);
    const files = runFiles(saveDir, RUN_ID);
    const first = newRun();
    const second = playTurn(first, restoreRng(first.rngState)).run;
    await saveRun(saveDir, first);
    await saveRun(saveDir, second);

    await writeFile(files.current, '{"schemaVersion":1,"se');

    expect(await loadRun(saveDir, RUN_ID)).toMatchObject({
      ok: true,
      run: first,
      source: 'previous',
      currentProblem: 'corrupt',
    });
  });

  it('reports a missing save, and an unreadable one without throwing', async () => {
    const saveDir = defaultSaveDir(workingDirectory);
    expect(await loadRun(saveDir, RUN_ID)).toMatchObject({ ok: false, reason: 'missing' });

    // A directory where the state file should be: reading it fails with something other than ENOENT.
    await mkdir(runFiles(saveDir, RUN_ID).current, { recursive: true });
    expect(await loadRun(saveDir, RUN_ID)).toMatchObject({ ok: false, reason: 'unreadable' });
  });

  it('removes a file that is not there without complaint', async () => {
    await expect(nodeSaveFs.remove(join(workingDirectory, 'nothing'))).resolves.toBeUndefined();
  });
});
