// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { memoryFs } from '../test/memory-fs.js';
import {
  GenerationStatsSchema,
  MAX_LOG_ENTRIES,
  appendGenerationEntry,
  generationLogFile,
  loadGenerationLog,
  summarizeGeneration,
  type GenerationEntry,
} from './generation-log.js';

const DIR = 'game-folder';

const entry = (overrides: Partial<GenerationEntry> = {}): GenerationEntry => ({
  date: '2026-11-06',
  seed: 'seed-1',
  locale: 'en',
  theme: 'forgery',
  archetype: 'detective',
  stage: 'text',
  attempt: 1,
  outcome: 'accepted',
  codes: [],
  issues: 0,
  ...overrides,
});
const rejected = (attempt: number, codes: string[], outcome: 'rejected' | 'final' = 'rejected') =>
  entry({ attempt, outcome, codes, issues: codes.length + 1 });

describe('the log of the cases the generator submitted', () => {
  it('is empty where there is none, and where it cannot be read or is not a log', async () => {
    const fs = memoryFs();
    expect(await loadGenerationLog(DIR, fs)).toEqual([]);

    fs.files.set(generationLogFile(DIR), 'not json');
    expect(await loadGenerationLog(DIR, fs)).toEqual([]);

    fs.files.set(generationLogFile(DIR), JSON.stringify({ schemaVersion: 1, entries: [{ attempt: 0 }] }));
    expect(await loadGenerationLog(DIR, fs)).toEqual([]);

    fs.failRead(generationLogFile(DIR));
    expect(await loadGenerationLog(DIR, fs)).toEqual([]);
  });

  it('adds each entry after the last, in the game folder, and writes the whole file', async () => {
    const fs = memoryFs();

    await appendGenerationEntry(DIR, rejected(1, ['unreachable-location']), fs);
    await appendGenerationEntry(DIR, entry({ attempt: 2 }), fs);

    expect((await loadGenerationLog(DIR, fs)).map(({ attempt, outcome }) => [attempt, outcome])).toEqual([
      [1, 'rejected'],
      [2, 'accepted'],
    ]);
    expect(fs.directories).toContain(DIR);
    expect(fs.files.has(`${generationLogFile(DIR)}.tmp`)).toBe(false);
  });

  it('keeps the newest entries only, so that the file stays small', async () => {
    const fs = memoryFs();
    const old = Array.from({ length: MAX_LOG_ENTRIES }, (_, index) =>
      entry({ seed: `old-${String(index)}` }),
    );
    fs.files.set(generationLogFile(DIR), JSON.stringify({ schemaVersion: 1, entries: old }));

    await appendGenerationEntry(DIR, entry({ seed: 'newest' }), fs);

    const log = await loadGenerationLog(DIR, fs);
    expect(log).toHaveLength(MAX_LOG_ENTRIES);
    expect(log[0]?.seed).toBe('old-1');
    expect(log.at(-1)?.seed).toBe('newest');
  });

  it('refuses an entry that is not one, and leaves the log as it was', async () => {
    const fs = memoryFs();
    await appendGenerationEntry(DIR, entry(), fs);
    const before = fs.files.get(generationLogFile(DIR));

    await expect(appendGenerationEntry(DIR, entry({ attempt: 0 }), fs)).rejects.toThrow();

    expect(fs.files.get(generationLogFile(DIR))).toBe(before);
  });

  it('holds codes and counts and no text: a message of the engine may quote the case', async () => {
    const fs = memoryFs();
    await appendGenerationEntry(DIR, rejected(1, ['map-too-small']), fs);

    const written = JSON.parse(fs.files.get(generationLogFile(DIR)) ?? '{}') as {
      entries: Record<string, unknown>[];
    };
    expect(Object.keys(written.entries[0] ?? {}).sort()).toEqual([
      'archetype',
      'attempt',
      'codes',
      'date',
      'issues',
      'locale',
      'outcome',
      'seed',
      'stage',
      'theme',
    ]);
  });

  it('reads an entry written before the stages as one of the text stage', async () => {
    const fs = memoryFs();
    const old: Partial<GenerationEntry> = entry({ attempt: 2 });
    delete old.stage;
    fs.files.set(generationLogFile(DIR), JSON.stringify({ schemaVersion: 1, entries: [old] }));

    expect(await loadGenerationLog(DIR, fs)).toEqual([entry({ attempt: 2 })]);
  });
});

describe('the sum of the log', () => {
  it('is empty for an empty log', () => {
    expect(summarizeGeneration([])).toEqual({
      accepted: 0,
      failed: 0,
      acceptedOnAttempt: [],
      frames: { accepted: 0, rejected: 0 },
      codes: [],
    });
  });

  describe('with the stages', () => {
    const frame = (attempt: number, outcome: 'framed' | 'rejected' | 'final', codes: string[] = []) =>
      entry({ stage: 'frame', attempt, outcome, codes });

    it('counts the frames accepted and rejected, apart from the cases', () => {
      const stats = summarizeGeneration([
        frame(1, 'rejected', ['unreachable-location']),
        frame(2, 'framed'),
        entry({ attempt: 1 }),
        frame(1, 'framed'),
        frame(1, 'rejected', ['schema']),
        frame(2, 'rejected', ['schema']),
        frame(3, 'final', ['schema']),
      ]);

      expect(stats).toMatchObject({ accepted: 1, failed: 1, frames: { accepted: 2, rejected: 4 } });
      expect(stats.codes).toEqual([
        { code: 'schema', count: 3 },
        { code: 'unreachable-location', count: 1 },
      ]);
    });

    it('takes the attempts of the text stage for the attempts of a case: a frame never lengthens the list', () => {
      const stats = summarizeGeneration([
        frame(1, 'rejected', ['schema']),
        frame(2, 'rejected', ['schema']),
        frame(3, 'framed'),
        rejected(1, ['real-name']),
        entry({ attempt: 2 }),
      ]);

      expect(stats.acceptedOnAttempt).toEqual([0, 1]);
    });

    it('counts a run left without a case once, at whichever stage it ran out', () => {
      const stats = summarizeGeneration([
        frame(1, 'framed'),
        rejected(1, ['real-name']),
        rejected(2, ['real-name']),
        rejected(3, ['real-name'], 'final'),
        frame(1, 'rejected', ['schema']),
        frame(2, 'rejected', ['schema']),
        frame(3, 'final', ['schema']),
      ]);

      expect(stats.failed).toBe(2);
      expect(stats.accepted).toBe(0);
    });
  });

  it('tells on which attempt the cases were accepted, and how many runs failed', () => {
    const stats = summarizeGeneration([
      entry({ seed: 'a' }),
      rejected(1, ['x']),
      entry({ attempt: 2 }),
      rejected(1, ['x']),
      rejected(2, ['x']),
      rejected(3, ['x'], 'final'),
      entry({ seed: 'c' }),
    ]);

    expect(stats).toMatchObject({ accepted: 3, failed: 1, acceptedOnAttempt: [2, 1, 0] });
    expect(GenerationStatsSchema.parse(stats)).toEqual(stats);
  });

  it('counts a run still being generated in neither number, but counts its rejections', () => {
    expect(summarizeGeneration([rejected(1, ['x']), rejected(2, ['x'])])).toMatchObject({
      accepted: 0,
      failed: 0,
      acceptedOnAttempt: [0, 0],
      codes: [{ code: 'x', count: 2 }],
    });
  });

  it('counts each code once for each submission it rejected, the most frequent first', () => {
    const { codes } = summarizeGeneration([
      rejected(1, ['unreachable-location', 'schema']),
      rejected(2, ['schema']),
      rejected(3, ['too-few-evidence-chains', 'schema'], 'final'),
      entry({ attempt: 1 }),
    ]);

    expect(codes).toEqual([
      { code: 'schema', count: 3 },
      { code: 'too-few-evidence-chains', count: 1 },
      { code: 'unreachable-location', count: 1 },
    ]);
  });
});
