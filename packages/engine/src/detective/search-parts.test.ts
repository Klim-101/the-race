// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { TraitSchema, type Trait } from '../traits.js';
import {
  FAILED_SEARCH_MINUTES,
  PART_LOOK_MINUTES,
  PART_SEARCH_MINUTES,
  resolveIntent,
  type Resolution,
} from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { SEARCH_BY_PART_RULESET_VERSION } from './search-parts.js';
import { DETECTIVE_TRAITS } from './traits.js';
import {
  DetectiveRunStateSchema,
  createDetectiveRun,
  endRun,
  findClue,
  moveTo,
  noticeParts,
  recordPartSearch,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';

/** A seed whose first d20 roll is `die`, so that a test can choose how a check goes. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

const part = (id: string, holds: string | null, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `The ${id}`,
  obstacle: null,
  holds,
  inQuickLook: true,
  requiresLead: null,
  fallback: null,
  ...overrides,
});

/**
 * The cheese case with parts in the market square and at the stall. In the square the key lies in the dark
 * under the fountain's edge, beside a bench with nothing on it and a spot nothing shows yet; at the stall the
 * flour wants a roll and the glove is in a locked crate, the baker being the way round it.
 */
function buildPartedCase(): DetectiveCase {
  const detectiveCase = buildCheeseCase();
  const partsOf: Record<string, unknown[]> = {
    'market-square': [
      part('fountain-edge', 'cellar-key', { obstacle: 'dark' }),
      part('bench', null),
      part('odd-spot', null, { inQuickLook: false, requiresLead: 'worn-spot' }),
    ],
    'cheese-stall': [
      part('plinth', 'flour-crumbs'),
      part('crate', 'blue-glove', { obstacle: 'locked', fallback: { kind: 'ask', suspectId: 'baker' } }),
    ],
  };
  for (const location of detectiveCase.locations) {
    const parts = partsOf[location.id as string];
    if (parts !== undefined) location.parts = parts;
  }
  return DetectiveCaseSchema.parse(detectiveCase);
}

function newRun(
  options: { edit?: (detectiveCase: DetectiveCase) => void; traits?: Trait[]; ruleset?: number } = {},
): DetectiveRunState {
  const detectiveCase = buildPartedCase();
  options.edit?.(detectiveCase);
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: (options.traits ?? []).map((entry) => TraitSchema.parse(entry)),
    case: detectiveCase,
    seed: 'parts',
    rngState: 1,
    locale: 'en',
  });
  // The phone alone, whatever the seed would have handed the hero: these tests are about the parts.
  const bare = { ...run, kit: [{ id: 'phone' as const, state: 'owned' as const }] };
  return options.ruleset === undefined ? bare : { ...bare, rulesetVersion: options.ruleset };
}

function ok(resolution: Resolution): Extract<Resolution, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

function refusalOf(run: DetectiveRunState, intent: unknown, rng = createRng(1)): string {
  const resolution = resolveIntent(run, intent, rng);
  if (resolution.ok) throw new Error('Expected a refusal.');
  expect(rng.state()).toBe(createRng(1).state());
  return resolution.refusal.code;
}

/** A quick look at the place the hero stands in. */
const looked = (run: DetectiveRunState): DetectiveRunState =>
  ok(resolveIntent(run, { kind: 'look' }, createRng(3))).run;

/** The hero at the stall, which they have looked round. */
const atStall = (options: Parameters<typeof newRun>[0] = {}): DetectiveRunState =>
  looked(moveTo(newRun(options), 'cheese-stall'));

describe('a quick look at a place made of parts', () => {
  it('names the parts in the open and takes what lies in plain sight, for a little longer than a glance', () => {
    const run = newRun({
      edit: (detectiveCase) => {
        const crate = detectiveCase.locations[1]?.parts?.[1];
        if (crate !== undefined) crate.obstacle = null;
      },
    });

    const { run: next, outcome } = ok(resolveIntent(moveTo(run, 'cheese-stall'), { kind: 'look' }, dice(10)));

    expect(outcome).toEqual({
      kind: 'look',
      foundClueIds: ['blue-glove'],
      minutes: PART_LOOK_MINUTES,
      noticedPartIds: ['plinth', 'crate'],
    });
    expect(next.noticedPartIds).toEqual(['plinth', 'crate']);
    expect(next.foundClueIds).toEqual(['blue-glove']);
  });

  it('leaves what is behind an obstacle, and what needs a roll, to a thorough search', () => {
    const { outcome } = ok(resolveIntent(moveTo(newRun(), 'cheese-stall'), { kind: 'look' }, dice(10)));

    expect(outcome).toMatchObject({ foundClueIds: [], noticedPartIds: ['plinth', 'crate'] });
  });

  it('does not show a part that only a lead would show', () => {
    const { outcome, run } = ok(resolveIntent(newRun(), { kind: 'look' }, dice(10)));

    expect(outcome).toMatchObject({ noticedPartIds: ['fountain-edge', 'bench'] });
    expect(run.noticedPartIds).not.toContain('odd-spot');
  });

  it('shows the same parts again and finds nothing new', () => {
    const first = looked(newRun());

    const second = ok(resolveIntent(first, { kind: 'look' }, createRng(4)));

    expect(second.run.noticedPartIds).toEqual(['fountain-edge', 'bench']);
    expect(second.outcome).toMatchObject({ foundClueIds: [] });
  });

  it('lists the parts the hero has noticed, with the obstacle and whether each is searched, and never what is in them', () => {
    const run = looked(newRun());

    expect(viewRun(run).location.parts).toEqual([
      { id: 'fountain-edge', name: 'The fountain-edge', obstacle: 'dark', searched: false },
      { id: 'bench', name: 'The bench', obstacle: null, searched: false },
    ]);
    expect(viewRun(newRun()).location.parts).toEqual([]);
    expect(JSON.stringify(viewRun(run).location)).not.toContain('cellar-key');
  });
});

describe('a thorough search of one part', () => {
  it('needs a part to be named, and one of this place', () => {
    const run = looked(newRun());

    expect(refusalOf(run, { kind: 'search' })).toBe('unknown-part');
    expect(refusalOf(run, { kind: 'search', partId: 'plinth' })).toBe('unknown-part');
  });

  it('needs the part to have been noticed', () => {
    expect(refusalOf(newRun(), { kind: 'search', partId: 'bench' })).toBe('part-not-noticed');
    expect(refusalOf(looked(newRun()), { kind: 'search', partId: 'odd-spot' })).toBe('part-not-noticed');
  });

  it('refuses a part with an obstacle the phone cannot clear, and costs nothing', () => {
    const run = atStall();

    expect(refusalOf(run, { kind: 'search', partId: 'crate' })).toBe('needs-tool');
  });

  it('refuses a place that has no parts to search by one', () => {
    const run = moveTo(findClue(newRun(), 'cellar-key'), 'storage-cellar');

    expect(refusalOf(run, { kind: 'search', partId: 'floor' })).toBe('unknown-part');
  });

  it('finds what the roll uncovers, and writes it down with the part and the turn', () => {
    const { run, outcome, details } = ok(
      resolveIntent(atStall(), { kind: 'search', partId: 'plinth' }, dice(15)),
    );

    expect(outcome).toEqual({
      kind: 'search',
      foundClueIds: ['flour-crumbs'],
      minutes: PART_SEARCH_MINUTES,
      consequences: [],
      partId: 'plinth',
    });
    expect(details).toMatchObject([{ subject: { kind: 'clue', id: 'flour-crumbs' } }]);
    expect(run.searchedParts).toEqual([
      { partId: 'plinth', locationId: 'cheese-stall', turn: run.turn, foundClueIds: ['flour-crumbs'] },
    ]);
    expect(run.searchedLocationIds).toEqual(['cheese-stall']);
    expect(viewRun(run).location.parts[0]).toMatchObject({ id: 'plinth', searched: true });
  });

  it('leaves a part searched for good', () => {
    const { run } = ok(resolveIntent(atStall(), { kind: 'search', partId: 'plinth' }, dice(15)));

    expect(refusalOf(run, { kind: 'search', partId: 'plinth' })).toBe('part-searched');
  });

  it('costs time and a point of nerves when the roll misses, and leaves the part to try again', () => {
    const missed = ok(resolveIntent(atStall(), { kind: 'search', partId: 'plinth' }, dice(2)));

    expect(missed.outcome).toMatchObject({
      foundClueIds: [],
      minutes: PART_SEARCH_MINUTES + FAILED_SEARCH_MINUTES,
      consequences: ['time-lost', 'nerves-lost'],
    });
    expect(missed.run.searchedParts).toEqual([]);
    const again = ok(resolveIntent(missed.run, { kind: 'search', partId: 'plinth' }, dice(15)));
    expect(again.outcome).toMatchObject({ foundClueIds: ['flour-crumbs'] });
  });

  it('costs reputation as well on a natural 1, and the nerves only once', () => {
    const { run, outcome } = ok(resolveIntent(atStall(), { kind: 'search', partId: 'plinth' }, dice(1)));

    expect(outcome).toMatchObject({ consequences: ['time-lost', 'reputation-lost'] });
    expect(run.condition.nerves).toBe(atStall().condition.nerves - 1);
  });

  it('clears the dark with the phone and finds what lies in plain sight in it, with no roll', () => {
    const rng = dice(2);
    const { run, outcome, details } = ok(
      resolveIntent(looked(newRun()), { kind: 'search', partId: 'fountain-edge' }, rng),
    );

    expect(outcome).toMatchObject({ foundClueIds: ['cellar-key'], partId: 'fountain-edge' });
    expect(details).toMatchObject([{ result: 'auto' }]);
    expect(run.foundClueIds).toEqual(['cellar-key']);
  });

  it('finds nothing in an empty part and charges only its time', () => {
    const { run, outcome } = ok(
      resolveIntent(looked(newRun()), { kind: 'search', partId: 'bench' }, createRng(5)),
    );

    expect(outcome).toEqual({
      kind: 'search',
      foundClueIds: [],
      minutes: PART_SEARCH_MINUTES,
      consequences: [],
      partId: 'bench',
    });
    expect(run.searchedParts).toMatchObject([{ partId: 'bench', foundClueIds: [] }]);
  });

  it('finds nothing in a part whose clue the hero already has, without a penalty', () => {
    const run = findClue(looked(newRun()), 'cellar-key');

    const { outcome } = ok(resolveIntent(run, { kind: 'search', partId: 'fountain-edge' }, createRng(5)));

    expect(outcome).toMatchObject({ foundClueIds: [], consequences: [], minutes: PART_SEARCH_MINUTES });
  });

  it('keeps shut to the hero a clue from a source their traits close', () => {
    const oldEnemy = DETECTIVE_TRAITS.find(({ id }) => id === 'old-enemy-in-the-police');
    const run = atStall({
      traits: oldEnemy === undefined ? [] : [oldEnemy],
      edit: (detectiveCase) => {
        const flour = detectiveCase.clues.find(({ id }) => id === 'flour-crumbs');
        if (flour !== undefined) flour.source = 'police-data';
      },
    });

    const { outcome } = ok(resolveIntent(run, { kind: 'search', partId: 'plinth' }, dice(20)));

    expect(outcome).toMatchObject({ foundClueIds: [], consequences: [] });
  });

  it('plays out the same way over many seeds: the roll decides, and a part is never found and missed at once', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const resolution = ok(resolveIntent(atStall(), { kind: 'search', partId: 'plinth' }, createRng(seed)));
      if (resolution.outcome.kind !== 'search') throw new Error('Not a search.');
      const { foundClueIds, minutes, consequences } = resolution.outcome;

      const found = foundClueIds.length === 1;
      expect(found).toBe(resolution.run.foundClueIds.includes('flour-crumbs'));
      expect(resolution.run.searchedParts.length).toBe(found ? 1 : 0);
      expect(minutes).toBe(found ? PART_SEARCH_MINUTES : PART_SEARCH_MINUTES + FAILED_SEARCH_MINUTES);
      expect(consequences.includes('time-lost')).toBe(!found);
    }
  });
});

describe('the way round an obstacle: asking the person', () => {
  const talk = (run: DetectiveRunState, die: number) =>
    ok(resolveIntent(run, { kind: 'interrogate', suspectId: 'baker', approach: 'social' }, dice(die)));

  it('gives the clue behind the obstacle when the talk goes well', () => {
    const { run, outcome } = talk(atStall(), 20);

    expect(outcome).toMatchObject({ kind: 'interrogate', succeeded: true, told: ['blue-glove'] });
    expect(run.foundClueIds).toContain('blue-glove');
  });

  it('gives nothing when the talk goes badly', () => {
    const { run, outcome } = talk(atStall(), 2);

    expect(outcome).toMatchObject({ succeeded: false });
    expect(outcome).not.toHaveProperty('told');
    expect(run.foundClueIds).toEqual([]);
  });

  it('does not tell a clue the hero already has, or one from a source closed to them', () => {
    expect(talk(findClue(atStall(), 'blue-glove'), 20).outcome).not.toHaveProperty('told');

    const oldEnemy = DETECTIVE_TRAITS.find(({ id }) => id === 'old-enemy-in-the-police');
    const closed = atStall({
      traits: oldEnemy === undefined ? [] : [oldEnemy],
      edit: (detectiveCase) => {
        const glove = detectiveCase.clues.find(({ id }) => id === 'blue-glove');
        if (glove !== undefined) glove.source = 'police-data';
      },
    });
    expect(talk(closed, 20).outcome).not.toHaveProperty('told');
  });

  it('is a person the hero talks to, so a lead as the way round tells nothing yet', () => {
    const run = atStall({
      edit: (detectiveCase) => {
        const crate = detectiveCase.locations[1]?.parts?.[1];
        if (crate !== undefined) crate.fallback = { kind: 'lead', leadId: 'baker-gossip' };
      },
    });

    expect(talk(run, 20).outcome).not.toHaveProperty('told');
  });

  it('is for the ruleset of parts only', () => {
    const run = atStall({ ruleset: SEARCH_BY_PART_RULESET_VERSION - 1 });

    expect(talk(run, 20).outcome).not.toHaveProperty('told');
  });
});

describe('a run of an older ruleset', () => {
  it('keeps the old look and the old search of the whole place', () => {
    const old = moveTo(newRun({ ruleset: SEARCH_BY_PART_RULESET_VERSION - 1 }), 'cheese-stall');

    const glance = ok(resolveIntent(old, { kind: 'look' }, dice(10)));
    expect(glance.outcome).toEqual({ kind: 'look', foundClueIds: ['blue-glove'], minutes: 5 });
    expect(glance.run.noticedPartIds).toEqual([]);

    const search = ok(resolveIntent(old, { kind: 'search' }, dice(15)));
    expect(search.outcome).toMatchObject({ foundClueIds: ['flour-crumbs', 'blue-glove'], minutes: 30 });
    expect(viewRun(old).location.parts).toEqual([]);
  });

  it('refuses a part named in the old search', () => {
    const old = newRun({ ruleset: SEARCH_BY_PART_RULESET_VERSION - 1 });

    expect(refusalOf(old, { kind: 'search', partId: 'bench' })).toBe('unknown-part');
  });
});

describe('the state of parts', () => {
  it('refuses to be written with a part the case does not have', () => {
    const run = newRun();

    expect(DetectiveRunStateSchema.safeParse({ ...run, noticedPartIds: ['no-such-part'] }).success).toBe(
      false,
    );
    expect(DetectiveRunStateSchema.safeParse({ ...run, noticedPartIds: ['bench'] }).success).toBe(true);
    const searched = { partId: 'no-such-part', locationId: 'market-square', turn: 1, foundClueIds: [] };
    expect(DetectiveRunStateSchema.safeParse({ ...run, searchedParts: [searched] }).success).toBe(false);
  });

  it('refuses to record the search of a part that is not there, or of a run that is over', () => {
    const run = newRun();

    expect(() => recordPartSearch(run, 'no-such-part', 'market-square', [])).toThrow(RangeError);
    expect(() => recordPartSearch(endRun(run, 'gave-up'), 'bench', 'market-square', [])).toThrow(RangeError);
    expect(() => noticeParts(endRun(run, 'gave-up'), ['bench'])).toThrow(RangeError);
  });
});
