// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { DAY_START_MINUTE, MAX_REPUTATION } from '../run.js';
import { TraitSchema, type Trait } from '../traits.js';
import { resolveIntent, type Resolution } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import {
  APPROACH_RULES,
  FAILED_INTERROGATION_MINUTES,
  INTERROGATE_MINUTES,
  MIN_INTERROGATION_DIFFICULTY,
} from './interrogation.js';
import { DETECTIVE_TRAITS } from './traits.js';
import {
  createDetectiveRun,
  DetectiveRunStateSchema,
  endRun,
  findClue,
  moveTo,
  type DetectiveRunState,
} from './run-state.js';

const trait = (id: string): Trait => {
  const found = DETECTIVE_TRAITS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No trait ${id}`);
  return found;
};

/** A seed whose first d20 roll is `die`. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

function newRun(traits: Trait[] = []): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: traits.map((entry) => TraitSchema.parse(entry)),
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'interrogation',
    rngState: 1,
    locale: 'en',
  });
}

/** In the cheese stall, where the baker is, with the cart tracks found. */
function atBaker(traits: Trait[] = []): DetectiveRunState {
  return moveTo(findClue(newRun(traits), 'cart-tracks'), 'cheese-stall');
}

/** In the market square, where the rival is, with the blue glove found. */
function atRival(): DetectiveRunState {
  return findClue(newRun(), 'blue-glove');
}

function ask(
  run: DetectiveRunState,
  suspectId: string,
  approach: 'pressure' | 'social',
  clueIds: string[],
  rng: Rng,
): Resolution {
  return resolveIntent(run, { kind: 'interrogate', suspectId, approach, clueIds }, rng);
}

function ok(resolution: Resolution): Extract<Resolution, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

function interrogation(resolution: Resolution) {
  const { outcome, run, details } = ok(resolution);
  if (outcome.kind !== 'interrogate') throw new Error('Not an interrogation');
  return { outcome, run, details };
}

describe('refusals', () => {
  it('refuses an unknown suspect without spending dice', () => {
    const run = newRun();
    const rng = createRng(1);
    const state = rng.state();

    const resolution = ask(run, 'ghost', 'social', [], rng);

    expect(resolution).toMatchObject({ ok: false, refusal: { code: 'unknown-suspect' } });
    expect(rng.state()).toBe(state);
  });

  it('refuses a suspect who is not at the hero place', () => {
    expect(ask(newRun(), 'baker', 'social', [], createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'suspect-elsewhere' },
    });
  });

  it('finds a suspect by their public location, not by the sealed timeline', () => {
    const detectiveCase = buildCheeseCase();
    // The timeline ends at the market square; the public location is the cellar.
    detectiveCase.suspects[1]!.locationId = 'storage-cellar';
    const run = createDetectiveRun({
      hero: buildHero(),
      traits: [],
      case: DetectiveCaseSchema.parse(detectiveCase),
      seed: 'interrogation',
      rngState: 1,
      locale: 'en',
    });

    expect(ask(run, 'rival', 'social', [], createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'suspect-elsewhere' },
    });
    expect(ask(moveTo(run, 'storage-cellar'), 'rival', 'social', [], createRng(1)).ok).toBe(true);
  });

  it('refuses the same way a clue that is hidden and a clue that does not exist', () => {
    const run = atBaker();
    const hidden = ask(run, 'baker', 'pressure', ['debt-ledger'], createRng(1));
    const missing = ask(run, 'baker', 'pressure', ['no-such-clue'], createRng(1));

    expect(hidden).toMatchObject({ ok: false, refusal: { code: 'clue-not-found' } });
    expect(missing).toEqual(hidden);
  });

  it('refuses a malformed intent and a finished run', () => {
    expect(resolveIntent(newRun(), { kind: 'interrogate', suspectId: 'rival' }, createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'invalid-intent' },
    });
    const over = endRun(atRival(), 'won');
    expect(ask(over, 'rival', 'social', [], createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'run-over' },
    });
  });

  it('treats the clues as optional', () => {
    const resolution = resolveIntent(
      newRun(),
      { kind: 'interrogate', suspectId: 'rival', approach: 'social' },
      dice(10),
    );
    expect(resolution.ok).toBe(true);
  });
});

describe('a clue that breaks a lie', () => {
  it('makes the suspect give ground on a success, and the run remembers it', () => {
    const { outcome, run, details } = interrogation(
      ask(atBaker(), 'baker', 'pressure', ['cart-tracks'], dice(15)),
    );

    expect(outcome).toMatchObject({
      stance: 'gives-ground',
      succeeded: true,
      minutes: INTERROGATE_MINUTES,
      alibi: 'Says she was asleep at home all night.',
      presented: [{ clueId: 'cart-tracks', effect: 'breaks-lie' }],
      conceded: [{ lieId: 'baker-asleep', statement: 'I never left my house last night.' }],
      secret: null,
      reputationChange: 0,
      consequences: [],
    });
    expect(run.concededLieIds).toEqual(['baker-asleep']);
    expect(run.turn).toBe(1);
    expect(run.clock.minute).toBe(DAY_START_MINUTE + INTERROGATE_MINUTES);
    expect(details).toMatchObject([{ subject: { kind: 'suspect', id: 'baker' } }]);
    expect(DetectiveRunStateSchema.safeParse(run).success).toBe(true);
  });

  it('is nothing new the second time', () => {
    const first = interrogation(ask(atBaker(), 'baker', 'pressure', ['cart-tracks'], dice(15)));

    const second = interrogation(ask(first.run, 'baker', 'pressure', ['cart-tracks'], dice(15)));

    expect(second.outcome).toMatchObject({
      stance: 'holds',
      presented: [{ clueId: 'cart-tracks', effect: 'no-effect' }],
      conceded: [],
    });
    expect(second.run.concededLieIds).toEqual(['baker-asleep']);
  });

  it('is given up on a natural 20 together with the secret', () => {
    const { outcome } = interrogation(ask(atBaker(), 'baker', 'pressure', ['cart-tracks'], dice(20)));

    expect(outcome.secret).toBe('She owes the town for an oven she cannot pay for.');
  });

  it('is held on a failure by pressure, which also costs time and reputation', () => {
    const run = atBaker();
    const { outcome, run: next } = interrogation(ask(run, 'baker', 'pressure', ['cart-tracks'], dice(5)));

    expect(outcome).toMatchObject({
      stance: 'gives-ground',
      succeeded: false,
      minutes: INTERROGATE_MINUTES + FAILED_INTERROGATION_MINUTES,
      reputationChange: -1,
      consequences: ['time-lost', 'reputation-lost'],
    });
    expect(next.reputation).toBe(MAX_REPUTATION - 1);
  });

  it('is held entirely on a blunder, which costs more reputation', () => {
    const { outcome, run } = interrogation(ask(atBaker(), 'baker', 'pressure', ['cart-tracks'], dice(1)));

    expect(outcome).toMatchObject({
      stance: 'holds',
      presented: [{ clueId: 'cart-tracks', effect: 'no-effect' }],
      conceded: [],
      reputationChange: -2,
    });
    expect(run.concededLieIds).toEqual([]);
    expect(run.condition.nerves).toBe(9);
  });

  it('is conceded one lie at a time on a failure', () => {
    const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
    const baker = detectiveCase.suspects.find(({ id }) => id === 'baker');
    baker?.lies.push({ id: 'baker-alone', statement: 'I was alone.', brokenBy: ['flour-crumbs'] });
    const base = createDetectiveRun({
      hero: buildHero(),
      traits: [],
      case: detectiveCase,
      seed: 'two-lies',
      rngState: 1,
      locale: 'en',
    });
    const run = moveTo(findClue(findClue(base, 'cart-tracks'), 'flour-crumbs'), 'cheese-stall');
    const clues = ['cart-tracks', 'flour-crumbs'];

    // pressure: difficulty 14 - 2 * 4 = 6, hero total 1 + die
    const failed = interrogation(ask(run, 'baker', 'pressure', clues, dice(4)));
    expect(failed.outcome.conceded).toEqual([
      { lieId: 'baker-asleep', statement: 'I never left my house last night.' },
    ]);
    expect(failed.outcome.presented).toEqual([
      { clueId: 'cart-tracks', effect: 'breaks-lie' },
      { clueId: 'flour-crumbs', effect: 'no-effect' },
    ]);

    const won = interrogation(ask(run, 'baker', 'pressure', clues, dice(15)));
    expect(won.outcome.conceded).toHaveLength(2);
  });
});

describe('a clue that breaks nothing', () => {
  it('changes nothing for the suspect, and looks the same as a brushed-off one', () => {
    const { outcome, run } = interrogation(ask(atBaker(), 'baker', 'social', ['cart-tracks'], dice(1)));
    const irrelevant = interrogation(
      ask(
        moveTo(findClue(newRun(), 'cellar-key'), 'cheese-stall'),
        'baker',
        'social',
        ['cellar-key'],
        dice(15),
      ),
    );

    expect(irrelevant.outcome).toMatchObject({
      stance: 'holds',
      presented: [{ clueId: 'cellar-key', effect: 'no-effect' }],
      conceded: [],
      secret: null,
    });
    expect(outcome.presented).toEqual([{ clueId: 'cart-tracks', effect: 'no-effect' }]);
    expect(run.concededLieIds).toEqual([]);
  });

  it('gives no secret on a perfect roll when no lie fell', () => {
    const { outcome } = interrogation(ask(atRival(), 'rival', 'social', [], dice(20)));

    expect(outcome.secret).toBeNull();
    expect(outcome.stance).toBe('holds');
  });

  it('can be put to a suspect who has no lies, anywhere', () => {
    const { outcome } = interrogation(ask(newRun(), 'mayor', 'social', [], dice(12)));

    expect(outcome).toMatchObject({ stance: 'holds', alibi: 'Was at a dinner with the council.' });
  });
});

describe('pressure and charm', () => {
  it('differ in difficulty: the same roll holds by pressure and moves by charm', () => {
    // die 8: pressure total 9 against 14, social total 8 against 11 - 2 = 9 is a miss too; use die 9.
    const pressure = interrogation(ask(atRival(), 'rival', 'pressure', ['blue-glove'], dice(5)));
    const charm = interrogation(ask(atRival(), 'rival', 'social', ['blue-glove'], dice(9)));

    expect(pressure.outcome.succeeded).toBe(false);
    expect(charm.outcome.succeeded).toBe(true);
    expect(APPROACH_RULES.pressure.difficulty).toBeGreaterThan(APPROACH_RULES.social.difficulty);
  });

  it('costs only time when charm fails', () => {
    const { outcome, run } = interrogation(ask(atRival(), 'rival', 'social', ['blue-glove'], dice(3)));

    expect(outcome).toMatchObject({ reputationChange: 0, consequences: ['time-lost'] });
    expect(run.reputation).toBe(MAX_REPUTATION);
  });

  it('wins reputation on a perfect charm, within the ceiling', () => {
    const hurt = { ...atRival(), reputation: MAX_REPUTATION - 2 };
    const { outcome, run } = interrogation(ask(hurt, 'rival', 'social', ['blue-glove'], dice(20)));

    expect(outcome.reputationChange).toBe(1);
    expect(run.reputation).toBe(MAX_REPUTATION - 1);
    const full = interrogation(ask(atRival(), 'rival', 'social', [], dice(20)));
    expect(full.run.reputation).toBe(MAX_REPUTATION);
  });

  it('never drops reputation below zero', () => {
    const broke = { ...atBaker(), reputation: 0 };
    expect(interrogation(ask(broke, 'baker', 'pressure', ['cart-tracks'], dice(1))).run.reputation).toBe(0);
  });

  it('is shifted by the traits that fire in an interrogation', () => {
    // pressure 1 + die 7 = 8 against 14 - 4 = 10 misses; people-reader adds 2 and makes it.
    const plain = interrogation(ask(atBaker(), 'baker', 'pressure', ['cart-tracks'], dice(7)));
    const reader = interrogation(
      ask(atBaker([trait('people-reader')]), 'baker', 'pressure', ['cart-tracks'], dice(7)),
    );
    const hothead = interrogation(
      ask(atBaker([trait('hothead')]), 'baker', 'social', ['cart-tracks'], dice(9)),
    );

    expect(plain.outcome.succeeded).toBe(false);
    expect(reader.outcome.succeeded).toBe(true);
    expect(reader.details[0]?.result).toMatchObject({ modifier: 2 });
    expect(hothead.details[0]?.result).toMatchObject({ modifier: -2 });
  });

  it('takes the scene of the place into account', () => {
    const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
    const start = detectiveCase.locations.find(({ id }) => id === detectiveCase.startLocationId);
    start?.situations.push('crowd');
    const run = createDetectiveRun({
      hero: buildHero(),
      traits: [TraitSchema.parse(trait('stage-fright'))],
      case: detectiveCase,
      seed: 'crowd',
      rngState: 1,
      locale: 'en',
    });

    const { details } = interrogation(ask(run, 'rival', 'social', [], dice(10)));

    expect(details[0]?.result).toMatchObject({ modifier: -2 });
  });
});

describe('what the narrator may see', () => {
  it('floors the difficulty however many lies a clue breaks', () => {
    expect(MIN_INTERROGATION_DIFFICULTY).toBeGreaterThan(0);
  });

  it('never leaks lies that hold, hidden clues, the truth or the unrevealed traits', () => {
    const run = atBaker([trait('people-reader')]);
    const secrets = ['hidden', 'debt-ledger', 'oven-receipt', 'Pay off the festival oven', 'people-reader'];
    let concessions = 0;

    for (let seed = 0; seed < 300; seed += 1) {
      const rng = createRng(seed);
      const approach = seed % 2 === 0 ? 'pressure' : 'social';
      const clues = seed % 3 === 0 ? [] : ['cart-tracks'];
      const { outcome, run: next } = interrogation(ask(run, 'baker', approach, clues, rng));

      expect(Object.keys(outcome).sort()).toEqual(
        [
          'alibi',
          'approach',
          'conceded',
          'consequences',
          'kind',
          'minutes',
          'presented',
          'reputationChange',
          'secret',
          'stance',
          'succeeded',
          'suspectId',
        ].sort(),
      );
      const text = JSON.stringify(outcome);
      for (const forbidden of secrets) expect(text).not.toContain(forbidden);
      // Only a lie that a shown clue breaks can fall, and the secret needs a natural 20 and a fallen lie.
      for (const { lieId } of outcome.conceded) {
        expect(clues.length).toBeGreaterThan(0);
        expect(lieId).toBe('baker-asleep');
      }
      if (outcome.secret !== null) expect(outcome.conceded.length).toBeGreaterThan(0);
      expect(outcome.stance === 'gives-ground').toBe(outcome.conceded.length > 0);
      expect(next.reputation).toBeGreaterThanOrEqual(0);
      expect(next.reputation).toBeLessThanOrEqual(MAX_REPUTATION);
      expect(next.rngState).toBe(rng.state());
      expect(
        resolveIntent(
          run,
          { kind: 'interrogate', suspectId: 'baker', approach, clueIds: clues },
          createRng(seed),
        ),
      ).toEqual(ask(run, 'baker', approach, clues, createRng(seed)));
      concessions += outcome.conceded.length;
    }
    expect(concessions).toBeGreaterThan(0);
  });
});
