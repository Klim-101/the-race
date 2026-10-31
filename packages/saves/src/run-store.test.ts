// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import {
  endTurn,
  createRng,
  findClue,
  moveTo,
  RUN_SCHEMA_VERSION,
  type DetectiveRunState,
} from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { WALK, newRun, playTurns } from '../test/new-run.js';
import { loadRun, runFiles, saveRun } from './run-store.js';
import { memoryFs } from '../test/memory-fs.js';

const DIR = join('save-root');
const FILES = runFiles(DIR);

function secondTurn(run: DetectiveRunState): DetectiveRunState {
  return endTurn(findClue(moveTo(run, 'cheese-stall'), 'flour-crumbs'), createRng('next'));
}

describe('runFiles', () => {
  it('puts the save under run/ of the save directory', () => {
    expect(FILES.current).toBe(join(DIR, 'run', 'state.json'));
    expect(FILES.previous).toBe(join(DIR, 'run', 'state.prev.json'));
  });
});

describe('saveRun and loadRun', () => {
  it('round-trips a run exactly', async () => {
    const fs = memoryFs();
    const run = secondTurn(newRun());

    await saveRun(DIR, run, fs);
    const loaded = await loadRun(DIR, fs);

    expect(loaded).toEqual({ ok: true, run, log: [], source: 'current' });
    expect(fs.directories).toEqual([FILES.directory]);
    expect([...fs.files.keys()]).toEqual([FILES.current]);
  });

  it('keeps the generation before the current one', async () => {
    const fs = memoryFs();
    const first = newRun();
    const second = secondTurn(first);

    await saveRun(DIR, first, fs);
    await saveRun(DIR, second, fs);

    expect(JSON.parse(fs.files.get(FILES.previous) ?? '')).toEqual(first);
    expect(JSON.parse(fs.files.get(FILES.current) ?? '')).toEqual(second);
  });

  it('refuses to save a state whose case changed after it was sealed', async () => {
    const run = newRun();
    const tampered = { ...run, case: { ...run.case, title: 'Another case' } };

    await expect(saveRun(DIR, tampered, memoryFs())).rejects.toThrow(/seal/);
  });

  it('reports a missing save', async () => {
    expect(await loadRun(DIR, memoryFs())).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('reports a file that is not JSON as corrupt', async () => {
    const fs = memoryFs();
    fs.files.set(FILES.current, 'not json {');

    expect(await loadRun(DIR, fs)).toMatchObject({ ok: false, reason: 'corrupt' });
  });

  it('reports a file that fails the schema as corrupt', async () => {
    const fs = memoryFs();
    fs.files.set(FILES.current, JSON.stringify({ schemaVersion: 1, turn: 'x' }));
    fs.files.set(FILES.previous, '[]');

    expect(await loadRun(DIR, fs)).toMatchObject({ ok: false, reason: 'corrupt' });
  });

  it('reports a field of the wrong type as a schema problem, not a seal problem', async () => {
    const fs = memoryFs();
    fs.files.set(FILES.current, JSON.stringify({ ...newRun(), turn: 'x' }));

    expect(await loadRun(DIR, fs)).toMatchObject({
      ok: false,
      reason: 'corrupt',
      detail: 'The file does not match the run schema.',
    });
  });

  it('reports a case that no longer matches its seal as corrupt', async () => {
    const fs = memoryFs();
    const run = newRun();
    fs.files.set(FILES.current, JSON.stringify({ ...run, case: { ...run.case, title: 'Swapped' } }));

    const loaded = await loadRun(DIR, fs);

    expect(loaded).toMatchObject({
      ok: false,
      reason: 'corrupt',
      detail: 'The case no longer matches its seal.',
    });
  });

  it('reports a schema version this engine does not know, without falling back', async () => {
    const fs = memoryFs();
    await saveRun(DIR, newRun(), fs);
    fs.files.set(FILES.current, JSON.stringify({ ...newRun(), schemaVersion: 99 }));

    expect(await loadRun(DIR, fs)).toMatchObject({ ok: false, reason: 'unsupported-version' });
  });

  it('names both versions when a save comes from a newer engine', async () => {
    const fs = memoryFs();
    fs.files.set(FILES.current, JSON.stringify({ ...newRun(), schemaVersion: 99 }));

    const loaded = await loadRun(DIR, fs);

    expect(loaded).toMatchObject({ ok: false, reason: 'unsupported-version' });
    expect(loaded.ok ? '' : loaded.detail).toMatch(new RegExp(`99.*newer.*${String(RUN_SCHEMA_VERSION)}`));
  });

  it('reports an older version with no migration as unsupported', async () => {
    const fs = memoryFs();
    fs.files.set(FILES.current, JSON.stringify({ ...newRun(), schemaVersion: 0 }));

    expect(await loadRun(DIR, fs)).toMatchObject({ ok: false, reason: 'unsupported-version' });
  });

  it('does not take a non-numeric schema version for a version', async () => {
    const fs = memoryFs();
    fs.files.set(FILES.current, JSON.stringify({ schemaVersion: 'one' }));

    expect(await loadRun(DIR, fs)).toMatchObject({ ok: false, reason: 'corrupt' });
  });

  it('reports a file that cannot be read instead of throwing', async () => {
    const fs = memoryFs();
    fs.failRead(FILES.current);

    expect(await loadRun(DIR, fs)).toMatchObject({ ok: false, reason: 'unreadable' });
  });
});

describe('loading an older save', () => {
  // A made-up version 0 that called the turn counter `turnNumber`.
  const migrations = {
    0: (raw: Readonly<Record<string, unknown>>) => {
      const { turnNumber, ...rest } = raw;
      return { ...rest, turn: turnNumber };
    },
    // The real step from version 1 moves the clock; the made-up save already has a current clock.
    1: (raw: Readonly<Record<string, unknown>>) => raw,
  };
  function oldSave(run: DetectiveRunState): string {
    const { turn, ...rest } = run;
    return JSON.stringify({ ...rest, schemaVersion: 0, turnNumber: turn });
  }

  it('migrates it in memory and leaves the file alone until the next save', async () => {
    const fs = memoryFs();
    const run = secondTurn(newRun());
    fs.files.set(FILES.current, oldSave(run));

    const loaded = await loadRun(DIR, fs, migrations);

    expect(loaded).toEqual({ ok: true, run, log: [], source: 'current' });
    expect(JSON.parse(fs.files.get(FILES.current) ?? '')).toHaveProperty('schemaVersion', 0);

    await saveRun(DIR, run, fs);
    expect(JSON.parse(fs.files.get(FILES.current) ?? '')).toHaveProperty('schemaVersion', RUN_SCHEMA_VERSION);
  });

  it('reports a migration that throws as corrupt', async () => {
    const fs = memoryFs();
    fs.files.set(FILES.current, oldSave(newRun()));
    const broken = {
      0: () => {
        throw new Error('boom');
      },
    };

    expect(await loadRun(DIR, fs, broken)).toMatchObject({ ok: false, reason: 'corrupt' });
  });

  it('reports a migrated save that still fails the schema as corrupt', async () => {
    const fs = memoryFs();
    fs.files.set(FILES.current, oldSave(newRun()));

    expect(await loadRun(DIR, fs, { 0: () => ({}), 1: (raw) => raw })).toMatchObject({
      ok: false,
      reason: 'corrupt',
    });
  });
});

describe('falling back to the previous generation', () => {
  async function twoGenerations(): Promise<{
    fs: ReturnType<typeof memoryFs>;
    first: DetectiveRunState;
    second: DetectiveRunState;
  }> {
    const fs = memoryFs();
    const first = newRun();
    const second = secondTurn(first);
    await saveRun(DIR, first, fs);
    await saveRun(DIR, second, fs);
    return { fs, first, second };
  }

  it('uses it when the current file was truncated, and says so', async () => {
    const { fs, first } = await twoGenerations();
    fs.files.set(FILES.current, (fs.files.get(FILES.current) ?? '').slice(0, 40));

    expect(await loadRun(DIR, fs)).toEqual({
      ok: true,
      run: first,
      log: [],
      source: 'previous',
      currentProblem: 'corrupt',
    });
  });

  it('uses it when the current file is garbage', async () => {
    const { fs, first } = await twoGenerations();
    fs.files.set(FILES.current, '\u0000\u0000\u0000');

    expect(await loadRun(DIR, fs)).toMatchObject({ ok: true, run: first, source: 'previous' });
  });

  it('uses it when the current file is missing', async () => {
    const { fs, first } = await twoGenerations();
    fs.files.delete(FILES.current);

    expect(await loadRun(DIR, fs)).toEqual({
      ok: true,
      run: first,
      log: [],
      source: 'previous',
      currentProblem: 'missing',
    });
  });

  it('uses it when the current file cannot be read', async () => {
    const { fs, first } = await twoGenerations();
    fs.failRead(FILES.current);

    expect(await loadRun(DIR, fs)).toMatchObject({ ok: true, run: first, currentProblem: 'unreadable' });
  });

  it('names the current problem when both files are bad', async () => {
    const { fs } = await twoGenerations();
    fs.files.set(FILES.current, 'garbage');
    fs.files.set(FILES.previous, 'garbage');

    expect(await loadRun(DIR, fs)).toMatchObject({ ok: false, reason: 'corrupt' });
  });

  it('names the previous problem when there is no current file', async () => {
    const fs = memoryFs();
    fs.files.set(FILES.previous, 'garbage');

    expect(await loadRun(DIR, fs)).toMatchObject({ ok: false, reason: 'corrupt' });
  });
});

describe('a crash in the middle of a save', () => {
  it('after the temp file is written, loses nothing and the next save works', async () => {
    const fs = memoryFs();
    const first = newRun();
    const second = secondTurn(first);
    await saveRun(DIR, first, fs);

    fs.failRename(FILES.current);
    await expect(saveRun(DIR, second, fs)).rejects.toThrow('rename failed');

    expect(fs.files.has(`${FILES.current}.tmp`)).toBe(false);
    expect(await loadRun(DIR, fs)).toMatchObject({ ok: true, run: first });

    fs.failRename(undefined);
    await saveRun(DIR, second, fs);
    expect(await loadRun(DIR, fs)).toMatchObject({ ok: true, run: second, source: 'current' });
  });

  it('leaves the temp file behind when even its cleanup fails, and the save is still whole', async () => {
    const fs = memoryFs();
    const first = newRun();
    await saveRun(DIR, first, fs, []);

    fs.failRename(FILES.current);
    fs.failRemove();
    const played = playTurns(first, WALK);
    await expect(saveRun(DIR, played.run, fs, played.log)).rejects.toThrow('rename failed');

    expect(fs.files.has(`${FILES.current}.tmp`)).toBe(true);
    expect(await loadRun(DIR, fs)).toMatchObject({ ok: true, run: first, source: 'previous' });
  });

  it('while the previous generation is rotated, still keeps the current file', async () => {
    const fs = memoryFs();
    const first = newRun();
    await saveRun(DIR, first, fs);

    fs.failRename(FILES.previous);
    await expect(saveRun(DIR, secondTurn(first), fs)).rejects.toThrow('rename failed');

    expect(await loadRun(DIR, fs)).toMatchObject({ ok: true, run: first, source: 'current' });
  });

  it('does not let a corrupt current file overwrite a good previous generation', async () => {
    const fs = memoryFs();
    const first = newRun();
    const second = secondTurn(first);
    const third = endTurn(second, createRng('third'));
    await saveRun(DIR, first, fs);
    await saveRun(DIR, second, fs);
    fs.files.set(FILES.current, 'truncated {');

    await saveRun(DIR, third, fs);

    expect(JSON.parse(fs.files.get(FILES.previous) ?? '')).toEqual(first);
    expect(await loadRun(DIR, fs)).toMatchObject({ ok: true, run: third, source: 'current' });
  });

  it('saves on when the current file cannot be read', async () => {
    const fs = memoryFs();
    fs.failRead(FILES.current);

    await saveRun(DIR, newRun(), fs);

    expect(fs.files.has(FILES.current)).toBe(true);
    expect(fs.files.has(FILES.previous)).toBe(false);
  });
});

describe('the history of the clues in a save', () => {
  it('is rebuilt from the log for a save made before the history existed, instead of refusing it', async () => {
    const fs = memoryFs();
    const played = playTurns(newRun(), WALK);
    await saveRun(DIR, played.run, fs, played.log);
    expect(played.run.history.finds.length).toBeGreaterThan(0);

    // The same save as an older version wrote it: the state has no history at all.
    const old = JSON.parse(fs.files.get(FILES.current) ?? '') as Record<string, unknown>;
    delete old.history;
    fs.files.set(FILES.current, JSON.stringify(old));
    const loaded = await loadRun(DIR, fs);

    expect(loaded).toMatchObject({ ok: true });
    expect(loaded.ok && loaded.run.history).toEqual(played.run.history);
  });

  it('is held to the log when the save has one: a history that the log does not give is refused', async () => {
    const fs = memoryFs();
    const played = playTurns(newRun(), WALK);
    await saveRun(DIR, played.run, fs, played.log);

    const tampered = JSON.parse(fs.files.get(FILES.current) ?? '') as {
      history: { finds: { clueId: string }[] };
    };
    tampered.history.finds.pop();
    fs.files.set(FILES.current, JSON.stringify(tampered));

    expect(await loadRun(DIR, fs)).toMatchObject({ ok: false });
  });
});
