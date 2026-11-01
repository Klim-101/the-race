// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { RunLog } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { memoryFs } from '../test/memory-fs.js';
import { WALK, newRun, playTurns, RUN_ID } from '../test/new-run.js';
import { loadRun, runFiles, saveRun } from './run-store.js';

const DIR = join('save-root');
const FILES = runFiles(DIR, RUN_ID);

const start = newRun();
const early = playTurns(start, WALK.slice(0, 2));
const late = playTurns(start, WALK);

/** The same log with its last entry changed, so that it no longer replays. */
function tamper(log: RunLog): RunLog {
  const last = log[log.length - 1];
  if (last === undefined) throw new Error('The fixture log is empty.');
  return [...log.slice(0, -1), { ...last, reputation: last.reputation + 1 }];
}

describe('the log beside the run', () => {
  it('plays enough turns for the tests', () => {
    expect(early.log).toHaveLength(2);
    expect(late.log.length).toBeGreaterThan(early.log.length);
  });

  it('is written next to the state and comes back with the run', async () => {
    const fs = memoryFs();

    await saveRun(DIR, late.run, fs, late.log);

    expect([...fs.files.keys()].sort()).toEqual([FILES.currentLog, FILES.current].sort());
    expect(await loadRun(DIR, RUN_ID, fs)).toEqual({
      ok: true,
      run: late.run,
      log: late.log,
      source: 'current',
    });
  });

  it('round-trips a run that has no turns yet', async () => {
    const fs = memoryFs();

    await saveRun(DIR, start, fs, []);

    expect(await loadRun(DIR, RUN_ID, fs)).toEqual({ ok: true, run: start, log: [], source: 'current' });
  });

  it('keeps the generation before the current one, log included', async () => {
    const fs = memoryFs();

    await saveRun(DIR, early.run, fs, early.log);
    await saveRun(DIR, late.run, fs, late.log);

    expect(JSON.parse(fs.files.get(FILES.previousLog) ?? '')).toEqual(early.log);
    expect(JSON.parse(fs.files.get(FILES.currentLog) ?? '')).toEqual(late.log);
    expect(JSON.parse(fs.files.get(FILES.previous) ?? '')).toEqual(early.run);
  });

  it('refuses to save a log that does not replay to the run', async () => {
    const fs = memoryFs();

    await expect(saveRun(DIR, late.run, fs, tamper(late.log))).rejects.toThrow(/does not replay/);
    await expect(saveRun(DIR, late.run, fs, early.log)).rejects.toThrow(/does not replay/);
    await expect(saveRun(DIR, late.run, fs, [...late.log].reverse())).rejects.toThrow();
    expect(fs.files.size).toBe(0);
  });
});

describe('a save made before logs were stored', () => {
  it('loads with an empty log', async () => {
    const fs = memoryFs();
    await saveRun(DIR, late.run, fs);

    expect(fs.files.has(FILES.currentLog)).toBe(false);
    expect(await loadRun(DIR, RUN_ID, fs)).toEqual({ ok: true, run: late.run, log: [], source: 'current' });
  });

  it('removes a stale log when saved without one, so it cannot contradict the new state', async () => {
    const fs = memoryFs();
    await saveRun(DIR, early.run, fs, early.log);

    await saveRun(DIR, late.run, fs);

    expect(fs.files.has(FILES.currentLog)).toBe(false);
    expect(await loadRun(DIR, RUN_ID, fs)).toMatchObject({ ok: true, run: late.run, log: [] });
  });

  it('drops the previous log when the generation it replaces had none', async () => {
    const fs = memoryFs();
    await saveRun(DIR, early.run, fs);
    fs.files.set(FILES.previousLog, 'stale');

    await saveRun(DIR, late.run, fs, late.log);

    expect(fs.files.has(FILES.previousLog)).toBe(false);
    expect(fs.files.has(FILES.previous)).toBe(true);
  });
});

describe('a log that does not replay', () => {
  it('is reported with its own reason', async () => {
    const fs = memoryFs();
    await saveRun(DIR, late.run, fs, late.log);
    fs.files.set(FILES.currentLog, JSON.stringify(tamper(late.log)));

    expect(await loadRun(DIR, RUN_ID, fs)).toMatchObject({ ok: false, reason: 'log-mismatch' });
  });

  it('is reported when the log is empty but the run has turns behind it', async () => {
    const fs = memoryFs();
    await saveRun(DIR, late.run, fs, late.log);
    fs.files.set(FILES.currentLog, '[]');

    expect(await loadRun(DIR, RUN_ID, fs)).toMatchObject({ ok: false, reason: 'log-mismatch' });
  });

  it('is reported when the log belongs to another point of the same run', async () => {
    const fs = memoryFs();
    await saveRun(DIR, late.run, fs, late.log);
    fs.files.set(FILES.currentLog, JSON.stringify(early.log));

    expect(await loadRun(DIR, RUN_ID, fs)).toMatchObject({ ok: false, reason: 'log-mismatch' });
  });

  it('falls back to the previous pair and says why', async () => {
    const fs = memoryFs();
    await saveRun(DIR, early.run, fs, early.log);
    await saveRun(DIR, late.run, fs, late.log);
    fs.files.set(FILES.currentLog, JSON.stringify(tamper(late.log)));

    expect(await loadRun(DIR, RUN_ID, fs)).toEqual({
      ok: true,
      run: early.run,
      log: early.log,
      source: 'previous',
      currentProblem: 'log-mismatch',
    });
  });

  it('does not let a mismatched pair overwrite a good previous generation', async () => {
    const fs = memoryFs();
    await saveRun(DIR, start, fs, []);
    await saveRun(DIR, early.run, fs, early.log);
    fs.files.set(FILES.currentLog, JSON.stringify(tamper(early.log)));

    await saveRun(DIR, late.run, fs, late.log);

    expect(JSON.parse(fs.files.get(FILES.previous) ?? '')).toEqual(start);
    expect(JSON.parse(fs.files.get(FILES.previousLog) ?? '')).toEqual([]);
  });
});

describe('a log file that is damaged', () => {
  it('is corrupt when it is not JSON', async () => {
    const fs = memoryFs();
    await saveRun(DIR, late.run, fs, late.log);
    fs.files.set(FILES.currentLog, 'not json {');

    expect(await loadRun(DIR, RUN_ID, fs)).toMatchObject({ ok: false, reason: 'corrupt' });
  });

  it('is corrupt when it fails the log schema', async () => {
    const fs = memoryFs();
    await saveRun(DIR, late.run, fs, late.log);
    fs.files.set(FILES.currentLog, JSON.stringify([{ turn: 'x' }]));

    expect(await loadRun(DIR, RUN_ID, fs)).toMatchObject({
      ok: false,
      reason: 'corrupt',
      detail: 'The log file does not match the log schema.',
    });
  });

  it('is unreadable when it cannot be read, and the previous pair is used', async () => {
    const fs = memoryFs();
    await saveRun(DIR, early.run, fs, early.log);
    await saveRun(DIR, late.run, fs, late.log);
    fs.failRead(FILES.currentLog);

    expect(await loadRun(DIR, RUN_ID, fs)).toMatchObject({
      ok: true,
      run: early.run,
      source: 'previous',
      currentProblem: 'unreadable',
    });
  });

  it('is unreadable with no previous pair', async () => {
    const fs = memoryFs();
    await saveRun(DIR, late.run, fs, late.log);
    fs.failRead(FILES.currentLog);

    expect(await loadRun(DIR, RUN_ID, fs)).toMatchObject({ ok: false, reason: 'unreadable' });
  });
});

describe('saving over a log that cannot be read', () => {
  it('saves on and does not rotate a generation it cannot vouch for', async () => {
    const fs = memoryFs();
    await saveRun(DIR, early.run, fs, early.log);
    fs.failRead(FILES.currentLog);

    await saveRun(DIR, late.run, fs, late.log);

    // The unreadable log reads as absent, which makes the old pair a legacy one: it is still rotated.
    expect(fs.files.has(FILES.current)).toBe(true);
    expect(fs.files.has(FILES.previousLog)).toBe(false);
  });
});

describe('a crash in the middle of saving a pair', () => {
  it('after the log and before the state, falls back to a whole pair', async () => {
    const fs = memoryFs();
    await saveRun(DIR, early.run, fs, early.log);

    fs.failRename(FILES.current);
    await expect(saveRun(DIR, late.run, fs, late.log)).rejects.toThrow('rename failed');

    // The new log is in place beside the old state, which do not replay; the rotated generation does.
    expect(await loadRun(DIR, RUN_ID, fs)).toMatchObject({
      ok: true,
      run: early.run,
      log: early.log,
      source: 'previous',
      currentProblem: 'log-mismatch',
    });
  });

  it('while the log is written, leaves the old pair whole and no temp file', async () => {
    const fs = memoryFs();
    await saveRun(DIR, early.run, fs, early.log);

    fs.failRename(FILES.currentLog);
    await expect(saveRun(DIR, late.run, fs, late.log)).rejects.toThrow('rename failed');

    expect(fs.files.has(`${FILES.currentLog}.tmp`)).toBe(false);
    expect(await loadRun(DIR, RUN_ID, fs)).toMatchObject({ ok: true, run: early.run, source: 'current' });
  });

  it('while the previous log is rotated, leaves the current pair whole', async () => {
    const fs = memoryFs();
    await saveRun(DIR, early.run, fs, early.log);

    fs.failRename(FILES.previousLog);
    await expect(saveRun(DIR, late.run, fs, late.log)).rejects.toThrow('rename failed');

    expect(await loadRun(DIR, RUN_ID, fs)).toMatchObject({ ok: true, run: early.run, source: 'current' });
  });
});
