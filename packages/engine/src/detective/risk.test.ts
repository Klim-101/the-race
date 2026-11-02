// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { MAX_REPUTATION } from '../run.js';
import { type Trait } from '../traits.js';
import { PART_SEARCH_MINUTES, resolveIntent, type Resolved } from './actions.js';
import { DetectiveCaseSchema, type ObstacleKind } from './case-schema.js';
import type { KitItem } from './gear.js';
import {
  DETAINED_BELOW,
  DETENTION_MINUTES,
  MIN_DETENTION_MINUTES,
  RISK_RULESET_VERSION,
  UNSEEN_AT,
  detentionMinutes,
  unlawfulRisk,
} from './risk.js';
import { createDetectiveRun, type DetectiveRunState } from './run-state.js';
import { DETECTIVE_TRAITS } from './traits.js';

/** A seed whose first two d20 rolls are `first` and `second`: the tool's check, then the risk of using it. */
function dice(first: number, second: number): Rng {
  for (let seed = 0; ; seed += 1) {
    const rng = createRng(seed);
    if (rng.roll(D20_SIDES) === first && rng.roll(D20_SIDES) === second) return createRng(seed);
  }
}

const owned = (id: KitItem['id']): KitItem => ({ id, state: 'owned' });

function runWith(
  obstacle: ObstacleKind,
  kit: readonly KitItem[],
  options: { ruleset?: number; traits?: Trait[]; social?: number; contacts?: number } = {},
): DetectiveRunState {
  const detectiveCase = buildCheeseCase();
  const square = detectiveCase.locations.find((place) => place.id === 'market-square');
  if (square !== undefined) {
    square.parts = [
      {
        id: 'fountain-edge',
        name: 'The fountain edge',
        obstacle,
        holds: 'cellar-key',
        inQuickLook: true,
        requiresLead: null,
        fallback: { kind: 'ask', suspectId: 'baker' },
      },
    ];
  }
  const hero = buildHero();
  const run = createDetectiveRun({
    hero: {
      ...hero,
      skills: {
        ...hero.skills,
        // A point more of social is a point less of reasoning, so the hero stays within their points.
        social: options.social ?? hero.skills.social,
        reasoning: hero.skills.reasoning - ((options.social ?? hero.skills.social) - hero.skills.social),
        contacts: options.contacts ?? hero.skills.contacts,
      },
    },
    traits: options.traits ?? [],
    case: DetectiveCaseSchema.parse(detectiveCase),
    seed: 'risk',
    rngState: 1,
    locale: 'en',
  });
  const equipped = { ...run, kit: [...kit], rulesetVersion: options.ruleset ?? RISK_RULESET_VERSION };
  const looked = resolveIntent(equipped, { kind: 'look' }, createRng(3));
  if (!looked.ok) throw new Error('The look was refused.');
  return looked.run;
}

function search(run: DetectiveRunState, rng: Rng): Extract<Resolved, { ok: true }> {
  const resolution = resolveIntent(run, { kind: 'search', partId: 'fountain-edge' }, rng);
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

/** What a search cost beyond its time. */
function consequencesOf(done: Extract<Resolved, { ok: true }>): readonly string[] {
  return done.outcome.kind === 'search' ? done.outcome.consequences : [];
}

const PICKS = [owned('phone'), owned('picks')];
const coolHead = DETECTIVE_TRAITS.filter(({ id }) => id === 'cool-head');

describe('the risk of a tool that is not lawful', () => {
  it('goes unseen on a good die, and the hero keeps their name and their nerves', () => {
    const run = runWith('locked', PICKS);

    const done = search(run, dice(15, 10));

    expect(done.outcome).toMatchObject({ foundClueIds: ['cellar-key'], minutes: PART_SEARCH_MINUTES });
    expect(done.outcome).not.toHaveProperty('detainedMinutes');
    expect(done.run.reputation).toBe(MAX_REPUTATION);
    expect(done.run.condition.nerves).toBe(run.condition.nerves);
    expect(consequencesOf(done)).toEqual([]);
  });

  it('costs a point of name and a point of nerves when the hero is seen, and the clue is still theirs', () => {
    const run = runWith('locked', PICKS);

    const done = search(run, dice(15, DETAINED_BELOW));

    expect(UNSEEN_AT).toBeGreaterThan(DETAINED_BELOW);
    expect(done.outcome).toMatchObject({
      foundClueIds: ['cellar-key'],
      consequences: ['spotted', 'reputation-lost', 'nerves-lost'],
      minutes: PART_SEARCH_MINUTES,
    });
    expect(done.run.reputation).toBe(MAX_REPUTATION - 1);
    expect(done.run.condition.nerves).toBe(run.condition.nerves - 1);
  });

  it('gets the hero detained when the die is bad, for hours, and the hours are on the clock', () => {
    const run = runWith('locked', PICKS, { contacts: 2 });
    const hours = detentionMinutes(MAX_REPUTATION, 2);

    const done = search(run, dice(15, 2));

    expect(hours).toBe(DETENTION_MINUTES - 12 * MAX_REPUTATION - 10 * 2);
    expect(done.outcome).toMatchObject({
      consequences: ['spotted', 'reputation-lost', 'nerves-lost', 'detained'],
      detainedMinutes: hours,
      minutes: PART_SEARCH_MINUTES + hours,
    });
    expect(done.run.clock.minute).toBe(run.clock.minute + PART_SEARCH_MINUTES + hours);
  });

  it('risks the same when the tool does not get through, and the time adds up', () => {
    const run = runWith('locked', PICKS);

    const done = search(run, dice(2, 2));

    expect(done.outcome).toMatchObject({
      foundClueIds: [],
      tool: { cleared: false },
      consequences: ['time-lost', 'nerves-lost', 'spotted', 'reputation-lost', 'detained'],
    });
    const { minutes, detainedMinutes } = done.outcome as { minutes: number; detainedMinutes: number };
    expect(minutes).toBeGreaterThan(detainedMinutes);
    expect(detainedMinutes).toBe(detentionMinutes(MAX_REPUTATION, buildHero().skills.contacts));
  });

  it('is not run by a tool that is lawful, which asks for no die', () => {
    const lawful = runWith('trace', [owned('phone'), owned('magnifier')]);
    const rng = dice(15, 2);

    const done = search(lawful, rng);

    expect(consequencesOf(done)).toEqual([]);
    expect(done.run.reputation).toBe(MAX_REPUTATION);
    // The second roll of the seed was the clue's own, not a risk: the run is where the old ruleset puts it.
    const before = search(
      runWith('trace', [owned('phone'), owned('magnifier')], { ruleset: RISK_RULESET_VERSION - 1 }),
      dice(15, 2),
    );
    expect(done.run.rngState).toBe(before.run.rngState);
  });

  it('is left out of a run of the ruleset before it', () => {
    const old = runWith('locked', PICKS, { ruleset: RISK_RULESET_VERSION - 1 });

    const done = search(old, dice(15, 2));

    expect(consequencesOf(done)).toEqual([]);
    expect(done.run.reputation).toBe(MAX_REPUTATION);
  });

  it('is eased by the hero’s own social skill', () => {
    const plain = search(runWith('locked', PICKS), dice(15, 5));
    const social = search(runWith('locked', PICKS, { social: 2 }), dice(15, 5));

    expect(consequencesOf(plain)).toContain('spotted');
    expect(consequencesOf(social)).toEqual([]);
  });
});

describe('a calm head', () => {
  it('offsets the risk, and shows itself when it does, and only then', () => {
    const calm = runWith('locked', PICKS, { traits: coolHead });
    const plain = runWith('locked', PICKS);

    const withTrait = search(calm, dice(15, 4));
    const without = search(plain, dice(15, 4));

    expect(consequencesOf(without)).toContain('spotted');
    expect(consequencesOf(withTrait)).toEqual([]);
    expect(withTrait.revealed.map(({ traitId }) => traitId)).toEqual(['cool-head']);
    expect(without.revealed).toEqual([]);
    const lawful = search(
      runWith('trace', [owned('phone'), owned('magnifier')], { traits: coolHead }),
      dice(15, 4),
    );
    expect(lawful.revealed).toEqual([]);
  });
});

describe('a detention', () => {
  it('is shorter for a hero with a good name and good contacts, and never shorter than an hour', () => {
    expect(detentionMinutes(0, 0)).toBe(DETENTION_MINUTES);
    expect(detentionMinutes(MAX_REPUTATION, 0)).toBeLessThan(detentionMinutes(5, 0));
    expect(detentionMinutes(5, 5)).toBeLessThan(detentionMinutes(5, 0));
    expect(detentionMinutes(MAX_REPUTATION, 5)).toBeGreaterThanOrEqual(MIN_DETENTION_MINUTES);
    expect(detentionMinutes(MAX_REPUTATION, 30)).toBe(MIN_DETENTION_MINUTES);
  });
});

describe('over many seeds', () => {
  it('only ever costs, never pays, and a detention is a spotting with hours', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const run = runWith('locked', PICKS);
      const done = search(run, createRng(seed));
      if (done.outcome.kind !== 'search') throw new Error('Not a search.');
      const { consequences, minutes, detainedMinutes } = done.outcome;

      expect(done.run.reputation).toBeLessThanOrEqual(run.reputation);
      expect(consequences.includes('detained')).toBe(detainedMinutes !== undefined);
      if (detainedMinutes !== undefined) {
        expect(consequences).toContain('spotted');
        expect(detainedMinutes).toBeGreaterThanOrEqual(MIN_DETENTION_MINUTES);
        expect(detainedMinutes).toBeLessThanOrEqual(DETENTION_MINUTES);
        expect(minutes).toBeGreaterThan(detainedMinutes);
      }
      if (consequences.includes('spotted')) expect(done.run.reputation).toBeLessThan(run.reputation);
    }
  });
});

describe('a hero with nothing left to lose', () => {
  const seenWith = (edit: (run: DetectiveRunState) => DetectiveRunState) => {
    const run = edit(runWith('locked', PICKS));
    return unlawfulRisk(run, dice(2, 2), run.case.locations[0]!);
  };

  it('is seen all the same, and is told only what was paid', () => {
    const broke = seenWith((run) => ({ ...run, reputation: 0 }));
    const frayed = seenWith((run) => ({ ...run, condition: { ...run.condition, nerves: 0 } }));

    expect(broke.consequences).toEqual(['spotted', 'nerves-lost', 'detained']);
    expect(frayed.consequences).toEqual(['spotted', 'reputation-lost', 'detained']);
  });
});
