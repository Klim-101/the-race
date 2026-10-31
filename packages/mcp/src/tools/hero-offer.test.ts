// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { offerHeroes } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { call, gameContext, installCase } from '../../test/game.js';
import { loadPending } from '../pending-run.js';
import { heroOffer } from './hero-offer.js';
import { heroPick } from './hero-pick.js';
import { runNew } from './run-new.js';
import { runView } from './run-view.js';

interface Candidate {
  id: string;
  name: string;
  background: string;
  build: string;
  signalId?: string;
}

async function started(seed = 'tavern-seed', locale: 'en' | 'ru' = 'en') {
  const context = gameContext();
  await call(runNew, { locale, seed }, context);
  return context;
}

const candidatesOf = (body: Record<string, unknown>) => body.candidates as Candidate[];

describe('hero_offer', () => {
  it('puts three heroes forward, the engine`s offer for the seed, with one re-roll left', async () => {
    const context = await started();

    const result = await call(heroOffer, {}, context);

    expect(result.isError).toBe(false);
    expect(result.body).toMatchObject({ status: 'awaiting-hero', round: 0, rerollsLeft: 1 });
    expect(candidatesOf(result.body).map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(candidatesOf(result.body).map(({ name }) => name)).toEqual(
      offerHeroes('tavern-seed', 0, 'en').map(({ name }) => name),
    );
  });

  it('is the same on every call and in the language of the run', async () => {
    const context = await started('tavern-seed', 'ru');

    const first = await call(heroOffer, {}, context);
    const second = await call(heroOffer, {}, context);

    expect(second.body).toEqual(first.body);
    expect(candidatesOf(first.body)[0]?.name).toMatch(/^[А-Яа-яЁё]+ [А-Яа-яЁё]+$/);
  });

  it('shows what a card may show and no hidden trait', async () => {
    const context = await started();

    const result = await call(heroOffer, {}, context);

    expect(JSON.stringify(result.body)).not.toMatch(/trait/i);
    for (const candidate of candidatesOf(result.body)) {
      expect(Object.keys(candidate).toSorted()).toEqual(
        [
          'background',
          'build',
          'gender',
          'id',
          'name',
          'skills',
          ...('signalId' in candidate ? ['signalId'] : []),
        ].toSorted(),
      );
    }
  });

  it('puts three others forward on a re-roll, once per run', async () => {
    const context = await started();
    const first = await call(heroOffer, {}, context);

    const again = await call(heroOffer, { reroll: true }, context);

    expect(again.isError).toBe(false);
    expect(again.body).toMatchObject({ round: 1, rerollsLeft: 0 });
    expect(candidatesOf(again.body).map(({ name }) => name)).not.toEqual(
      candidatesOf(first.body).map(({ name }) => name),
    );
    const refused = await call(heroOffer, { reroll: true }, context);
    expect(refused.isError).toBe(true);
    expect(refused.body).toMatchObject({ error: { code: 'no-rerolls-left' } });
    const same = await call(heroOffer, {}, context);
    expect(same.body).toEqual(again.body);
  });

  it('drops a hero already picked when the tavern is asked again, so the poll starts over', async () => {
    const context = await started();
    await call(heroPick, { choiceId: 'a' }, context);
    expect((await loadPending(context.saveDir, context.saveFs))?.hero).not.toBeNull();

    await call(heroOffer, { reroll: true }, context);

    const pending = await loadPending(context.saveDir, context.saveFs);
    expect(pending?.hero).toBeNull();
    expect(pending?.traits).toEqual([]);
  });

  it('needs a new run waiting for a hero', async () => {
    const result = await call(heroOffer, {}, gameContext());

    expect(result.isError).toBe(true);
    expect(result.body).toMatchObject({ error: { code: 'no-pending-run' } });
  });
});

describe('hero_pick', () => {
  it('makes the hero of the card, with the hidden traits rolled and not shown', async () => {
    const context = await started();
    const card = candidatesOf((await call(heroOffer, {}, context)).body)[1];

    const result = await call(heroPick, { choiceId: 'b' }, context);

    expect(result.isError).toBe(false);
    expect(result.body).toMatchObject({
      status: 'awaiting-case',
      hero: { name: card?.name, background: card?.background, archetype: 'detective' },
      hiddenTraitCount: expect.any(Number) as unknown,
    });
    expect(JSON.stringify(result.body)).not.toMatch(/"traits"/);
    const pending = await loadPending(context.saveDir, context.saveFs);
    expect(pending?.hero?.name).toBe(card?.name);
    expect(pending?.traits.length).toBe(result.body.hiddenTraitCount);
  });

  it('takes the name the player gives instead of the one on the card', async () => {
    const context = await started();

    const result = await call(heroPick, { choiceId: 'c', name: '  Own Name ' }, context);

    expect(result.body).toMatchObject({ hero: { name: 'Own Name' } });
  });

  it('is reproducible, and a player who changes their mind gets the other hero', async () => {
    const context = await started();
    const first = await call(heroPick, { choiceId: 'a' }, context);
    const again = await call(heroPick, { choiceId: 'a' }, context);
    const other = await call(heroPick, { choiceId: 'b' }, context);

    expect(again.body).toEqual(first.body);
    expect((other.body.hero as { name: string }).name).not.toBe((first.body.hero as { name: string }).name);
    const pending = await loadPending(context.saveDir, context.saveFs);
    expect(pending?.hero?.name).toBe((other.body.hero as { name: string }).name);
  });

  it('rolls the hidden traits on dice of the pick itself, so the offer shows them nothing in common', async () => {
    const seen = new Set<string>();
    for (let index = 0; index < 20; index += 1) {
      const context = await started(`tavern-traits-${String(index)}`);
      for (const choiceId of ['a', 'b', 'c'] as const) {
        await call(heroPick, { choiceId }, context);
        const pending = await loadPending(context.saveDir, context.saveFs);
        seen.add(JSON.stringify(pending?.traits));
      }
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('refuses an id that is not one of the three, before anything is saved', async () => {
    const context = await started();

    const result = await call(heroPick, { choiceId: 'd' }, context);

    expect(result.isError).toBe(true);
    expect((await loadPending(context.saveDir, context.saveFs))?.hero).toBeNull();
  });

  it('needs a new run waiting for a hero', async () => {
    const result = await call(heroPick, { choiceId: 'a' }, gameContext());

    expect(result.body).toMatchObject({ error: { code: 'no-pending-run' } });
  });

  it('refuses a name that is blank', async () => {
    const context = await started();

    const result = await call(heroPick, { choiceId: 'a', name: '   ' }, context);

    expect(result.isError).toBe(true);
  });

  it('leads to a run: the case is installed for the picked hero and the view shows them', async () => {
    const context = await started();
    await call(heroPick, { choiceId: 'a' }, context);

    await installCase(context);

    const view = await call(runView, {}, context);
    expect(view.body).toMatchObject({ status: 'active' });
  });
});
