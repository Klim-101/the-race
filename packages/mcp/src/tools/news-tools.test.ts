// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { EMPTY_WORLD, proposeEntry, type NewsSeed } from '@the-race/engine';
import { headlineId, type Feed } from '@the-race/news';
import { loadSeeds, saveWorld } from '@the-race/saves';
import { describe, expect, it } from 'vitest';
import { call, gameContext, type GameContext } from '../../test/game.js';
import { newsBrief } from './news-brief.js';
import { seedsSubmit } from './seeds-submit.js';

const rss = (titles: readonly string[]): string =>
  `<rss version="2.0"><channel>${titles
    .map((title) => `<item><title>${title}</title><description>Short summary.</description></item>`)
    .join('')}</channel></rss>`;

const FEEDS: Feed[] = [
  { id: 'wire-world', language: 'en', topic: 'world', url: 'https://wire.test/world', enabled: true },
  { id: 'wire-off', language: 'en', topic: 'world', url: 'https://wire.test/off', enabled: false },
  { id: 'wire-de', language: 'de', topic: 'humor', url: 'https://wire.test/de', enabled: true },
];
const TITLES = [
  'Grain prices dip as harvests recover',
  'Talks with Norway over steel tariffs stall',
  'Dozens killed as a bus overturns',
  'Cloud provider outage disrupts payments',
];
const GRAIN = headlineId(TITLES[0] ?? '');
const OUTAGE = headlineId(TITLES[3] ?? '');

const SEED: NewsSeed = {
  id: 'grain-shortage',
  headlineIds: [GRAIN],
  kind: 'shortage',
  tone: 'wry',
  premise: 'A staple runs short and everyone suspects the middlemen.',
};

function newsContext(titles: readonly string[] = TITLES): GameContext & { fetched: string[] } {
  const fetched: string[] = [];
  return {
    ...gameContext(),
    fetched,
    feeds: () => Promise.resolve(FEEDS),
    httpGet: (url) => {
      fetched.push(url);
      return titles.length === 0 ? Promise.reject(new Error('offline')) : Promise.resolve(rss(titles));
    },
  };
}

const errorCode = (called: { body: Record<string, unknown> }): unknown =>
  (called.body.error as { code: string }).code;

describe('news_brief', () => {
  it('gives the cleaned headlines with their ids and reads only the enabled feeds in the game languages', async () => {
    const context = newsContext();

    const brief = await call(newsBrief, {}, context);

    expect(brief.body).toMatchObject({ day: '2026-10-31', status: 'ready', maxSeeds: 12 });
    expect(brief.body.headlineIds).toEqual([GRAIN, headlineId(TITLES[1] ?? ''), OUTAGE]);
    expect(brief.body.headlines).toContain(`${GRAIN} [world] Grain prices dip as harvests recover`);
    expect(brief.body.seedKinds).toContain('shortage');
    expect(context.fetched).toEqual(['https://wire.test/world']);
  });

  it('lists the proper names of the headlines, for the extractor to pass to world_propose', async () => {
    const brief = await call(newsBrief, {}, newsContext());

    expect(brief.body.knownRealNames).toEqual(expect.arrayContaining(['norway']));
  });

  it('never carries a tragedy', async () => {
    const brief = await call(newsBrief, {}, newsContext());

    expect(JSON.stringify(brief.body)).not.toMatch(/killed|bus/);
  });

  it('fails plainly when no headline is left', async () => {
    const offline = await call(newsBrief, {}, newsContext([]));
    const onlyTragedy = await call(newsBrief, {}, newsContext(['Dozens killed as a bus overturns']));

    expect(errorCode(offline)).toBe('no-headlines');
    expect(errorCode(onlyTragedy)).toBe('no-headlines');
  });

  it('says so, with no headlines, once the seeds of the day are kept', async () => {
    const context = newsContext();
    await call(seedsSubmit, { seeds: [SEED] }, context);

    const brief = await call(newsBrief, {}, context);

    expect(brief.body).toMatchObject({ status: 'already-extracted', headlines: '', headlineIds: [] });
  });
});

describe('seeds_submit', () => {
  it('keeps the seeds of the day, and only once', async () => {
    const context = newsContext();

    const first = await call(seedsSubmit, { seeds: [SEED] }, context);
    const second = await call(seedsSubmit, { seeds: [{ ...SEED, id: 'other-seed' }] }, context);

    expect(first.body).toEqual({ accepted: true, count: 1 });
    const kept = (await loadSeeds(context.saveDir, context.saveFs))['2026-10-31'];
    expect(kept?.seeds).toEqual([SEED]);
    // The names of the day stay with the seeds, for the check of the case that grows from them.
    expect(kept?.realNames).toEqual(expect.arrayContaining(['norway']));
    expect(errorCode(second)).toBe('already-extracted');
  });

  it('lets exactly one of two submissions at once through', async () => {
    const context = newsContext();

    const both = await Promise.all([
      call(seedsSubmit, { seeds: [SEED] }, context),
      call(seedsSubmit, { seeds: [{ ...SEED, id: 'other-seed' }] }, context),
    ]);

    expect(both.filter(({ isError }) => !isError)).toHaveLength(1);
    expect(Object.values(await loadSeeds(context.saveDir, context.saveFs))).toHaveLength(1);
  });

  it('refuses a headline the extractor was not given, and keeps nothing', async () => {
    const context = newsContext();

    const refused = await call(seedsSubmit, { seeds: [{ ...SEED, headlineIds: ['hffffffff'] }] }, context);

    expect(refused.body).toMatchObject({ accepted: false, issues: [{ code: 'unknown-headline' }] });
    expect(await loadSeeds(context.saveDir, context.saveFs)).toEqual({});
  });

  it('refuses a headline the tragedy filter removed', async () => {
    const context = newsContext();
    const bus = headlineId('Dozens killed as a bus overturns');

    const refused = await call(seedsSubmit, { seeds: [{ ...SEED, headlineIds: [bus] }] }, context);

    expect(refused.body).toMatchObject({ accepted: false, issues: [{ code: 'unknown-headline' }] });
  });

  it('refuses a name from the headlines of the day, without repeating it', async () => {
    const context = newsContext();

    const refused = await call(
      seedsSubmit,
      { seeds: [{ ...SEED, premise: 'Norway runs short of a staple and blames its neighbours.' }] },
      context,
    );

    expect(refused.body).toMatchObject({ accepted: false, issues: [{ code: 'real-name' }] });
    expect(JSON.stringify(refused.body)).not.toContain('Norway');
  });

  it('refuses a real name of the dictionary even when no headline of the day has it', async () => {
    const context = newsContext();
    const added = proposeEntry(EMPTY_WORLD, {
      kind: 'country',
      real: ['Freedonia'],
      mirror: { ru: 'Вальдмарк', en: 'Valdmark' },
    });
    if (!added.ok) throw new Error('The test world must be valid.');
    await saveWorld(context.saveDir, added.world, context.saveFs);

    const refused = await call(
      seedsSubmit,
      { seeds: [{ ...SEED, premise: 'Freedonia runs short of a staple and blames its neighbours.' }] },
      context,
    );

    expect(refused.body).toMatchObject({ accepted: false, issues: [{ code: 'real-name' }] });
  });

  it('refuses input that is not a list of seeds', async () => {
    const refused = await call(
      seedsSubmit,
      { seeds: [{ ...SEED, title: 'Grain prices dip' }] },
      newsContext(),
    );

    expect(errorCode(refused)).toBe('invalid-input');
  });

  it('fails plainly when the dictionary cannot be used', async () => {
    const context = newsContext();
    context.fs.files.set(join('game-save', 'world.json'), '{ not json');

    expect(errorCode(await call(seedsSubmit, { seeds: [SEED] }, context))).toBe('world-unusable');
  });
});
