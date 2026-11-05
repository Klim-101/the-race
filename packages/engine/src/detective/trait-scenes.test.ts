// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import type { Trait } from '../traits.js';
import { resolveIntent, type Resolution } from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { DetectiveRunStateSchema, createDetectiveRun, type DetectiveRunState } from './run-state.js';
import { actingReveals, lockOutReveals } from './trait-reveal.js';
import { PLACE_BOUND_TRIGGERS, drawTraitScenes, locationScene, type TraitScene } from './trait-scenes.js';
import { DETECTIVE_TRAITS } from './traits.js';

const trait = (id: string): Trait => {
  const found = DETECTIVE_TRAITS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No trait ${id}`);
  return found;
};

const caseOf = (edit?: (detectiveCase: DetectiveCase) => void): DetectiveCase => {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  edit?.(detectiveCase);
  return detectiveCase;
};

const runOf = (
  traits: readonly Trait[],
  detectiveCase: DetectiveCase = caseOf(),
  seed = 'scenes',
): DetectiveRunState =>
  createDetectiveRun({ hero: buildHero(), traits, case: detectiveCase, seed, rngState: 1, locale: 'en' });

/** The same run with the scenes the test wants, whatever the dice drew. */
const withScenes = (run: DetectiveRunState, traitScenes: TraitScene[]): DetectiveRunState => ({
  ...run,
  traitScenes,
});

function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

function ok(resolution: Resolution): Extract<Resolution, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

const PLACE_BOUND = DETECTIVE_TRAITS.filter(({ trigger }) =>
  (PLACE_BOUND_TRIGGERS as readonly string[]).includes(trigger),
);

describe('drawTraitScenes', () => {
  it('gives a scene only to a trait that a place has to bring out', () => {
    const traits = ['night-owl', 'debtor', 'people-reader', 'photographic-memory', 'cool-head'].map(trait);

    expect(drawTraitScenes(caseOf(), traits, 'seed')).toEqual([]);
    expect(PLACE_BOUND.map(({ id }) => id).sort()).toEqual(
      [
        'claustrophobe',
        'ex-hacker',
        'former-accountant',
        'old-enemy-in-the-police',
        'sloppy-with-paperwork',
        'stage-fright',
        'showman',
        'technophobe',
        'well-connected',
      ].sort(),
    );
  });

  it('draws one scene a trigger, the same ones for the same seed', () => {
    const traits = [trait('ex-hacker'), trait('technophobe'), trait('claustrophobe')];
    const first = drawTraitScenes(caseOf(), traits, 'seed');

    expect(first.map(({ trigger }) => trigger)).toEqual(['digital-evidence', 'confined-space']);
    expect(drawTraitScenes(caseOf(), traits, 'seed')).toEqual(first);
  });

  it('puts a scene in a place that is not the start, not closed by an event, and is open to walk into', () => {
    const detectiveCase = caseOf((c) => {
      c.locations.push({
        id: 'harbour',
        name: 'Harbour',
        description: 'Gulls.',
        connections: ['market-square'],
        access: { kind: 'open' },
        exposure: 'outdoor',
        situations: [],
      });
      c.clock.worldEvents.push({
        day: 2,
        description: 'The harbour is shut.',
        effect: { kind: 'location-closes', locationId: 'harbour' },
      });
    });

    for (let seed = 0; seed < 40; seed += 1) {
      const [scene] = drawTraitScenes(detectiveCase, [trait('claustrophobe')], `seed-${String(seed)}`);
      // Of the four places, the start, the harbour (closed) and the two that need a clue or a roll are out.
      expect(scene?.locationId).toBe('cheese-stall');
    }
  });

  it('falls back to a place that needs a clue or a roll, then to any place that stays open', () => {
    const gated = caseOf((c) => {
      const stall = c.locations.find(({ id }) => id === 'cheese-stall');
      if (stall) stall.access = { kind: 'clue', clueId: 'cellar-key' };
    });
    const seen = new Set<string | undefined>();
    for (let seed = 0; seed < 60; seed += 1) {
      seen.add(drawTraitScenes(gated, [trait('stage-fright')], `s${String(seed)}`)[0]?.locationId);
    }
    expect([...seen].sort()).toEqual(['cheese-stall', 'mayor-office', 'storage-cellar']);

    const shut = caseOf((c) => {
      c.clock.worldEvents.push(
        ...c.locations
          .filter(({ id }) => id !== 'market-square')
          .map(({ id }) => ({
            day: 2,
            description: 'Closed.',
            effect: { kind: 'location-closes' as const, locationId: id },
          })),
      );
    });
    expect(drawTraitScenes(shut, [trait('claustrophobe')], 'seed')).toEqual([
      { locationId: 'market-square', trigger: 'confined-space' },
    ]);
  });

  it('draws nothing when every place is shut, rather than failing', () => {
    const allShut = caseOf((c) => {
      c.clock.worldEvents.push(
        ...c.locations.map(({ id }) => ({
          day: 2,
          description: 'Closed.',
          effect: { kind: 'location-closes' as const, locationId: id },
        })),
      );
    });

    expect(drawTraitScenes(allShut, [trait('claustrophobe')], 'seed')).toEqual([]);
  });

  it('is not moved by the run: the run keeps the rolls it had', () => {
    const plain = runOf([trait('people-reader')]);
    const bound = runOf([trait('claustrophobe')]);

    expect(plain.traitScenes).toEqual([]);
    expect(bound.rngState).toBe(plain.rngState);
  });
});

describe('locationScene', () => {
  const place = { id: 'cheese-stall', situations: ['crowd' as const] };

  it('is the place as the case wrote it when the engine added nothing, and for any other place', () => {
    expect(locationScene({ rulesetVersion: 25, traitScenes: [] }, place)).toBe(place.situations);
    expect(
      locationScene(
        { rulesetVersion: 25, traitScenes: [{ locationId: 'elsewhere', trigger: 'confined-space' }] },
        place,
      ),
    ).toBe(place.situations);
  });

  it('adds the scene of the run to the place, once', () => {
    const scenes: TraitScene[] = [
      { locationId: 'cheese-stall', trigger: 'confined-space' },
      { locationId: 'cheese-stall', trigger: 'crowd' },
    ];

    expect(locationScene({ rulesetVersion: 25, traitScenes: scenes }, place)).toEqual([
      'crowd',
      'confined-space',
    ]);
  });
});

describe('every trait of the catalogue that a place brings out has a place to act in', () => {
  const SEEDS = Array.from({ length: 30 }, (_, index) => `seed-${String(index)}`);

  for (const bound of PLACE_BOUND) {
    it(`${bound.id} acts in the place the run drew for it`, () => {
      for (const seed of SEEDS) {
        const run = runOf([bound], caseOf(), seed);
        const [scene] = run.traitScenes;
        const place = run.case.locations.find(({ id }) => id === scene?.locationId);

        expect(run.traitScenes).toHaveLength(1);
        expect(place).toBeDefined();
        expect(place?.id).not.toBe(run.case.startLocationId);
        expect(scene?.trigger).toBe(bound.trigger);
        if (place === undefined) continue;

        const lockOut = bound.effects.some((effect) => effect.kind === 'lock-out');
        const skills = bound.effects.flatMap((effect) =>
          effect.kind === 'modifier' ? (effect.skills === 'all' ? ['reasoning'] : effect.skills) : [],
        );
        const revealed = lockOut
          ? lockOutReveals(run, place.id)
          : skills.flatMap((skill) => actingReveals(run, locationScene(run, place), skill));
        expect(revealed.map(({ traitId }) => traitId)).toContain(bound.id);
      }
    });
  }
});

const stallScene = (run: DetectiveRunState): DetectiveRunState =>
  withScenes({ ...run, locationId: 'cheese-stall' }, [
    { locationId: 'cheese-stall', trigger: 'confined-space' },
  ]);

describe('the hero plays to the place and the trait shows itself', () => {
  const stall = (run: DetectiveRunState, trigger: TraitScene['trigger']): DetectiveRunState =>
    withScenes({ ...run, locationId: 'cheese-stall' }, [{ locationId: 'cheese-stall', trigger }]);

  it('in a search, by the scene the engine added to the place', () => {
    const run = stall(runOf([trait('claustrophobe')]), 'confined-space');
    const search = ok(resolveIntent(run, { kind: 'search' }, dice(10)));

    expect(search.revealed).toEqual([{ traitId: 'claustrophobe', polarity: 'negative', reason: 'modifier' }]);
    expect(search.run.revealedTraitIds).toEqual(['claustrophobe']);
  });

  it('in a question put to the locals', () => {
    const run = stall(runOf([trait('well-connected')]), 'high-society');
    const asked = ok(resolveIntent(run, { kind: 'ask' }, dice(10)));

    expect(asked.revealed).toEqual([{ traitId: 'well-connected', polarity: 'positive', reason: 'modifier' }]);
  });

  it('in a talk with a suspect who is in the place', () => {
    const run = withScenes(runOf([trait('stage-fright')]), [
      { locationId: 'market-square', trigger: 'crowd' },
    ]);
    const talk = ok(
      resolveIntent(
        run,
        { kind: 'interrogate', suspectId: 'rival', approach: 'social', clueIds: [] },
        dice(10),
      ),
    );

    expect(talk.revealed?.map(({ traitId }) => traitId)).toEqual(['stage-fright']);
  });

  it('as a source the old enemy shuts, though no clue of the case came from it', () => {
    const run = stall(runOf([trait('old-enemy-in-the-police')]), 'police-contact');
    const search = ok(resolveIntent(run, { kind: 'search' }, dice(10)));

    expect(search.revealed).toEqual([
      { traitId: 'old-enemy-in-the-police', polarity: 'negative', reason: 'lock-out' },
    ]);
  });

  it('not elsewhere: a place without the scene leaves the trait hidden', () => {
    const run = withScenes({ ...runOf([trait('claustrophobe')]), locationId: 'cheese-stall' }, [
      { locationId: 'mayor-office', trigger: 'confined-space' },
    ]);

    expect(ok(resolveIntent(run, { kind: 'search' }, dice(10))).revealed).toEqual([]);
  });
});

describe('a run of an older ruleset plays as before', () => {
  it('ignores the scenes in its state, so that no turn of it changes', () => {
    const run = { ...runOf([trait('claustrophobe')]), rulesetVersion: 24 };
    const search = ok(resolveIntent(stallScene(run), { kind: 'search' }, dice(10)));

    expect(search.revealed).toEqual([]);
  });

  it('has no scene added to any place', () => {
    const run = runOf([trait('claustrophobe')]);
    const { traitScenes, ...saved } = JSON.parse(JSON.stringify(run)) as DetectiveRunState;
    expect(traitScenes).toHaveLength(1);

    const old = DetectiveRunStateSchema.parse({ ...saved, rulesetVersion: 24 });

    expect(old.traitScenes).toEqual([]);
    const place = old.case.locations.find(({ id }) => id === 'cheese-stall');
    expect(place && locationScene(old, place)).toEqual(place?.situations);
  });

  it('refuses a save whose scene is in a place that is not in the case', () => {
    const run = runOf([trait('claustrophobe')]);

    expect(() =>
      DetectiveRunStateSchema.parse({
        ...(JSON.parse(JSON.stringify(run)) as DetectiveRunState),
        traitScenes: [{ locationId: 'nowhere', trigger: 'confined-space' }],
      }),
    ).toThrow(/does not exist in this run/);
  });
});
