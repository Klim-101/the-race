// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { PassThrough } from 'node:stream';
import {
  DETECTIVE_TRAITS,
  DetectiveCaseSchema,
  SEED_CRIMES,
  applyPatch,
  collectNarrativeTexts,
  createRng,
  toJsonPointer,
  type DetectiveHero,
  type NewsSeed,
  type Trait,
} from '@the-race/engine';
import {
  GENERATION_LOG_FILE,
  loadGenerationLog,
  loadRunSeeds,
  runFiles,
  saveSeedsForDay,
  type GenerationStats,
  type SaveFs,
} from '@the-race/saves';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_PROFILE_DIR, offlineNews } from '../../test/fake-context.js';
import { loadTheRun, newestRunId } from '../../test/game.js';
import type { ServerContext } from '../context.js';
import { PendingRunSchema, loadPending, pendingFile, savePending, type PendingRun } from '../pending-run.js';
import { serveStdio } from '../stdio.js';
import { STATS_JSON } from '../stats.js';
import { TOOLS } from './index.js';
import { codesOf, compactIssues } from './scenario-submit.js';

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
    list: (directory) =>
      Promise.resolve([
        ...new Set(
          [...files.keys()]
            .filter((path) => path.startsWith(`${directory}${sep}`))
            .map((path) => path.slice(directory.length + 1).split(sep)[0] ?? ''),
        ),
      ]),
    remove: (path) => {
      files.delete(path);
      return Promise.resolve();
    },
  };
}

const SEED: NewsSeed = {
  id: 'grain-shortage',
  headlineIds: ['h0a1b2c3d'],
  kind: 'shortage',
  tone: 'wry',
  premise: 'A staple runs short and everyone suspects the middlemen.',
};

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

async function start(pending: PendingRun | null, fs = memoryFs(), overrides: Partial<ServerContext> = {}) {
  const context: ServerContext = {
    saveDir: SAVE_DIR,
    saveFs: fs,
    profileDir: TEST_PROFILE_DIR,
    notices: {},
    newSeed: () => 'unused',
    ...offlineNews(),
    ...overrides,
  };
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
      seed: null,
      mirrorWorld: { name: 'The Draft', entries: [] },
    });
    expect(['serious', 'wry', 'absurd']).toContain(brief.body.tone);
    expect(brief.body.seedIsUntrusted).toMatch(/untrusted/);
    for (const trait of DETECTIVE_TRAITS) expect(brief.text).not.toContain(trait.id);
    expect(brief.text).not.toMatch(/trait/i);
  });

  it('hands over the one seed the engine chose, with its crime and tone, and no headline', async () => {
    const fs = memoryFs();
    await saveSeedsForDay(
      SAVE_DIR,
      '2026-10-31',
      { seeds: [{ ...SEED, tone: 'absurd' }], realNames: [] },
      fs,
    );
    const { call } = await start(pendingRun(), fs);

    const brief = await call('generator_brief', {});

    expect(brief.body.seed).toEqual({ id: SEED.id, kind: SEED.kind, premise: SEED.premise });
    expect(brief.body.tone).toBe('absurd');
    expect(SEED_CRIMES.shortage).toContain(brief.body.theme);
    expect(brief.text).not.toContain(SEED.headlineIds[0]);
  });

  it('gives different heroes of the same news different crimes', async () => {
    const fs = memoryFs();
    const kinds = ['shortage', 'scandal', 'outage', 'market-shock'] as const;
    const seeds = kinds.map((kind) => ({ ...SEED, id: `${kind}-seed`, kind }));
    await saveSeedsForDay(SAVE_DIR, '2026-10-31', { seeds, realNames: [] }, fs);

    const themes = new Set<unknown>();
    for (const seed of ['run-a', 'run-b', 'run-c', 'run-d', 'run-e', 'run-f']) {
      const { call } = await start(pendingRun({ seed }), fs);
      themes.add((await call('generator_brief', {})).body.theme);
    }

    expect(themes.size).toBeGreaterThan(1);
  });

  it('follows the news lag: an older day, or no seed when nothing so old was extracted', async () => {
    const fs = memoryFs();
    await saveSeedsForDay(SAVE_DIR, '2026-10-29', { seeds: [SEED], realNames: [] }, fs);
    await saveSeedsForDay(
      SAVE_DIR,
      '2026-10-31',
      { seeds: [{ ...SEED, id: 'today-only' }], realNames: [] },
      fs,
    );

    const lagged = await (await start(pendingRun(), fs, { newsLagDays: 2 })).call('generator_brief', {});
    const tooOld = await (await start(pendingRun(), fs, { newsLagDays: 5 })).call('generator_brief', {});

    expect(lagged.body.seed).toMatchObject({ id: SEED.id });
    expect(tooOld.body.seed).toBeNull();
  });

  it('shows the mirror world as it stands, in the language of the run', async () => {
    const fs = memoryFs();
    const { call } = await start(pendingRun({ locale: 'ru' }), fs);
    await call('world_propose', {
      kind: 'country',
      real: ['Россия', 'Russia'],
      mirror: { ru: 'Вальдмарк', en: 'Valdmark' },
    });

    const brief = await call('generator_brief', {});

    expect(brief.body.mirrorWorld).toEqual({
      name: 'Черновик',
      entries: [{ id: 'valdmark', kind: 'country', name: 'Вальдмарк' }],
    });
    expect(brief.text).not.toContain('Россия');
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

describe('the brief kept with the pending run', () => {
  const OTHER: NewsSeed = {
    id: 'bridge-closed',
    headlineIds: ['h9f8e7d6c'],
    kind: 'outage',
    tone: 'serious',
    premise: 'A crossing everyone relies on is shut without notice, and nobody owns the fault.',
  };
  const NORWAY = { kind: 'country', real: ['Norway', 'Норвегия'], region: 'north' };
  const FREEDONIA = { kind: 'country', real: ['Freedonia'], region: 'island' };
  /** A run seed for which a world of two countries picks the second: so that a late choice is never the first. */
  const SECOND_OF_TWO = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].find(
    (seed) => createRng(`${seed}:setting`).roll(2) === 2,
  );
  const newsOf = (fs: SaveFs, seeds: NewsSeed[]) =>
    saveSeedsForDay(SAVE_DIR, '2026-10-31', { seeds, realNames: [] }, fs);

  it('keeps what the first call gave, as it gave it', async () => {
    const fs = memoryFs();
    await newsOf(fs, [SEED]);
    const { call } = await start(pendingRun(), fs);
    await call('world_propose', NORWAY);

    const brief = await call('generator_brief', {});

    const kept = (await loadPending(SAVE_DIR, fs))?.brief;
    expect(kept).toMatchObject({
      theme: brief.body.theme,
      tone: brief.body.tone,
      seed: brief.body.seed,
    });
    expect(kept?.setting).toMatchObject({ id: (brief.body.setting as { id: string }).id });
    expect(kept?.seed).toMatchObject({ id: SEED.id, kind: SEED.kind, premise: SEED.premise });
  });

  it('keeps no seed when there was none, and no country while the world has none', async () => {
    const { fs, call } = await start(pendingRun());

    await call('generator_brief', {});

    expect((await loadPending(SAVE_DIR, fs))?.brief).toMatchObject({ seed: null, setting: null });
  });

  it('gives the same seed, theme, tone and country again when the news and the world changed since', async () => {
    const fs = memoryFs();
    await newsOf(fs, [SEED]);
    const { call } = await start(pendingRun(), fs);
    await call('world_propose', NORWAY);
    const first = await call('generator_brief', {});

    await newsOf(fs, [OTHER]);
    await call('world_propose', FREEDONIA);
    const second = await call('generator_brief', {});

    expect(second.body.seed).toEqual(first.body.seed);
    expect(second.body).toMatchObject({
      theme: first.body.theme,
      tone: first.body.tone,
      setting: first.body.setting,
    });
    expect(second.body.seed).toMatchObject({ id: SEED.id });
    // What the world holds is told as it stands: the new country is in the dictionary, but not the setting.
    expect((second.body.mirrorWorld as { entries: unknown[] }).entries).toHaveLength(2);
  });

  it('counts the attempts left afresh, with the same brief', async () => {
    const { call } = await start(pendingRun());
    const first = await call('generator_brief', {});
    await submit(call, { nothing: true });

    const second = await call('generator_brief', {});

    expect(first.body.attemptsLeft).toBe(3);
    expect(second.body.attemptsLeft).toBe(2);
    expect({ ...second.body, attemptsLeft: 3 }).toEqual(first.body);
  });

  it('makes the run from the seed and the country the generator was given, not from a later choice', async () => {
    expect(SECOND_OF_TWO).toBeDefined();
    const fs = memoryFs();
    await newsOf(fs, [SEED]);
    const { call } = await start(pendingRun({ seed: SECOND_OF_TWO ?? 'a', locale: 'en' }), fs);
    await call('world_propose', NORWAY);
    const brief = await call('generator_brief', {});

    // While the generator writes, the news is refreshed and the world gains a country that would now be picked.
    await newsOf(fs, [OTHER]);
    await call('world_propose', FREEDONIA);
    const submitted = await submit(call, readCase('goose-of-elmwick.en.json'));

    expect(submitted.body).toEqual({ accepted: true });
    const loaded = await loadTheRun(SAVE_DIR, fs);
    expect(loaded.ok && loaded.run.inspiration).toEqual({ kind: SEED.kind, premise: SEED.premise });
    expect(loaded.ok && loaded.run.setting?.id).toBe((brief.body.setting as { id: string }).id);
    const view = await call('run_view', {});
    expect(view.body.inspiration).toEqual({ kind: SEED.kind, premise: SEED.premise });
  });

  it('would have picked another country by the late choice, which is what the kept brief prevents', async () => {
    // The same world and run seed, with no brief kept: the choice is made at the submission, as it was before.
    const fs = memoryFs();
    await newsOf(fs, [SEED]);
    const { call } = await start(pendingRun({ seed: SECOND_OF_TWO ?? 'a', locale: 'en' }), fs);
    await call('world_propose', NORWAY);
    await call('world_propose', FREEDONIA);
    await newsOf(fs, [OTHER]);
    const countries = ((await call('world_view', { locale: 'en' })).body.entries as { id: string }[]).map(
      ({ id }) => id,
    );

    await submit(call, readCase('goose-of-elmwick.en.json'));

    const loaded = await loadTheRun(SAVE_DIR, fs);
    expect(countries).toHaveLength(2);
    // The country of the second place: not the one the first of the two worlds would have given.
    expect(loaded.ok && loaded.run.setting?.id).toBe(countries[1]);
    expect(loaded.ok && loaded.run.inspiration).toEqual({ kind: OTHER.kind, premise: OTHER.premise });
  });

  it('is accepted when the record was written before the brief was kept: the choice is made at the submission', async () => {
    const fs = memoryFs();
    await newsOf(fs, [SEED]);
    const { call } = await start(pendingRun({ locale: 'en' }), fs);
    await call('world_propose', NORWAY);
    const record = JSON.parse(fs.files.get(pendingFile(SAVE_DIR)) ?? '{}') as Record<string, unknown>;
    expect(record).not.toHaveProperty('brief');

    const submitted = await submit(call, readCase('goose-of-elmwick.en.json'));

    expect(submitted.body).toEqual({ accepted: true });
    const loaded = await loadTheRun(SAVE_DIR, fs);
    expect(loaded.ok && loaded.run.inspiration).toEqual({ kind: SEED.kind, premise: SEED.premise });
    expect(loaded.ok && loaded.run.setting?.climate.zone).toBe('subarctic');
  });

  it('keeps the brief through the attempts, so that a patch is judged against the same run', async () => {
    const fs = memoryFs();
    await newsOf(fs, [SEED]);
    const { call } = await start(pendingRun(), fs);
    await call('generator_brief', {});
    await submit(call, { nothing: true });

    expect((await loadPending(SAVE_DIR, fs))?.brief?.seed).toMatchObject({ id: SEED.id });
  });

  it('never gives a headline or a hidden trait: the kept brief holds the seed of the news only as the brief shows it', async () => {
    const fs = memoryFs();
    await newsOf(fs, [SEED]);
    const { call } = await start(pendingRun(), fs);
    await call('generator_brief', {});

    const text = fs.files.get(pendingFile(SAVE_DIR)) ?? '';
    const brief = JSON.stringify((JSON.parse(text) as { brief: unknown }).brief);
    expect(brief).not.toContain(SEED.headlineIds[0]);
    for (const trait of DETECTIVE_TRAITS) expect(brief).not.toContain(trait.id);
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

    const loaded = await loadTheRun(SAVE_DIR, fs);
    expect(loaded.ok && loaded.run.seed).toBe('seed-1');
    // The run starts in a folder of its own, named for the moment it started and its seed.
    expect(loaded.ok && loaded.runId).toBe('20261031-120000-seed-1');
    expect(loaded.ok && loaded.run.runId).toBe('20261031-120000-seed-1');
    expect(
      [...fs.files.keys()].filter((path) => path.includes('state.json') && path.includes('runs')),
    ).toEqual([runFiles(SAVE_DIR, '20261031-120000-seed-1').current]);
    expect(loaded.ok && loaded.log).toEqual([]);
    expect(loaded.ok && loaded.run.traits).toEqual(TRAITS);
    expect(loaded.ok && loaded.run.case.title).toBe(sample.title);
    expect(fs.files.has(pendingFile(SAVE_DIR))).toBe(false);
  });

  describe('the clues in which witnesses tell what they saw', () => {
    /** A sample as a generator would write it: the sightings are named in a lie, and no clue of them is written. */
    const asWritten = (file: string): Record<string, unknown> => {
      const sample = readCase(file);
      return {
        ...sample,
        clues: (sample.clues as { sightingOf?: unknown }[]).filter((clue) => clue.sightingOf === undefined),
      };
    };

    it.each([
      ['en', 'goose-of-elmwick.en.json', 'Mabel Quince saw Wilhelmina Tuck at Elm Street around 02:30.'],
      [
        'ru',
        'goose-of-elmwick.ru.json',
        'Свидетель Мейбл Куинс: Вильгельмина Так — Вязовая улица, около 02:30.',
      ],
    ] as const)('are made on acceptance, in the words of a %s case (%s)', async (locale, file, words) => {
      const { fs, call } = await start(pendingRun({ locale }));
      const written = asWritten(file);
      expect((written.clues as { id: string }[]).some(({ id }) => id.startsWith('seen-'))).toBe(false);

      const result = await submit(call, written);

      expect(result.body).toEqual({ accepted: true });
      const loaded = await loadTheRun(SAVE_DIR, fs);
      const made = loaded.ok
        ? loaded.run.case.clues.find(({ id }) => id === 'seen-street-sweeper-postmaster')
        : undefined;
      expect(made).toMatchObject({
        description: words,
        about: ['postmaster'],
        sightingOf: { witnessId: 'street-sweeper', suspectId: 'postmaster' },
      });
    });

    it('are left as they are when the case already has them, so a case comes out the same', async () => {
      const { fs, call } = await start(pendingRun({ locale: 'en' }));
      const sample = readCase('goose-of-elmwick.en.json');

      await submit(call, sample);

      const loaded = await loadTheRun(SAVE_DIR, fs);
      const ids = loaded.ok ? loaded.run.case.clues.map(({ id }) => id) : [];
      expect(ids).toEqual((sample.clues as { id: string }[]).map(({ id }) => id));
    });

    it('are refused when a case names a sighting the timeline does not give, and the issue says why', async () => {
      const { call } = await start(pendingRun({ locale: 'en' }));
      const written = asWritten('goose-of-elmwick.en.json') as {
        suspects: { id: string; lies: { brokenBy: string[] }[] }[];
      };
      const curator = written.suspects.find(({ id }) => id === 'curator');
      if (curator?.lies[0] !== undefined) curator.lies[0].brokenBy = ['seen-clock-tender-curator'];

      const result = await submit(call, written);

      expect(result.body).toMatchObject({ accepted: false });
      expect(result.text).toContain('unknown-reference');
      expect(result.text).toContain('truth.timeline');
    });
  });

  it('keeps what the case grew from, as a kind and a sentence and no headline, in the run and its view', async () => {
    const fs = memoryFs();
    await saveSeedsForDay(SAVE_DIR, '2026-10-31', { seeds: [SEED], realNames: [] }, fs);
    const { call } = await start(pendingRun({ locale: 'en' }), fs);
    const brief = await call('generator_brief', {});

    await submit(call, readCase('goose-of-elmwick.en.json'));

    const loaded = await loadTheRun(SAVE_DIR, fs);
    const inspiration = { kind: SEED.kind, premise: SEED.premise };
    expect(brief.body.seed).toMatchObject(inspiration);
    expect(loaded.ok && loaded.run.inspiration).toEqual(inspiration);
    expect((await call('run_view', {})).body.inspiration).toEqual(inspiration);
    expect((await call('run_view', {})).text).not.toContain(SEED.headlineIds[0]);
  });

  it('copies the seeds the run was made from, with the day and the real names, into the folder of the run', async () => {
    const fs = memoryFs();
    await saveSeedsForDay(SAVE_DIR, '2026-10-31', { seeds: [SEED], realNames: ['norway'] }, fs);
    const { call } = await start(pendingRun({ locale: 'en' }), fs);
    await call('generator_brief', {});

    await submit(call, readCase('goose-of-elmwick.en.json'));

    const loaded = await loadTheRun(SAVE_DIR, fs);
    if (!loaded.ok || loaded.run.runId === undefined) throw new Error('The run did not load.');
    expect(await loadRunSeeds(SAVE_DIR, loaded.run.runId, fs)).toEqual({
      schemaVersion: 1,
      day: '2026-10-31',
      seeds: [SEED],
      realNames: ['norway'],
    });
  });

  it('keeps no seeds in the folder of a run made when no day had been extracted', async () => {
    const { fs, call } = await start(pendingRun({ locale: 'en' }));

    await submit(call, readCase('goose-of-elmwick.en.json'));

    const loaded = await loadTheRun(SAVE_DIR, fs);
    if (!loaded.ok || loaded.run.runId === undefined) throw new Error('The run did not load.');
    expect(await loadRunSeeds(SAVE_DIR, loaded.run.runId, fs)).toBeUndefined();
  });

  it('keeps nothing of the news when there was no seed', async () => {
    const { fs, call } = await start(pendingRun({ locale: 'en' }));

    await submit(call, readCase('goose-of-elmwick.en.json'));

    const loaded = await loadTheRun(SAVE_DIR, fs);
    expect(loaded.ok && loaded.run.inspiration).toBeNull();
    expect((await call('run_view', {})).body.inspiration).toBeNull();
  });

  it('keeps the country the case is set in, with its climate, in the run and its view', async () => {
    const { fs, call } = await start(pendingRun({ locale: 'ru' }));
    await call('world_propose', { kind: 'country', real: ['Norway', 'Норвегия'], region: 'north' });
    const brief = await call('generator_brief', {});

    const submitted = await submit(call, readCase('goose-of-elmwick.ru.json'));
    expect(submitted.text).toBe('{"accepted":true}');

    const loaded = await loadTheRun(SAVE_DIR, fs);
    const setting = loaded.ok ? loaded.run.setting : null;
    expect(setting?.climate.zone).toBe('subarctic');
    // The brief named the very country the run keeps.
    expect(brief.body.setting).toMatchObject({ id: setting?.id, name: setting?.name.ru });
    const view = await call('run_view', {});
    expect(view.body.setting).toMatchObject({ name: setting?.name.ru, climate: { zone: 'subarctic' } });
  });

  it('refuses a second submission and a brief once a case is accepted, and keeps the first case', async () => {
    const { fs, call } = await start(pendingRun());
    await submit(call, readCase('goose-of-elmwick.en.json'));
    const file = runFiles(SAVE_DIR, await newestRunId(SAVE_DIR, fs)).current;
    const before = fs.files.get(file);
    const again = await submit(call, readCase('goose-of-elmwick.en.json'));
    expect(errorCode(again)).toBe('case-already-accepted');
    expect(errorCode(await submit(call, readCase('leaked-memo-of-larkspur.en.json')))).toBe(
      'case-already-accepted',
    );
    expect(errorCode(await call('generator_brief', {}))).toBe('case-already-accepted');
    expect(fs.files.get(file)).toBe(before);
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
    const loaded = await loadTheRun(SAVE_DIR, fs);
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
      expect((await loadTheRun(SAVE_DIR, fs)).ok).toBe(false);
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
    expect(issues[1]).toEqual({ code: 'unreachable-location', path: '/locations/0', message: 'short' });
  });

  it('gives the path of an issue as a JSON Pointer, whichever way the engine wrote it', () => {
    const at = (path: string) => ({ code: 'unreachable-location', path, message: 'm' }) as const;

    expect(
      compactIssues([
        at('clues[3].description'),
        at('locations.2.id'),
        at('solution.evidenceChains'),
      ]).issues.map(({ path }) => path),
    ).toEqual(['/clues/3/description', '/locations/2/id', '/solution/evidenceChains']);
  });

  it('lists the distinct codes of all the issues, the most fundamental first', () => {
    const at = (code: string) => ({ code, path: 'p', message: 'm' });

    expect(
      codesOf([
        at('unreachable-location'),
        at('schema'),
        at('unreachable-location'),
        at('duplicate-id'),
      ] as never),
    ).toEqual(['schema', 'duplicate-id', 'unreachable-location']);
  });

  it('allows three attempts, then reports an honest failure and refuses a fourth', async () => {
    const { fs, call } = await start(pendingRun());
    const bad = { nothing: true };
    expect((await submit(call, bad)).body).toMatchObject({ attemptsLeft: 2 });
    expect((await submit(call, bad)).body).toMatchObject({ attemptsLeft: 1 });
    const third = await submit(call, bad);
    expect(third.body).toMatchObject({ accepted: false, attemptsLeft: 0, final: true });
    expect(third.body.reason).toMatch(/three attempts/);
    // The last rejection says why, like the ones before it: otherwise a failed run cannot be diagnosed.
    const lastIssues = third.body.issues as readonly { readonly code: string }[];
    expect(lastIssues.length).toBeGreaterThan(0);
    expect(typeof third.body.moreIssues).toBe('number');
    expect((await loadPending(SAVE_DIR, fs))?.failed).toBe(true);
    // Even a good case is too late now.
    const fourth = await submit(call, readCase('goose-of-elmwick.en.json'));
    expect(fourth.body).toMatchObject({ accepted: false, final: true });
    expect((await loadTheRun(SAVE_DIR, fs)).ok).toBe(false);
  });

  it('applies concurrent submissions one at a time', async () => {
    const { fs, call } = await start(pendingRun());
    const sample = readCase('goose-of-elmwick.en.json');
    const results = await Promise.all([submit(call, sample), submit(call, sample), submit(call, sample)]);
    expect(results.filter((result) => result.body.accepted === true)).toHaveLength(1);
    expect(results.filter((result) => result.isError)).toHaveLength(2);
    expect((await loadTheRun(SAVE_DIR, fs)).ok).toBe(true);
  });

  describe('a patch', () => {
    const sample = () => readCase('goose-of-elmwick.en.json');
    const broken = () => ({ ...sample(), crimeType: 'nope' });
    const fix = (value: unknown = sample().crimeType) => [{ op: 'replace', path: '/crimeType', value }];
    const patch = (call: (n: string, a: unknown) => Promise<Called>, operations: unknown) =>
      call('scenario_submit', { patch: operations });

    it('fixes the issue it is told about, at the path it is told, and the run starts from the patched case', async () => {
      const { fs, call } = await start(pendingRun());
      const first = await submit(call, broken());
      expect(first.body.issues).toEqual([expect.objectContaining({ code: 'schema', path: '/crimeType' })]);

      const second = await patch(call, fix());

      expect(second.body).toEqual({ accepted: true });
      const loaded = await loadTheRun(SAVE_DIR, fs);
      expect(loaded.ok && loaded.run.case.title).toBe(sample().title);
      expect(fs.files.has(pendingFile(SAVE_DIR))).toBe(false);
    });

    it('goes on from the case the last patch made, not from the first one sent', async () => {
      const { call } = await start(pendingRun());
      await submit(call, broken());

      const stillBad = await patch(call, [...fix(), { op: 'replace', path: '/title', value: 5 }]);
      expect(stillBad.body).toMatchObject({ accepted: false, attemptsLeft: 1 });
      expect(stillBad.body.issues).toEqual([expect.objectContaining({ path: '/title' })]);

      // The crime type was fixed by the patch before, so only the title is left to fix.
      expect((await patch(call, [{ op: 'replace', path: '/title', value: 'The Goose' }])).body).toEqual({
        accepted: true,
      });
    });

    it('costs an attempt, and is a final rejection when it was the last', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, broken());

      expect((await patch(call, fix('still-nope'))).body).toMatchObject({ attemptsLeft: 1 });
      const third = await patch(call, fix('nope-again'));

      expect(third.body).toMatchObject({ accepted: false, attemptsLeft: 0, final: true });
      expect((await loadPending(SAVE_DIR, fs))?.failed).toBe(true);
      expect(third.body.issues).toEqual([expect.objectContaining({ path: '/crimeType' })]);
    });

    it('is an issue of its own, and costs an attempt, when there is no earlier case to go on from', async () => {
      const { fs, call } = await start(pendingRun());

      const result = await patch(call, fix());

      expect(result.body).toMatchObject({
        accepted: false,
        attemptsLeft: 2,
        issues: [{ code: 'patch-failed', path: '/patch' }],
      });
      const [issue] = result.body.issues as { message: string }[];
      expect(issue?.message).toContain('no earlier case');
      // With no case yet, the first thing to send is a frame: it is a frame attempt that was lost.
      expect(result.body.stage).toBe('frame');
      expect(await loadPending(SAVE_DIR, fs)).toMatchObject({ frameAttempts: 1, attempts: 0 });
    });

    it('names the operation that does not apply, applies none of them and keeps the case it was to go on from', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, broken());

      const result = await patch(call, [...fix(), { op: 'remove', path: '/no/such/place' }]);

      expect(result.body).toMatchObject({
        accepted: false,
        attemptsLeft: 1,
        issues: [{ code: 'patch-failed', path: '/patch/1' }],
      });
      const [issue] = result.body.issues as { message: string }[];
      expect(issue?.message).toContain('"remove /no/such/place" does not apply');
      expect((await loadPending(SAVE_DIR, fs))?.lastCase).toEqual(broken());
      // Nothing was applied, so the first operation still has to be made: the same patch, mended, is accepted.
      expect((await patch(call, fix())).body).toEqual({ accepted: true });
    });

    it('is refused without costing an attempt when both a case and a patch are sent, or neither', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, broken());

      const both = await call('scenario_submit', { case: sample(), patch: fix() });
      const neither = await call('scenario_submit', {});

      expect(errorCode(both)).toBe('case-or-patch');
      expect(errorCode(neither)).toBe('case-or-patch');
      expect((await loadPending(SAVE_DIR, fs))?.attempts).toBe(1);
    });

    it('is refused as invalid input when it is empty, too long, or not made of the three operations', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, broken());
      const many = Array.from({ length: 201 }, () => fix()[0]);

      for (const bad of [
        [],
        many,
        [{ op: 'move', from: '/a', path: '/b' }],
        [{ op: 'add', path: '/a' }],
        'text',
      ])
        expect((await patch(call, bad)).isError).toBe(true);

      expect((await loadPending(SAVE_DIR, fs))?.attempts).toBe(1);
    });

    it('is refused once a case is accepted, like a case, and changes nothing', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, sample());
      const before = fs.files.get(runFiles(SAVE_DIR, '20261031-120000-seed-1').current);

      const result = await patch(call, fix());

      expect(errorCode(result)).toBe('case-already-accepted');
      expect(fs.files.get(runFiles(SAVE_DIR, '20261031-120000-seed-1').current)).toBe(before);
    });

    it('goes on from the last case that was a JSON object, not from a text that was not or a list', async () => {
      const { call } = await start(pendingRun());
      await submit(call, broken());

      expect((await submit(call, 'this is not JSON')).body).toMatchObject({ attemptsLeft: 1 });
      expect((await submit(call, '[1, 2]')).body).toMatchObject({ attemptsLeft: 0, final: true });
      // The attempts are used up: a patch is too late, as a case is.
      expect((await patch(call, fix())).body).toMatchObject({ accepted: false, final: true });
    });

    it('keeps the last case in the pending record, takes a text as an object, and never hands it back', async () => {
      const { fs, call } = await start(pendingRun());
      const result = await submit(call, JSON.stringify(broken()));

      expect((await loadPending(SAVE_DIR, fs))?.lastCase).toEqual(broken());
      expect(result.text).not.toContain(String(sample().title));
      expect(result.text).not.toContain('lastCase');
      for (const tool of ['run_view', 'generator_brief']) {
        const shown = await call(tool, {});
        expect(shown.text).not.toContain(String(sample().title));
        expect(shown.text).not.toContain('lastCase');
      }
    });

    it('keeps a text that was not a JSON object out of the record, and the last case through it', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, broken());

      await submit(call, '[1, 2]');

      expect((await loadPending(SAVE_DIR, fs))?.lastCase).toEqual(broken());
    });

    it('keeps no case in the record after the last attempt, so that the file stays small', async () => {
      const { fs, call } = await start(pendingRun());
      for (let attempt = 1; attempt <= 3; attempt += 1) await submit(call, broken());

      const pending = await loadPending(SAVE_DIR, fs);
      expect(pending?.failed).toBe(true);
      expect(pending?.lastCase).toBeUndefined();
    });

    it('has the code of a patch that did not apply in the log, and no text', async () => {
      const { fs, call } = await start(pendingRun());
      await patch(call, fix());

      const [entry] = await loadGenerationLog(SAVE_DIR, fs);
      expect(entry).toMatchObject({ outcome: 'rejected', codes: ['patch-failed'], issues: 1 });
      expect(fs.files.get(join(SAVE_DIR, GENERATION_LOG_FILE))).not.toContain('crimeType');
    });

    it('reads a record written before the last case was kept', async () => {
      const { fs, call } = await start(pendingRun());
      const record = JSON.parse(fs.files.get(pendingFile(SAVE_DIR)) ?? '{}') as Record<string, unknown>;
      expect(record).not.toHaveProperty('lastCase');

      expect((await patch(call, fix())).body).toMatchObject({ issues: [{ code: 'patch-failed' }] });
    });
  });

  describe('the stages of a case', () => {
    /** The sample as a generator writes it: the clues in which witnesses tell what they saw are the engine's to make. */
    const written = (): Record<string, unknown> => {
      const sample = readCase('goose-of-elmwick.en.json');
      return {
        ...sample,
        clues: (sample.clues as { sightingOf?: unknown }[]).filter((clue) => clue.sightingOf === undefined),
      };
    };
    const slots = () => collectNarrativeTexts(DetectiveCaseSchema.parse(written()));
    const replace = (path: string, value: string) => ({
      op: 'replace' as const,
      path: toJsonPointer(path),
      value,
    });
    /** The frame: the case with every narrative text left blank. */
    const frameOf = (): Record<string, unknown> => {
      const result = applyPatch(
        written(),
        slots().map(({ path }) => replace(path, '')),
      );
      if (!result.ok) throw new Error('The sample could not be blanked.');
      return result.document as Record<string, unknown>;
    };
    /** The texts, as the patch that follows an accepted frame. */
    const texts = () => slots().map(({ path, text }) => replace(path, text));
    /** A frame whose first clue that points at someone points at a suspect that does not exist. */
    const faulty = () => {
      const frame = frameOf();
      const clues = frame.clues as { pointsTo: string[] }[];
      const index = clues.findIndex(({ pointsTo }) => pointsTo.length > 0);
      const original = [...(clues[index]?.pointsTo ?? [])];
      const clue = clues[index];
      if (clue !== undefined) clue.pointsTo = ['ghost'];
      return { frame, index, original };
    };
    const send = (call: (n: string, a: unknown) => Promise<Called>, ops: unknown) =>
      call('scenario_submit', { patch: ops });
    const logged = async (fs: SaveFs) =>
      (await loadGenerationLog(SAVE_DIR, fs)).map(({ stage, attempt, outcome }) => [stage, attempt, outcome]);

    it('accepts a frame without starting a run, and lists the texts still to write', async () => {
      const { fs, call } = await start(pendingRun());

      const result = await submit(call, frameOf());

      expect(result.body).toMatchObject({
        accepted: false,
        stage: 'frame',
        frameAccepted: true,
        attemptsLeft: 3,
      });
      expect([...(result.body.toWrite as string[])].sort()).toEqual(
        slots()
          .map(({ path }) => toJsonPointer(path))
          .sort(),
      );
      expect((await loadTheRun(SAVE_DIR, fs)).ok).toBe(false);
      expect(await loadPending(SAVE_DIR, fs)).toMatchObject({
        stage: 'text',
        frameAttempts: 0,
        attempts: 0,
        lastCase: frameOf(),
      });
      expect(await logged(fs)).toEqual([['frame', 1, 'framed']]);
    });

    it('starts the run once the texts are patched into the frame, with the sightings made from the names written', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, frameOf());

      const result = await send(call, texts());

      expect(result.body).toEqual({ accepted: true });
      const loaded = await loadTheRun(SAVE_DIR, fs);
      const sighting = loaded.ok
        ? loaded.run.case.clues.find(({ id }) => id === 'seen-street-sweeper-postmaster')
        : undefined;
      expect(loaded.ok && loaded.run.case.title).toBe(readCase('goose-of-elmwick.en.json').title);
      expect(sighting?.description).toBe('Mabel Quince saw Wilhelmina Tuck at Elm Street around 02:30.');
      expect(fs.files.has(pendingFile(SAVE_DIR))).toBe(false);
      expect(await logged(fs)).toEqual([
        ['frame', 1, 'framed'],
        ['text', 1, 'accepted'],
      ]);
    });

    it('lists the texts still blank when a patch leaves some, and goes on from the case so far', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, frameOf());

      const result = await send(call, texts().slice(0, 5));

      expect(result.body).toMatchObject({ accepted: false, stage: 'text', attemptsLeft: 2 });
      const issues = result.body.issues as { code: string; path: string }[];
      expect(issues.map(({ code }) => code)).toEqual(Array(8).fill('text-missing'));
      expect(result.body.moreIssues).toBeGreaterThan(0);
      expect(result.body.toWrite).toHaveLength(slots().length - 5);
      const first = texts()[0];
      expect((await loadPending(SAVE_DIR, fs))?.lastCase).toMatchObject({ title: first?.value });

      expect((await send(call, texts())).body).toEqual({ accepted: true });
    });

    it('judges a frame on its structure: a fault is a frame attempt, no text is listed, and a patch fixes it', async () => {
      const { fs, call } = await start(pendingRun());
      const { frame, index, original } = faulty();

      const first = await submit(call, frame);

      expect(first.body).toMatchObject({ accepted: false, stage: 'frame', attemptsLeft: 2 });
      expect(first.body).not.toHaveProperty('toWrite');
      const codes = (first.body.issues as { code: string }[]).map(({ code }) => code);
      expect(codes.length).toBeGreaterThan(0);
      expect(new Set(codes)).toEqual(new Set(['unknown-reference']));
      expect(await loadPending(SAVE_DIR, fs)).toMatchObject({
        stage: 'frame',
        frameAttempts: 1,
        attempts: 0,
      });

      const second = await send(call, [
        { op: 'replace', path: `/clues/${String(index)}/pointsTo`, value: original },
      ]);

      expect(second.body).toMatchObject({ frameAccepted: true, stage: 'frame' });
      expect(await logged(fs)).toEqual([
        ['frame', 1, 'rejected'],
        ['frame', 2, 'framed'],
      ]);
    });

    it('reports a fault of the schema in a frame alone, and none of its blank texts', async () => {
      const { call } = await start(pendingRun());
      const frame = frameOf();
      (frame.locations as { id: string }[])[0]!.id = 'Not An Id';

      const result = await submit(call, frame);

      expect(result.body).toMatchObject({ accepted: false, stage: 'frame', attemptsLeft: 2 });
      expect(result.body.issues).toMatchObject([{ code: 'schema', path: '/locations/0/id' }]);
      expect(result.body).not.toHaveProperty('toWrite');
    });

    it('runs out of attempts for frames after three rejected, and the run reports it', async () => {
      const { fs, call } = await start(pendingRun());
      const { frame } = faulty();

      expect((await submit(call, frame)).body).toMatchObject({ stage: 'frame', attemptsLeft: 2 });
      expect((await submit(call, frame)).body).toMatchObject({ stage: 'frame', attemptsLeft: 1 });
      const third = await submit(call, frame);

      expect(third.body).toMatchObject({ accepted: false, stage: 'frame', attemptsLeft: 0, final: true });
      expect(third.body.reason).toMatch(/three attempts/);
      expect(third.body.issues).toBeDefined();
      expect(await loadPending(SAVE_DIR, fs)).toMatchObject({ failed: true, frameAttempts: 3, attempts: 0 });
      expect((await loadPending(SAVE_DIR, fs))?.lastCase).toBeUndefined();
      expect(await logged(fs)).toEqual([
        ['frame', 1, 'rejected'],
        ['frame', 2, 'rejected'],
        ['frame', 3, 'final'],
      ]);
      const statistics = JSON.parse(fs.files.get(join(SAVE_DIR, STATS_JSON)) ?? '{}') as {
        generation: GenerationStats;
      };
      expect(statistics.generation).toMatchObject({ failed: 1, frames: { accepted: 0, rejected: 3 } });
      // Even a good case is too late now.
      expect((await submit(call, readCase('goose-of-elmwick.en.json'))).body).toMatchObject({ final: true });
    });

    it('runs out of attempts for texts after three rejected, apart from the frame that cost none', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, frameOf());
      const wrongScript = texts().map((op) =>
        op.path === '/title' ? { ...op, value: 'Все должны всем.' } : op,
      );

      expect((await send(call, wrongScript)).body).toMatchObject({ stage: 'text', attemptsLeft: 2 });
      expect((await send(call, wrongScript)).body).toMatchObject({ stage: 'text', attemptsLeft: 1 });
      const third = await send(call, wrongScript);

      expect(third.body).toMatchObject({ accepted: false, stage: 'text', attemptsLeft: 0, final: true });
      expect((third.body.issues as { code: string }[]).map(({ code }) => code)).toContain('wrong-script');
      expect(await loadPending(SAVE_DIR, fs)).toMatchObject({ failed: true, frameAttempts: 0, attempts: 3 });
      expect(await logged(fs)).toEqual([
        ['frame', 1, 'framed'],
        ['text', 1, 'rejected'],
        ['text', 2, 'rejected'],
        ['text', 3, 'final'],
      ]);
    });

    it('lets a fix of the texts change the frame, for the whole case is judged again by every check', async () => {
      const { call } = await start(pendingRun());
      await submit(call, frameOf());
      const { index } = faulty();

      const result = await send(call, [
        ...texts(),
        { op: 'replace', path: `/clues/${String(index)}/pointsTo`, value: ['ghost'] },
      ]);

      expect(result.body).toMatchObject({ accepted: false, stage: 'text' });
      expect((result.body.issues as { code: string }[]).map(({ code }) => code)).toContain(
        'unknown-reference',
      );
    });

    it('judges a whole case sent at once as the text stage, and costs no frame attempt', async () => {
      const { fs, call } = await start(pendingRun());

      const result = await submit(call, { ...written(), crimeType: 'nope' });

      expect(result.body).toMatchObject({ accepted: false, stage: 'text', attemptsLeft: 2 });
      expect(await loadPending(SAVE_DIR, fs)).toMatchObject({
        stage: 'frame',
        frameAttempts: 0,
        attempts: 1,
      });
      expect(await logged(fs)).toEqual([['text', 1, 'rejected']]);
      expect((await send(call, [replace('crimeType', 'forgery')])).body).toEqual({ accepted: true });
    });

    it('takes a frame sent again after one was accepted for texts that are missing, not for a new frame', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, frameOf());

      const result = await submit(call, frameOf());

      expect(result.body).toMatchObject({ accepted: false, stage: 'text', attemptsLeft: 2 });
      expect((result.body.issues as { code: string }[])[0]?.code).toBe('text-missing');
      expect(await loadPending(SAVE_DIR, fs)).toMatchObject({ frameAttempts: 0, attempts: 1 });
    });

    it('counts a patch that does not apply to a frame still being fixed as a frame attempt', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, faulty().frame);

      const result = await send(call, [{ op: 'remove', path: '/no/such/place' }]);

      expect(result.body).toMatchObject({ accepted: false, stage: 'frame', attemptsLeft: 1 });
      expect(await loadPending(SAVE_DIR, fs)).toMatchObject({ frameAttempts: 2, attempts: 0 });
    });

    it('counts a patch that does not apply after the frame was accepted as a text attempt', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, frameOf());

      const result = await send(call, [{ op: 'remove', path: '/no/such/place' }]);

      expect(result.body).toMatchObject({ accepted: false, stage: 'text', attemptsLeft: 2 });
      expect(await loadPending(SAVE_DIR, fs)).toMatchObject({ frameAttempts: 0, attempts: 1 });
    });

    it('reads a record written before the stages as one at the frame stage with no attempt used', async () => {
      const { fs, call } = await start(pendingRun());
      const record = JSON.parse(fs.files.get(pendingFile(SAVE_DIR)) ?? '{}') as Record<string, unknown>;
      delete record.stage;
      delete record.frameAttempts;
      fs.files.set(pendingFile(SAVE_DIR), JSON.stringify(record));

      expect((await submit(call, frameOf())).body).toMatchObject({ frameAccepted: true });
    });

    it('tells the brief how many attempts are left for the frame and for the texts', async () => {
      const { call } = await start(pendingRun());
      expect((await call('generator_brief', {})).body).toMatchObject({
        attemptsLeft: 3,
        frameAttemptsLeft: 3,
      });
      await submit(call, faulty().frame);

      expect((await call('generator_brief', {})).body).toMatchObject({
        attemptsLeft: 3,
        frameAttemptsLeft: 2,
      });
    });

    it('refuses the brief once the frames are used up', async () => {
      const { call } = await start(pendingRun({ frameAttempts: 3 }));

      expect(errorCode(await call('generator_brief', {}))).toBe('case-failed');
    });

    it('is told in the schema rules that a case is written in two stages', async () => {
      const { call } = await start(pendingRun());

      expect(String((await call('generator_brief', {})).body.schemaRules)).toMatch(
        /in two stages: first a frame/,
      );
    });
  });

  describe('the log of the submissions', () => {
    const LOG = join(SAVE_DIR, GENERATION_LOG_FILE);
    const logOf = (fs: SaveFs) => loadGenerationLog(SAVE_DIR, fs);

    it('has an entry for each submission: the attempt, the outcome and the codes of the issues, the last as final', async () => {
      const { fs, call } = await start(pendingRun());

      for (let attempt = 1; attempt <= 3; attempt += 1) await submit(call, { nothing: true });

      const log = await logOf(fs);
      expect(log.map(({ attempt, outcome }) => [attempt, outcome])).toEqual([
        [1, 'rejected'],
        [2, 'rejected'],
        [3, 'final'],
      ]);
      expect(log[0]).toMatchObject({
        date: '2026-10-31',
        seed: 'seed-1',
        locale: 'en',
        theme: 'curious-theft',
        archetype: 'detective',
      });
      expect(log[0]?.codes).toContain('schema');
      expect(log[0]?.issues).toBeGreaterThanOrEqual(log[0]?.codes.length ?? 0);
    });

    it('has the accepted case on the attempt it was accepted on, with no code', async () => {
      const { fs, call } = await start(pendingRun());
      await submit(call, { nothing: true });

      await submit(call, readCase('goose-of-elmwick.en.json'));

      const log = await logOf(fs);
      expect(log.map(({ attempt, outcome }) => [attempt, outcome])).toEqual([
        [1, 'rejected'],
        [2, 'accepted'],
      ]);
      expect(log[1]).toMatchObject({ codes: [], issues: 0 });
    });

    it('has the theme the engine chose from the seed of the news, the one the brief gave', async () => {
      const fs = memoryFs();
      await saveSeedsForDay(SAVE_DIR, '2026-10-31', { seeds: [SEED], realNames: [] }, fs);
      const { call } = await start(pendingRun({ locale: 'en' }), fs);
      const brief = await call('generator_brief', {});

      await submit(call, { nothing: true });

      expect((await logOf(fs))[0]?.theme).toBe(brief.body.theme);
    });

    it('lists each code once, the most fundamental first, and holds no text of the engine or of the case', async () => {
      const { fs, call } = await start(pendingRun({ locale: 'ru' }));

      await submit(call, readCase('goose-of-elmwick.en.json'));

      const [entry] = await logOf(fs);
      expect(entry?.codes[0]).toBe('locale-mismatch');
      expect(new Set(entry?.codes).size).toBe(entry?.codes.length);
      expect(fs.files.get(LOG)).not.toContain('path');
      expect(fs.files.get(LOG)).not.toContain('message');
      expect(fs.files.get(LOG)).not.toContain(String(readCase('goose-of-elmwick.en.json').title));
      for (const trait of DETECTIVE_TRAITS) expect(fs.files.get(LOG)).not.toContain(trait.id);
    });

    it('has nothing for a submission refused before it was judged', async () => {
      const { fs, call } = await start(pendingRun({ failed: true, attempts: 3 }));

      await submit(call, readCase('goose-of-elmwick.en.json'));
      await submit(call, 42);

      expect(await logOf(fs)).toEqual([]);
    });

    it('never costs the submission: a log that cannot be written is dropped', async () => {
      const base = memoryFs();
      const fs = {
        ...base,
        rename: (from: string, to: string) =>
          to === LOG ? Promise.reject(new Error('disk full')) : base.rename(from, to),
      };
      const { call } = await start(pendingRun(), fs);

      expect((await submit(call, { nothing: true })).body).toMatchObject({
        accepted: false,
        attemptsLeft: 2,
      });
      expect((await submit(call, readCase('goose-of-elmwick.en.json'))).body).toEqual({ accepted: true });
      expect(base.files.has(LOG)).toBe(false);
    });

    it('is on the page of statistics once a run is left without a case, and once one is accepted', async () => {
      const { fs, call } = await start(pendingRun());
      const page = join(SAVE_DIR, STATS_JSON);
      await submit(call, { nothing: true });
      await submit(call, { nothing: true });
      expect(fs.files.has(page)).toBe(false);

      await submit(call, { nothing: true });

      const failed = JSON.parse(fs.files.get(page) ?? '{}') as { generation: GenerationStats };
      expect(failed.generation).toMatchObject({ accepted: 0, failed: 1, acceptedOnAttempt: [0, 0, 0] });
      expect(failed.generation.codes[0]).toMatchObject({ code: 'schema', count: 3 });

      const other = await start(pendingRun({ seed: 'seed-2' }));
      await submit(other.call, readCase('goose-of-elmwick.en.json'));
      const accepted = JSON.parse(other.fs.files.get(page) ?? '{}') as { generation: GenerationStats };
      expect(accepted.generation).toMatchObject({ accepted: 1, failed: 0, acceptedOnAttempt: [1] });
    });
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

describe('the mirror world dictionary', () => {
  const RUSSIA = {
    kind: 'country',
    real: ['Россия', 'Russia'],
    mirror: { ru: 'Вальдмарк', en: 'Valdmark' },
  };
  const WORLD_FILE = join(SAVE_DIR, 'world.json');
  const NORWAY = { kind: 'country', real: ['Norway', 'Норвегия'], region: 'north' };

  it('gives a country the climate of the real one, by the table and by the region when it has no entry', async () => {
    const { fs, call } = await start(null);
    await call('world_propose', NORWAY);
    await call('world_propose', { kind: 'country', real: ['Freedonia'], region: 'island' });
    await call('world_propose', { kind: 'organisation', real: ['Gazprom'] });

    const entries = (
      JSON.parse(fs.files.get(join(SAVE_DIR, 'world.json')) ?? '{}') as {
        entries: { real: string[]; climate?: { zone: string } }[];
      }
    ).entries;

    expect(entries.map(({ climate }) => climate?.zone)).toEqual(['subarctic', 'tropical-wet', undefined]);
    // The public view of the world holds no climate and no real name.
    const view = await call('world_view', { locale: 'en' });
    expect(JSON.stringify(view.body)).not.toMatch(/climate|Norway|Freedonia/);
  });

  it('has no country to set the case in while the world has none, and says so in the brief', async () => {
    const { call } = await start(pendingRun());

    expect((await call('generator_brief', {})).body.setting).toBeNull();
  });

  it('names an entity itself when no mirror is given, the same way for every player', async () => {
    const first = await (await start(null)).call('world_propose', NORWAY);
    const second = await (await start(null)).call('world_propose', NORWAY);

    expect(first.body).toMatchObject({ accepted: true });
    expect(first.body.mirror).toEqual(second.body.mirror);
    const { en, ru } = first.body.mirror as { en: string; ru: string };
    expect(en).toMatch(/(mark|heim|gard|vik)$/);
    expect(ru).toMatch(/^[А-ЯЁ][а-яё]+$/);
    expect(first.body.id).toBe(en.toLowerCase());
  });

  it("never gives two entities one name, and shows the engine's names with the others", async () => {
    const { call } = await start(null);
    await call('world_propose', RUSSIA);
    const second = await call('world_propose', NORWAY);

    const view = await call('world_view', { locale: 'en' });

    expect(second.body).toMatchObject({ accepted: true });
    const names = (view.body.entries as { name: string }[]).map(({ name }) => name);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });

  it('names an organisation as a brand by default and a union when asked', async () => {
    const { call } = await start(null);
    const brand = await call('world_propose', { kind: 'organisation', real: ['Gazprom'] });
    const union = await call('world_propose', {
      kind: 'organisation',
      real: ['Eurasian Union'],
      style: 'union',
    });

    expect((brand.body.mirror as { en: string }).en).toMatch(/(tek|ron|ix|ora|ent|ium)$/);
    expect((union.body.mirror as { en: string }).en).toMatch(/^\w+ \w+$/);
  });

  it('does not name a role, but takes one that is named by hand', async () => {
    const { call } = await start(null);
    const role = { kind: 'role', real: ['central bank governor'] };

    const refused = await call('world_propose', role);
    const accepted = await call('world_propose', { ...role, mirror: { ru: 'Хранитель', en: 'Warden' } });

    expect(refused.body).toMatchObject({ accepted: false, issues: [{ code: 'mirror-required' }] });
    expect(accepted.body).toMatchObject({ accepted: true, id: 'warden' });
  });

  it('says so when every name that could be made is a real one', async () => {
    const { call } = await start(null);
    const adjectives = [
      'Northern',
      'Eastern',
      'Southern',
      'Western',
      'Amber',
      'Silver',
      'Iron',
      'Coastal',
      'Free',
    ];
    const nouns = ['Union', 'League', 'Accord', 'Alliance', 'Compact', 'Commonwealth'];

    const refused = await call('world_propose', {
      kind: 'organisation',
      real: ['Some Pact'],
      style: 'union',
      knownRealNames: adjectives.flatMap((adjective) => nouns.map((noun) => `${adjective} ${noun}`)),
    });

    expect(refused.body).toMatchObject({ accepted: false, issues: [{ code: 'no-name' }] });
  });

  it('takes a proposal once, keeps it and shows only the mirror side', async () => {
    const { fs, call } = await start(null);

    const accepted = await call('world_propose', RUSSIA);
    expect(accepted.body).toEqual({
      accepted: true,
      id: 'valdmark',
      mirror: { ru: 'Вальдмарк', en: 'Valdmark' },
    });
    expect(JSON.parse(fs.files.get(WORLD_FILE) ?? '{}')).toMatchObject({ entries: [{ id: 'valdmark' }] });

    const again = await call('world_propose', { ...RUSSIA, mirror: { ru: 'Другой', en: 'Other' } });
    expect(again.body).toMatchObject({
      accepted: false,
      issues: [{ code: 'alias-taken' }, { code: 'alias-taken' }],
    });

    const view = await call('world_view', { locale: 'ru' });
    expect(view.body).toEqual({
      name: 'Черновик',
      entries: [{ id: 'valdmark', kind: 'country', name: 'Вальдмарк' }],
    });
    expect(view.text).not.toMatch(/Россия|Russia/);
  });

  it('takes proposals made at the same time, one after the other', async () => {
    const { call } = await start(null);
    const other = { kind: 'organisation', real: ['Банк'], mirror: { ru: 'Норделл', en: 'Nordell' } };

    const both = await Promise.all([call('world_propose', RUSSIA), call('world_propose', other)]);

    expect(both.map(({ body }) => body.accepted)).toEqual([true, true]);
    expect(((await call('world_view', { locale: 'en' })).body.entries as unknown[]).length).toBe(2);
  });

  it('checks a proposal against the real names the generator saw', async () => {
    const { call } = await start(null);

    const refused = await call('world_propose', { ...RUSSIA, knownRealNames: ['Valdmark'] });

    expect(refused.body).toMatchObject({ accepted: false, issues: [{ code: 'mirror-is-real' }] });
  });

  it('stops at a dictionary it cannot use, and never replaces it', async () => {
    const fs = memoryFs();
    fs.files.set(WORLD_FILE, '{broken');
    const { call } = await start(null, fs);

    expect(errorCode(await call('world_propose', RUSSIA))).toBe('world-unusable');
    expect(errorCode(await call('world_view', { locale: 'en' }))).toBe('world-unusable');
    expect(fs.files.get(WORLD_FILE)).toBe('{broken');
  });

  it('keeps a real name of the dictionary out of a case, and a damaged dictionary from starting one', async () => {
    const fs = memoryFs();
    const { call } = await start(pendingRun(), fs);
    await call('world_propose', {
      kind: 'country',
      real: ['Elmwick'],
      mirror: { ru: 'Квилльхейвен', en: 'Quillhaven' },
    });

    const refused = await submit(call, readCase('goose-of-elmwick.en.json'));
    expect(refused.body).toMatchObject({ accepted: false });
    expect(JSON.stringify(refused.body)).toContain('real-name');

    fs.files.set(WORLD_FILE, '{broken');
    expect(errorCode(await submit(call, readCase('goose-of-elmwick.en.json')))).toBe('world-unusable');
  });

  it("keeps a real name of the day's headlines out of a case, whatever the dictionary holds", async () => {
    const fs = memoryFs();
    await saveSeedsForDay(SAVE_DIR, '2026-10-31', { seeds: [SEED], realNames: ['elmwick'] }, fs);
    const { call } = await start(pendingRun(), fs);

    const refused = await submit(call, readCase('goose-of-elmwick.en.json'));

    expect(refused.body).toMatchObject({ accepted: false });
    expect(JSON.stringify(refused.body)).toContain('real-name');
  });
});
