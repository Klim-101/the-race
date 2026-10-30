// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { DETECTIVE_TRAITS, type DetectiveHero, type Trait } from '@the-race/engine';
import { loadRun, runFiles, type SaveFs } from '@the-race/saves';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerContext } from '../context.js';
import { PendingRunSchema, loadPending, pendingFile, savePending, type PendingRun } from '../pending-run.js';
import { serveStdio } from '../stdio.js';
import { TOOLS } from './index.js';
import { compactIssues } from './scenario-submit.js';

const SAVE_DIR = 'memory-save-dir';
const CASES = new URL('../../../../content/cases/', import.meta.url);
const readCase = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(name, CASES), 'utf8')) as Record<string, unknown>;

function memoryFs(files = new Map<string, string>()): SaveFs & { files: Map<string, string> } {
  return {
    files,
    mkdir: () => Promise.resolve(),
    readFile: (path) => Promise.resolve(files.get(path)),
    writeFileSynced: (path, data) => {
      files.set(path, data);
      return Promise.resolve();
    },
    rename: (from, to) => {
      files.set(to, files.get(from) ?? '');
      files.delete(from);
      return Promise.resolve();
    },
    remove: (path) => {
      files.delete(path);
      return Promise.resolve();
    },
  };
}

const HERO: DetectiveHero = {
  name: 'Mira Kos, former auditor',
  gender: 'female',
  archetype: 'detective',
  skills: { perception: 4, reasoning: 5, social: 1, pressure: 0, tech: 0, contacts: 0 },
  background: 'analyst',
};
const TRAITS: Trait[] = DETECTIVE_TRAITS.filter((trait) =>
  ['photographic-memory', 'debtor'].includes(trait.id),
);

function pendingRun(overrides: Partial<PendingRun> = {}): PendingRun {
  return PendingRunSchema.parse({
    schemaVersion: 1,
    seed: 'seed-1',
    locale: 'en',
    theme: 'curious-theft',
    rngState: 12345,
    hero: HERO,
    traits: TRAITS,
    ...overrides,
  });
}

class Peer {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  private buffer = '';
  private readonly waiting = new Map<number, (message: Record<string, unknown>) => void>();
  private nextId = 1;

  constructor() {
    this.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      let newline = this.buffer.indexOf('\n');
      while (newline >= 0) {
        const message = JSON.parse(this.buffer.slice(0, newline)) as Record<string, unknown>;
        this.buffer = this.buffer.slice(newline + 1);
        this.waiting.get(message.id as number)?.(message);
        newline = this.buffer.indexOf('\n');
      }
    });
  }

  request(method: string, params: unknown): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const reply = new Promise<Record<string, unknown>>((resolve) => this.waiting.set(id, resolve));
    this.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return reply;
  }
}

interface Called {
  readonly text: string;
  readonly isError: boolean;
  readonly body: Record<string, unknown>;
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function start(pending: PendingRun | null, fs = memoryFs()) {
  const context: ServerContext = { saveDir: SAVE_DIR, saveFs: fs, newSeed: () => 'unused' };
  if (pending) await savePending(SAVE_DIR, pending, fs);
  const peer = new Peer();
  const server = await serveStdio(peer, context, TOOLS);
  closers.push(() => server.close());
  await peer.request('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.0' },
  });
  peer.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const call = async (name: string, args: unknown): Promise<Called> => {
    const reply = await peer.request('tools/call', { name, arguments: args });
    const result = reply.result as { isError?: boolean; content: { text: string }[] };
    const text = result.content[0]?.text ?? '';
    return { text, isError: result.isError === true, body: parseBody(text) };
  };
  return { fs, call };
}

function parseBody(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { text };
  }
}

const errorCode = (called: Called): unknown => (called.body.error as { code: string }).code;
const submit = (call: (n: string, a: unknown) => Promise<Called>, value: unknown) =>
  call('scenario_submit', { case: value });

describe('generator_brief', () => {
  it('gives the public data of the hero and never a trait', async () => {
    const { call } = await start(pendingRun({ hero: { ...HERO, signalId: 'burnt-out' } }));
    const brief = await call('generator_brief', {});
    expect(brief.isError).toBe(false);
    expect(brief.body).toMatchObject({
      locale: 'en',
      theme: 'curious-theft',
      hero: { name: HERO.name, background: 'analyst', signal: { id: 'burnt-out', voice: 'flat-dry' } },
      attemptsLeft: 3,
      headlines: [],
    });
    expect(['serious', 'wry', 'absurd']).toContain(brief.body.tone);
    expect(brief.body.headlinesAreUntrusted).toMatch(/untrusted/);
    for (const trait of DETECTIVE_TRAITS) expect(brief.text).not.toContain(trait.id);
    expect(brief.text).not.toMatch(/trait/i);
  });

  it('has no signal for a hero without one, and the same tone for the same seed', async () => {
    const first = await (await start(pendingRun())).call('generator_brief', {});
    const second = await (await start(pendingRun())).call('generator_brief', {});
    expect(first.body.hero).toMatchObject({ signal: null });
    expect(second.body.tone).toBe(first.body.tone);
  });

  it('refuses without a pending run', async () => {
    const { call } = await start(null);
    expect(errorCode(await call('generator_brief', {}))).toBe('no-pending-run');
  });

  it('refuses a run without a hero', async () => {
    const { call } = await start(pendingRun({ hero: null }));
    expect(errorCode(await call('generator_brief', {}))).toBe('no-hero');
  });

  it('refuses when the attempts are used up', async () => {
    const { call } = await start(pendingRun({ attempts: 3, failed: true }));
    expect(errorCode(await call('generator_brief', {}))).toBe('case-failed');
  });
});

describe('scenario_submit', () => {
  it.each([
    ['en', 'goose-of-elmwick.en.json', 'object'],
    ['ru', 'goose-of-elmwick.ru.json', 'text'],
    ['en', 'leaked-memo-of-larkspur.en.json', 'text'],
    ['ru', 'leaked-memo-of-larkspur.ru.json', 'object'],
  ] as const)('accepts a %s case, %s, as %s', async (locale, file, form) => {
    const sample = readCase(file);
    const { fs, call } = await start(pendingRun({ locale }));
    const result = await submit(call, form === 'object' ? sample : JSON.stringify(sample));
    expect(result.isError).toBe(false);
    expect(result.body).toEqual({ accepted: true });
    // Nothing of the case, the truth or the traits comes back.
    expect(result.text).toBe('{"accepted":true}');

    const loaded = await loadRun(SAVE_DIR, fs);
    expect(loaded.ok && loaded.run.seed).toBe('seed-1');
    expect(loaded.ok && loaded.log).toEqual([]);
    expect(loaded.ok && loaded.run.traits).toEqual(TRAITS);
    expect(loaded.ok && loaded.run.case.title).toBe(sample.title);
    expect(fs.files.has(pendingFile(SAVE_DIR))).toBe(false);
  });

  it('refuses a second submission and a brief once a case is accepted, and keeps the first case', async () => {
    const { fs, call } = await start(pendingRun());
    await submit(call, readCase('goose-of-elmwick.en.json'));
    const before = fs.files.get(runFiles(SAVE_DIR).current);
    const again = await submit(call, readCase('goose-of-elmwick.en.json'));
    expect(errorCode(again)).toBe('case-already-accepted');
    expect(errorCode(await submit(call, readCase('leaked-memo-of-larkspur.en.json')))).toBe(
      'case-already-accepted',
    );
    expect(errorCode(await call('generator_brief', {}))).toBe('case-already-accepted');
    expect(fs.files.get(runFiles(SAVE_DIR).current)).toBe(before);
  });

  it('treats a pending record left behind by a crash after the save as accepted, and removes it', async () => {
    const { fs, call } = await start(pendingRun());
    const saved = new Map(fs.files);
    await submit(call, readCase('goose-of-elmwick.en.json'));
    // Put the pending record back, as a crash between the save and the removal would leave it.
    fs.files.set(pendingFile(SAVE_DIR), saved.get(pendingFile(SAVE_DIR)) ?? '');
    expect(errorCode(await submit(call, readCase('goose-of-elmwick.en.json')))).toBe('case-already-accepted');
    expect(fs.files.has(pendingFile(SAVE_DIR))).toBe(false);
  });

  it('lets a new pending run of another seed go on beside an old saved run', async () => {
    const { fs, call } = await start(pendingRun());
    await submit(call, readCase('goose-of-elmwick.en.json'));
    await savePending(SAVE_DIR, pendingRun({ seed: 'seed-2' }), fs);
    expect((await submit(call, readCase('leaked-memo-of-larkspur.en.json'))).body).toEqual({
      accepted: true,
    });
    const loaded = await loadRun(SAVE_DIR, fs);
    expect(loaded.ok && loaded.run.seed).toBe('seed-2');
  });

  it('refuses without a pending run, and without a hero', async () => {
    expect(errorCode(await submit((await start(null)).call, {}))).toBe('no-pending-run');
    expect(errorCode(await submit((await start(pendingRun({ hero: null }))).call, {}))).toBe('no-hero');
  });

  it('refuses an input that is neither text nor an object without using an attempt', async () => {
    const { fs, call } = await start(pendingRun());
    expect((await submit(call, 7)).isError).toBe(true);
    expect((await loadPending(SAVE_DIR, fs))?.attempts).toBe(0);
  });

  const mutations: [string, string, (value: Record<string, unknown>) => void, string][] = [
    ['a schema error', 'en', (value) => delete value.locations, 'schema'],
    ['text that is not JSON', 'en', () => undefined, 'schema'],
    [
      'an unreachable place',
      'en',
      (value) => {
        const locations = value.locations as { id: string; access: unknown }[];
        const archive = locations.find((location) => location.id === 'archive');
        if (archive) archive.access = { kind: 'clue', clueId: 'ink-smudge' };
        const clues = value.clues as { id: string; locationId: string }[];
        const key = clues.find((clue) => clue.id === 'archive-key');
        if (key) key.locationId = 'archive';
        const smudge = clues.find((clue) => clue.id === 'ink-smudge');
        if (smudge) smudge.locationId = 'archive';
      },
      'unreachable-location',
    ],
    ['the wrong language', 'ru', () => undefined, 'locale-mismatch'],
  ];

  it.each(mutations)(
    'returns the issues for %s and counts an attempt',
    async (label, locale, mutate, code) => {
      const { fs, call } = await start(pendingRun({ locale: locale as 'en' | 'ru' }));
      const sample = readCase('goose-of-elmwick.en.json');
      mutate(sample);
      const result = await submit(call, label === 'text that is not JSON' ? '{not json' : sample);
      expect(result.isError).toBe(false);
      expect(result.body).toMatchObject({ accepted: false, attemptsLeft: 2 });
      const issues = result.body.issues as { code: string; path: string; message: string }[];
      expect(issues.length).toBeLessThanOrEqual(8);
      expect(issues.map((issue) => issue.code)).toContain(code);
      expect((await loadPending(SAVE_DIR, fs))?.attempts).toBe(1);
      expect((await loadRun(SAVE_DIR, fs)).ok).toBe(false);
      // The messages name no hidden trait and carry no case text beyond what the generator wrote itself.
      for (const trait of DETECTIVE_TRAITS) expect(result.text).not.toContain(trait.id);
      expect(result.text).not.toContain(String(sample.title));
    },
  );

  it('puts the most important issues first and caps the list', async () => {
    const { call } = await start(pendingRun({ locale: 'ru' }));
    const sample = readCase('goose-of-elmwick.en.json');
    const result = await submit(call, sample);
    const issues = result.body.issues as { code: string }[];
    expect(issues).toHaveLength(8);
    expect(result.body.moreIssues).toBeGreaterThan(0);
    expect(issues[0]?.code).toBe('locale-mismatch');
  });

  it('shortens a long message and a long path', async () => {
    const { call } = await start(pendingRun());
    const sample = readCase('goose-of-elmwick.en.json');
    sample[`x${'y'.repeat(300)}`] = 1;
    sample.schemaVersion = 'v'.repeat(500);
    sample.crimeType = 'q'.repeat(400);
    const result = await submit(call, sample);
    const issues = result.body.issues as { path: string; message: string }[];
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.message.length).toBeLessThanOrEqual(240);
      expect(issue.path.length).toBeLessThanOrEqual(120);
    }
  });

  it('cuts a message and a path that run past their limits and leaves short ones alone', () => {
    const issue = {
      code: 'unreachable-location',
      path: `a${'b'.repeat(200)}`,
      message: `m${'n'.repeat(400)}`,
    } as const;
    const { issues } = compactIssues([
      issue,
      { code: 'unreachable-location', path: 'locations[0]', message: 'short' },
    ]);
    expect(issues[0]?.path).toHaveLength(120);
    expect(issues[0]?.path.endsWith('…')).toBe(true);
    expect(issues[0]?.message).toHaveLength(240);
    expect(issues[1]).toEqual({ code: 'unreachable-location', path: 'locations[0]', message: 'short' });
  });

  it('allows three attempts, then reports an honest failure and refuses a fourth', async () => {
    const { fs, call } = await start(pendingRun());
    const bad = { nothing: true };
    expect((await submit(call, bad)).body).toMatchObject({ attemptsLeft: 2 });
    expect((await submit(call, bad)).body).toMatchObject({ attemptsLeft: 1 });
    const third = await submit(call, bad);
    expect(third.body).toMatchObject({ accepted: false, attemptsLeft: 0, final: true });
    expect(third.body.reason).toMatch(/three attempts/);
    expect((await loadPending(SAVE_DIR, fs))?.failed).toBe(true);
    // Even a good case is too late now.
    const fourth = await submit(call, readCase('goose-of-elmwick.en.json'));
    expect(fourth.body).toMatchObject({ accepted: false, final: true });
    expect((await loadRun(SAVE_DIR, fs)).ok).toBe(false);
  });

  it('applies concurrent submissions one at a time', async () => {
    const { fs, call } = await start(pendingRun());
    const sample = readCase('goose-of-elmwick.en.json');
    const results = await Promise.all([submit(call, sample), submit(call, sample), submit(call, sample)]);
    expect(results.filter((result) => result.body.accepted === true)).toHaveLength(1);
    expect(results.filter((result) => result.isError)).toHaveLength(2);
    expect((await loadRun(SAVE_DIR, fs)).ok).toBe(true);
  });

  it('keeps serving after a storage failure', async () => {
    const base = memoryFs();
    let broken = false;
    const fs = {
      ...base,
      rename: (from: string, to: string) =>
        broken ? Promise.reject(new Error('disk full')) : base.rename(from, to),
    };
    const { call } = await start(pendingRun(), fs);
    broken = true;
    const failed = await submit(call, { nothing: true });
    expect(errorCode(failed)).toBe('internal-error');
    broken = false;
    expect((await submit(call, readCase('goose-of-elmwick.en.json'))).body).toEqual({ accepted: true });
  });
});

describe('pending run record', () => {
  it('loads nothing from a missing, unreadable, corrupt or foreign file', async () => {
    const fs = memoryFs();
    expect(await loadPending(SAVE_DIR, fs)).toBeUndefined();
    fs.files.set(pendingFile(SAVE_DIR), '{not json');
    expect(await loadPending(SAVE_DIR, fs)).toBeUndefined();
    fs.files.set(pendingFile(SAVE_DIR), '{"schemaVersion":2}');
    expect(await loadPending(SAVE_DIR, fs)).toBeUndefined();
    const broken = { ...fs, readFile: () => Promise.reject(new Error('denied')) };
    expect(await loadPending(SAVE_DIR, broken)).toBeUndefined();
  });

  it('reads a record written before attempts existed', async () => {
    const fs = memoryFs();
    const old: Record<string, unknown> = { ...pendingRun() };
    delete old.attempts;
    delete old.failed;
    fs.files.set(pendingFile(SAVE_DIR), JSON.stringify(old));
    expect(await loadPending(SAVE_DIR, fs)).toMatchObject({ attempts: 0, failed: false });
  });

  it('reports the failed save even when the temporary file cannot be removed either', async () => {
    const fs = memoryFs();
    const failing = {
      ...fs,
      rename: () => Promise.reject(new Error('no')),
      remove: () => Promise.reject(new Error('stuck')),
    };
    await expect(savePending(SAVE_DIR, pendingRun(), failing)).rejects.toThrow('no');
  });

  it('leaves no temporary file when a save fails', async () => {
    const fs = memoryFs();
    const failing = { ...fs, rename: () => Promise.reject(new Error('no')) };
    await expect(savePending(SAVE_DIR, pendingRun(), failing)).rejects.toThrow('no');
    expect(fs.files.size).toBe(0);
  });
});
