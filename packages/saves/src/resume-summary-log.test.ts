// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { memoryFs } from '../test/memory-fs.js';
import { WALK, newRun, playTurns, RUN_ID } from '../test/new-run.js';
import { buildResumeSummary } from './resume-summary.js';
import { loadRun, runFiles, saveRun } from './run-store.js';

const DIR = join('save-root');

describe('the resume summary and the log', () => {
  it('is built from the run alone: the log neither changes it nor leaks into it', async () => {
    // A run of the ruleset before the road, so that the walk draws no dice and the same clues are missed as when this was written.
    const { run, log } = playTurns({ ...newRun(), rulesetVersion: 7 }, WALK);
    const fs = memoryFs();
    await saveRun(DIR, run, fs, log);
    const loaded = await loadRun(DIR, RUN_ID, fs);
    if (!loaded.ok) throw new Error('The save did not load.');

    // Clues that the log rolled for but the hero did not find are exactly what the summary must not name.
    const rolled = log.flatMap(({ details }) =>
      details.flatMap(({ subject }) => (subject.kind === 'clue' ? [subject.id] : [])),
    );
    const hidden = rolled.filter((id) => !run.foundClueIds.includes(id));
    expect(hidden.length).toBeGreaterThan(0);

    const summary = buildResumeSummary(loaded.run);
    expect(buildResumeSummary(run)).toBe(summary);
    for (const id of hidden) expect(summary).not.toContain(id);
  });

  it('does not read the log file at all', async () => {
    const { run, log } = playTurns(newRun(), WALK);
    const withLog = memoryFs();
    const withoutLog = memoryFs();
    await saveRun(DIR, run, withLog, log);
    await saveRun(DIR, run, withoutLog);
    withLog.failRead(runFiles(DIR, RUN_ID).currentLog);

    // The summary takes a run and nothing else, so a log that cannot even be read changes nothing for it.
    const loaded = await loadRun(DIR, RUN_ID, withoutLog);
    if (!loaded.ok) throw new Error('The save did not load.');
    expect(buildResumeSummary(loaded.run)).toBe(buildResumeSummary(run));
  });
});
