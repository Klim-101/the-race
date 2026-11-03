// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { MAX_REPUTATION } from '../run.js';
import { resolveIntent, type Resolved } from './actions.js';
import {
  ASK_DIFFICULTY,
  ASK_MINUTES,
  ASK_RULESET_VERSION,
  FAILED_ASK_MINUTES,
  FAILED_STUDY_MINUTES,
  STUDY_MINUTES,
} from './ask.js';
import { DetectiveCaseSchema } from './case-schema.js';
import type { KitItem } from './gear.js';
import { createDetectiveRun, findClue, moveTo, viewRun, type DetectiveRunState } from './run-state.js';

/** A seed whose first d20 roll is `die`. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

const owned = (id: KitItem['id'], charges?: number): KitItem => ({
  id,
  state: 'owned',
  ...(charges === undefined ? {} : { charges }),
});

/**
 * The cheese case with a lane that waits for a rumour the locals of the square know, a rumour the locals of the stall
 * would give, and leads earned by studying the glove (with any tool) and the tracks (with the magnifier only).
 */
function newRun(
  options: { kit?: KitItem[]; ruleset?: number; contacts?: number; perception?: number } = {},
): DetectiveRunState {
  const detectiveCase = buildCheeseCase();
  detectiveCase.locations.push({
    id: 'back-lane',
    name: 'Back lane',
    description: 'Bins and cats.',
    connections: ['market-square'],
    access: { kind: 'open' },
    requiresLead: 'lane-rumour',
  });
  const square = detectiveCase.locations.find((place) => place.id === 'market-square');
  if (square !== undefined) {
    square.parts = [
      {
        id: 'bench',
        name: 'The bench',
        obstacle: null,
        holds: 'cellar-key',
        inQuickLook: false,
        requiresLead: 'bench-tip',
        fallback: null,
      },
    ];
  }
  const lead = (id: string, earnedBy: Record<string, unknown>) => ({
    id,
    reason: `Someone says something about ${id}.`,
    earnedBy,
    isFalse: false,
  });
  detectiveCase.leads = [
    lead('lane-rumour', { kind: 'locals', locationId: 'market-square' }),
    lead('bench-tip', { kind: 'study', clueId: 'blue-glove' }),
    lead('tracks-note', { kind: 'study', clueId: 'cart-tracks', tool: 'magnifier' }),
  ];
  const hero = buildHero();
  const run = createDetectiveRun({
    hero: {
      ...hero,
      skills: {
        ...hero.skills,
        contacts: options.contacts ?? hero.skills.contacts,
        perception: options.perception ?? hero.skills.perception,
      },
    },
    traits: [],
    case: DetectiveCaseSchema.parse(detectiveCase),
    seed: 'ask',
    rngState: 1,
    locale: 'en',
  });
  return {
    ...run,
    kit: options.kit ?? [owned('phone')],
    rulesetVersion: options.ruleset ?? ASK_RULESET_VERSION,
  };
}

const ok = (resolution: Resolved): Extract<Resolved, { ok: true }> => {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
};

const ask = (run: DetectiveRunState, rng: Rng, toolId?: string): Resolved =>
  resolveIntent(run, { kind: 'ask', ...(toolId === undefined ? {} : { toolId }) }, rng);
const study = (run: DetectiveRunState, rng: Rng, clueId: string, toolId?: string): Resolved =>
  resolveIntent(run, { kind: 'study', clueId, ...(toolId === undefined ? {} : { toolId }) }, rng);

const refusalOf = (resolution: Resolved): string => {
  if (resolution.ok) throw new Error('Expected a refusal.');
  return resolution.refusal.code;
};

const earned = (run: DetectiveRunState): string[] => run.earnedLeads.map(({ leadId }) => leadId);

describe('asking the locals', () => {
  it('gets a rumour out of them on a good roll, and a rumour names an unknown place and opens it', () => {
    const run = newRun();
    expect(viewRun(run).location.exits.map(({ id }) => id)).not.toContain('back-lane');

    const heard = ok(ask(run, dice(20)));

    expect(heard.outcome).toEqual({ kind: 'ask', minutes: ASK_MINUTES, succeeded: true, consequences: [] });
    expect(heard.newLeadIds).toEqual(['lane-rumour']);
    expect(viewRun(heard.run).location.exits.find(({ id }) => id === 'back-lane')).toMatchObject({
      lead: 'Someone says something about lane-rumour.',
    });
    expect(
      ok(resolveIntent(heard.run, { kind: 'move', locationId: 'back-lane' }, createRng(1))).outcome,
    ).toMatchObject({
      entered: true,
    });
  });

  it('costs only time on a poor roll, and may be tried again', () => {
    const run = newRun();

    const silent = ok(ask(run, dice(2)));

    expect(silent.outcome).toMatchObject({
      succeeded: false,
      minutes: ASK_MINUTES + FAILED_ASK_MINUTES,
      consequences: ['time-lost'],
    });
    expect(silent.newLeadIds).toEqual([]);
    expect(ok(ask(silent.run, dice(20))).newLeadIds).toEqual(['lane-rumour']);
  });

  it('gives nothing, and does not say there was nothing, where the locals know nothing', () => {
    const heard = ok(ask(moveTo(newRun(), 'cheese-stall'), dice(20)));

    expect(heard.outcome).toMatchObject({ succeeded: true, consequences: [] });
    expect(heard.newLeadIds).toEqual([]);
  });

  it('gives nothing the second time, for there is nothing new', () => {
    const first = ok(ask(newRun(), dice(20)));

    const second = ok(ask(first.run, dice(20)));

    expect(second.newLeadIds).toEqual([]);
    expect(earned(second.run)).toEqual(['lane-rumour']);
  });

  it('costs reputation on a natural 1', () => {
    const done = ok(ask(newRun(), dice(1)));

    expect(done.run.reputation).toBe(MAX_REPUTATION - 1);
    expect(done.outcome).toMatchObject({ consequences: ['time-lost', 'reputation-lost'] });
  });

  it('is eased by cash, which is used up', () => {
    const kit = [owned('phone'), owned('cash', 2)];
    const hero = buildHero().skills.contacts;
    const die = ASK_DIFFICULTY - hero - 3;

    const withCash = ok(ask(newRun({ kit }), dice(die), 'cash'));
    const without = ok(ask(newRun({ kit }), dice(die)));

    expect(withCash.outcome).toMatchObject({ succeeded: true, tool: { id: 'cash', wear: null } });
    expect(withCash.run.kit.find(({ id }) => id === 'cash')).toEqual(owned('cash', 1));
    expect(without.outcome).toMatchObject({ succeeded: false });
    expect(without.outcome).not.toHaveProperty('tool');
    const last = ok(ask(newRun({ kit: [owned('phone'), owned('cash', 1)] }), dice(20), 'cash'));
    expect(last.outcome).toMatchObject({ tool: { id: 'cash', wear: 'spent' } });
    expect(last.run.kit.find(({ id }) => id === 'cash')?.state).toBe('spent');
  });

  it('refuses a piece that is not in the kit or is no help, and a run from before it', () => {
    const rng = createRng(1);

    expect(refusalOf(ask(newRun(), rng, 'cash'))).toBe('wrong-tool');
    expect(refusalOf(ask(newRun({ kit: [owned('phone'), owned('picks')] }), rng, 'picks'))).toBe(
      'wrong-tool',
    );
    expect(refusalOf(ask(newRun({ ruleset: ASK_RULESET_VERSION - 1 }), rng))).toBe('not-available');
    expect(rng.state()).toBe(createRng(1).state());
  });

  it('plays out the same way over many seeds: the roll decides, and a rumour is never earned twice', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const run = newRun();
      const heard = ok(ask(run, createRng(seed)));
      if (heard.outcome.kind !== 'ask') throw new Error('Not an ask.');
      const { succeeded, minutes } = heard.outcome;

      expect(minutes).toBe(succeeded ? ASK_MINUTES : ASK_MINUTES + FAILED_ASK_MINUTES);
      expect(earned(heard.run)).toEqual(succeeded ? ['lane-rumour'] : []);
      expect(heard.run.clock.minute).toBe(run.clock.minute + minutes);
    }
  });
});

describe('studying a clue', () => {
  const holding = (options: Parameters<typeof newRun>[0] = {}) =>
    ['blue-glove', 'cart-tracks'].reduce(findClue, newRun(options));

  it('needs a clue the hero holds, and says nothing of one they do not', () => {
    const rng = createRng(1);

    expect(refusalOf(study(newRun(), rng, 'blue-glove'))).toBe('clue-not-found');
    expect(refusalOf(study(newRun(), rng, 'no-such-clue'))).toBe('clue-not-found');
    expect(rng.state()).toBe(createRng(1).state());
  });

  it('is done with the phone when the kit has nothing better, and a good roll earns the lead', () => {
    const run = holding();
    // The phone's camera: perception 12 against the hero's 3.
    const die = 12 - buildHero().skills.perception;

    const sharp = ok(study(run, dice(die), 'blue-glove'));
    const blurred = ok(study(run, dice(die - 1), 'blue-glove'));

    expect(sharp.outcome).toMatchObject({
      kind: 'study',
      clueId: 'blue-glove',
      succeeded: true,
      minutes: STUDY_MINUTES,
      tool: { id: 'phone', wear: null },
    });
    expect(sharp.newLeadIds).toEqual(['bench-tip']);
    expect(blurred.outcome).toMatchObject({
      succeeded: false,
      minutes: STUDY_MINUTES + FAILED_STUDY_MINUTES,
      consequences: ['time-lost'],
    });
    expect(blurred.newLeadIds).toEqual([]);
  });

  it('shows the part the lead names, once earned', () => {
    const run = holding();

    const done = ok(study(run, dice(20), 'blue-glove'));

    expect(done.run.noticedPartIds).toContain('bench');
    expect(viewRun(moveTo(done.run, 'market-square')).location.parts.map(({ id }) => id)).toEqual(['bench']);
  });

  it('uses the easiest tool of the kit when none is named, and the one named when one is', () => {
    const kit = [owned('phone'), owned('magnifier'), owned('test-kit')];
    const run = holding({ kit });

    expect(ok(study(run, dice(20), 'blue-glove')).outcome).toMatchObject({ tool: { id: 'magnifier' } });
    expect(ok(study(run, dice(20), 'blue-glove', 'phone')).outcome).toMatchObject({ tool: { id: 'phone' } });
  });

  it('keeps the tool that wears least when two are as easy', () => {
    const run = holding({ kit: [owned('notebook'), owned('test-kit'), owned('uv-lamp'), owned('phone')] });

    expect(ok(study(run, dice(20), 'blue-glove')).outcome).toMatchObject({ tool: { id: 'uv-lamp' } });
  });

  it('earns a lead that wants one tool with that tool only', () => {
    const kit = [owned('phone'), owned('magnifier')];
    const run = holding({ kit });

    expect(ok(study(run, dice(20), 'cart-tracks', 'phone')).newLeadIds).toEqual([]);
    expect(ok(study(run, dice(20), 'cart-tracks', 'magnifier')).newLeadIds).toEqual(['tracks-note']);
    expect(ok(study(run, dice(20), 'cart-tracks')).newLeadIds).toEqual(['tracks-note']);
  });

  it('spends a charge of what is used up, and the last one is spent', () => {
    const run = holding({ kit: [owned('phone'), owned('test-kit', 2)] });

    const first = ok(study(run, dice(20), 'blue-glove', 'test-kit'));
    const last = ok(study(first.run, dice(2), 'blue-glove', 'test-kit'));

    expect(first.run.kit.find(({ id }) => id === 'test-kit')).toEqual(owned('test-kit', 1));
    expect(last.outcome).toMatchObject({ succeeded: false, tool: { id: 'test-kit', wear: 'spent' } });
    expect(last.outcome).toMatchObject({ minutes: STUDY_MINUTES + 15 });
    expect(last.run.kit.find(({ id }) => id === 'test-kit')?.state).toBe('spent');
  });

  it('refuses a tool that is no use for it or not in the kit, or a kit with nothing, before anything is spent', () => {
    const rng = createRng(1);

    expect(
      refusalOf(study(holding({ kit: [owned('phone'), owned('knife')] }), rng, 'blue-glove', 'knife')),
    ).toBe('wrong-tool');
    expect(refusalOf(study(holding(), rng, 'blue-glove', 'magnifier'))).toBe('wrong-tool');
    expect(refusalOf(study(holding({ kit: [owned('knife')] }), rng, 'blue-glove'))).toBe('needs-tool');
    expect(refusalOf(study(holding({ kit: [{ id: 'phone', state: 'lost' }] }), rng, 'blue-glove'))).toBe(
      'needs-tool',
    );
    expect(rng.state()).toBe(createRng(1).state());
  });

  it('is only for a run of the ruleset of rumours', () => {
    expect(refusalOf(study(holding({ ruleset: ASK_RULESET_VERSION - 1 }), createRng(1), 'blue-glove'))).toBe(
      'not-available',
    );
  });

  it('plays out the same way over many seeds: the roll decides, and the time follows', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const run = holding({ kit: [owned('phone'), owned('magnifier')] });
      const done = ok(study(run, createRng(seed), 'blue-glove'));
      if (done.outcome.kind !== 'study') throw new Error('Not a study.');
      const { succeeded, minutes } = done.outcome;

      expect(minutes).toBe(succeeded ? STUDY_MINUTES : STUDY_MINUTES + FAILED_STUDY_MINUTES);
      expect(earned(done.run)).toEqual(succeeded ? ['bench-tip'] : []);
    }
  });
});
