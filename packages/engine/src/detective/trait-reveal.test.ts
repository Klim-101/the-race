// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import type { Trait } from '../traits.js';
import { resolveIntent, type Resolution } from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { createDetectiveRun, moveTo, type DetectiveRunState } from './run-state.js';
import {
  DEBT_COLLECTOR_MINUTES,
  NIGHT_FROM_MINUTE,
  TRAIT_REVEAL_RULESET_VERSION,
  applyReveals,
  sceneSituations,
} from './trait-reveal.js';
import { DETECTIVE_TRAITS } from './traits.js';

const POLARITY = {
  'people-reader': 'positive',
  claustrophobe: 'negative',
  'photographic-memory': 'positive',
  'old-enemy-in-the-police': 'negative',
  debtor: 'negative',
  'night-owl': 'positive',
} as const;

/** A seed whose first d20 roll is `die`, so that a test can choose how a check goes. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

const trait = (id: string): Trait => {
  const found = DETECTIVE_TRAITS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No trait ${id}`);
  return found;
};

function runOf(traitIds: string[], edit?: (detectiveCase: DetectiveCase) => void): DetectiveRunState {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  edit?.(detectiveCase);
  return createDetectiveRun({
    hero: buildHero(),
    traits: traitIds.map(trait),
    case: detectiveCase,
    seed: 'reveal',
    rngState: 1,
    locale: 'en',
  });
}

function ok(resolution: Resolution): Extract<Resolution, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

const talk = (run: DetectiveRunState, rng: Rng = createRng(3)) =>
  ok(resolveIntent(run, { kind: 'interrogate', suspectId: 'rival', approach: 'social', clueIds: [] }, rng));

describe('a hidden trait shows itself the first time it does something', () => {
  it('reveals a trait whose modifier moved a roll, and the view then shows it', () => {
    const turn = talk(runOf(['people-reader']));

    expect(turn.revealed).toEqual([
      { traitId: 'people-reader', polarity: POLARITY['people-reader'], reason: 'modifier' },
    ]);
    expect(turn.run.revealedTraitIds).toEqual(['people-reader']);
  });

  it('tells a trait once, however often it acts', () => {
    const first = talk(runOf(['people-reader']));
    const second = talk(first.run);

    expect(second.revealed).toEqual([]);
    expect(second.run.revealedTraitIds).toEqual(['people-reader']);
  });

  it('leaves a trait hidden while its trigger is not in the scene or its skill is not rolled', () => {
    expect(talk(runOf(['claustrophobe'])).revealed).toEqual([]);
    // A people reader helps in a talk; a search rolls perception, which the trait does not touch.
    const stall = moveTo(runOf(['people-reader']), 'cheese-stall');
    expect(ok(resolveIntent(stall, { kind: 'search' }, dice(10))).revealed).toEqual([]);
  });

  it('reveals the trait that a place brings out: a search in a confined space', () => {
    const cramped = runOf(['claustrophobe'], (detectiveCase) => {
      const stall = detectiveCase.locations.find(({ id }) => id === 'cheese-stall');
      if (stall) stall.situations = ['confined-space'];
    });
    const search = ok(resolveIntent(moveTo(cramped, 'cheese-stall'), { kind: 'search' }, dice(10)));

    expect(search.revealed).toEqual([
      { traitId: 'claustrophobe', polarity: POLARITY.claustrophobe, reason: 'modifier' },
    ]);
  });

  it('reveals the trait that moved the roll to get through a door', () => {
    const cramped = runOf(['claustrophobe'], (detectiveCase) => {
      const cellar = detectiveCase.locations.find(({ id }) => id === 'storage-cellar');
      if (cellar) {
        cellar.access = { kind: 'skill', check: { skill: 'perception', difficulty: 5 } };
        cellar.situations = ['confined-space'];
      }
    });
    const move = ok(resolveIntent(cramped, { kind: 'move', locationId: 'storage-cellar' }, dice(10)));

    expect(move.revealed).toEqual([
      { traitId: 'claustrophobe', polarity: POLARITY.claustrophobe, reason: 'modifier' },
    ]);
  });

  it('reveals a photographic memory when a second search finds a clue without a roll', () => {
    const stall = moveTo(runOf(['photographic-memory']), 'cheese-stall');
    const first = ok(resolveIntent(stall, { kind: 'search' }, dice(1)));
    expect(first.revealed).toEqual([]);

    const second = ok(resolveIntent(first.run, { kind: 'search' }, dice(1)));

    expect(second.outcome).toMatchObject({ kind: 'search' });
    expect(second.run.foundClueIds).toContain('flour-crumbs');
    expect(second.revealed).toEqual([
      { traitId: 'photographic-memory', polarity: POLARITY['photographic-memory'], reason: 'auto-discover' },
    ]);
  });

  it('does not reveal a photographic memory for a clue that lay in plain sight', () => {
    const office = moveTo(runOf(['photographic-memory']), 'mayor-office');
    const first = ok(resolveIntent(office, { kind: 'search' }, dice(20)));
    const second = ok(resolveIntent(first.run, { kind: 'search' }, dice(20)));

    expect(second.revealed).toEqual([]);
  });

  it('reveals the trait that shuts a source when the hero comes for a clue from it', () => {
    const police = (detectiveCase: DetectiveCase): void => {
      const clue = detectiveCase.clues.find(({ id }) => id === 'flour-crumbs');
      if (clue) clue.source = 'police-data';
    };
    const stall = moveTo(runOf(['old-enemy-in-the-police'], police), 'cheese-stall');
    const shut = [
      {
        traitId: 'old-enemy-in-the-police',
        polarity: POLARITY['old-enemy-in-the-police'],
        reason: 'lock-out',
      },
    ];

    expect(ok(resolveIntent(stall, { kind: 'search' }, dice(20))).revealed).toEqual(shut);
    expect(ok(resolveIntent(stall, { kind: 'look' }, dice(20))).revealed).toEqual(shut);
    // Nothing is shut out at a place whose clues are not from that source.
    const office = moveTo(runOf(['old-enemy-in-the-police'], police), 'mayor-office');
    expect(ok(resolveIntent(office, { kind: 'look' }, dice(20))).revealed).toEqual([]);
  });

  it('brings the debt collector on the second day: an hour lost, and the debtor shown', () => {
    const resting = ok(resolveIntent(runOf(['debtor']), { kind: 'rest' }, createRng(2)));

    expect(resting.revealed).toEqual([
      { traitId: 'debtor', polarity: POLARITY.debtor, reason: 'spawn-event' },
    ]);
    expect(resting.run.clock.day).toBe(2);
    const withoutDebt = ok(resolveIntent(runOf([]), { kind: 'rest' }, createRng(2)));
    expect(resting.run.clock.minute - withoutDebt.run.clock.minute).toBe(DEBT_COLLECTOR_MINUTES);
    // He comes once: the next night costs nothing more.
    const again = ok(resolveIntent(resting.run, { kind: 'rest' }, createRng(2)));
    expect(again.revealed).toEqual([]);
  });

  it('lets the evening count as night and any day after the first as the second day', () => {
    const run = runOf([]);
    const late = { ...run, clock: { day: 2, minute: NIGHT_FROM_MINUTE } };

    expect(sceneSituations(run, ['crowd'])).toEqual(['crowd']);
    expect(sceneSituations(late, ['crowd', 'night'])).toEqual(['crowd', 'night', 'second-day']);
    // A night owl is shown by a talk held late in the evening.
    const evening = { ...runOf(['night-owl']), clock: { day: 1, minute: NIGHT_FROM_MINUTE } };
    expect(talk(evening).revealed).toEqual([
      { traitId: 'night-owl', polarity: POLARITY['night-owl'], reason: 'modifier' },
    ]);
    expect(talk(runOf(['night-owl'])).revealed).toEqual([]);
  });

  it('plays a run of an older ruleset as it was: nothing revealed, no debt, no added situation', () => {
    const old = (traitIds: string[]): DetectiveRunState => ({
      ...runOf(traitIds),
      rulesetVersion: TRAIT_REVEAL_RULESET_VERSION - 1,
    });
    const run = { ...old(['debtor']), clock: { day: 2, minute: NIGHT_FROM_MINUTE } };

    expect(sceneSituations(run, [])).toEqual([]);
    expect(talk(old(['people-reader'])).revealed).toEqual([]);
    expect(talk(old(['people-reader'])).run.revealedTraitIds).toEqual([]);
    const rested = ok(resolveIntent(old(['debtor']), { kind: 'rest' }, createRng(2)));
    const plain = ok(resolveIntent(old([]), { kind: 'rest' }, createRng(2)));
    expect(rested.run.clock).toEqual(plain.run.clock);
  });

  it('applies the same trait only once when two scenes name it together', () => {
    const run = runOf(['people-reader']);
    const twice = [
      { traitId: 'people-reader', polarity: POLARITY['people-reader'], reason: 'modifier' },
      { traitId: 'people-reader', polarity: POLARITY['people-reader'], reason: 'modifier' },
    ] as const;

    expect(applyReveals(run, twice).revealed).toHaveLength(1);
    expect(applyReveals(run, []).run).toBe(run);
  });
});
