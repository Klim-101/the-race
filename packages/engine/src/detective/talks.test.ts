// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { resolveIntent, type Resolved } from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { APPROACH_RULES } from './interrogation.js';
import {
  HOSTILE_MINUTES,
  MAX_MOOD_STEP,
  SHAKEN_EASE,
  STALE_SHOWS_RULESET_VERSION,
  TALKS_RULESET_VERSION,
} from './suspect-mood.js';
import {
  addInsight,
  createDetectiveRun,
  findClue,
  moveTo,
  spendTime,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';

/** A seed whose first d20 roll is `die`. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

function ok(resolution: Resolved): Extract<Resolved, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

function interrogation(resolution: Resolved) {
  const carried = ok(resolution);
  if (carried.outcome.kind !== 'interrogate') throw new Error('Not a talk.');
  return { ...carried, outcome: carried.outcome };
}

type Approach = 'social' | 'pressure';

const ask = (
  run: DetectiveRunState,
  suspectId: string,
  approach: Approach,
  clueIds: string[],
  rng: Rng,
  insightIds: string[] = [],
): Resolved => resolveIntent(run, { kind: 'interrogate', suspectId, approach, clueIds, insightIds }, rng);

const refusalOf = (resolution: Resolved): string => {
  if (resolution.ok) throw new Error('Expected a refusal.');
  return resolution.refusal.code;
};

/**
 * The cheese case where the baker has a second lie, broken by the flour; the debt ledger is about the baker, the
 * blue glove about the rival, and a lie of the baker can also be broken by the conclusion about the motive.
 */
function buildTalkCase(edit: (detectiveCase: DetectiveCase) => void = () => undefined): DetectiveCase {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  const baker = detectiveCase.suspects.find(({ id }) => id === 'baker');
  baker?.lies.push(
    { id: 'baker-alone', statement: 'I was alone.', brokenBy: ['flour-crumbs'] },
    {
      id: 'baker-solvent',
      statement: 'My oven is paid for.',
      brokenBy: ['oven-receipt'],
      brokenByInsights: ['motive-debt'],
    },
  );
  const ledger = detectiveCase.clues.find(({ id }) => id === 'debt-ledger');
  if (ledger !== undefined) ledger.about = ['baker'];
  edit(detectiveCase);
  return detectiveCase;
}

function newRun(options: { ruleset?: number; edit?: (detectiveCase: DetectiveCase) => void } = {}) {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: buildTalkCase(options.edit),
    seed: 'talks',
    rngState: 1,
    locale: 'en',
  });
  return options.ruleset === undefined ? run : { ...run, rulesetVersion: options.ruleset };
}

/** At the stall with the baker, the tracks, the flour and the glove found. */
const atBaker = (options: Parameters<typeof newRun>[0] = {}): DetectiveRunState =>
  moveTo(
    ['cart-tracks', 'flour-crumbs', 'blue-glove', 'cellar-key', 'debt-ledger'].reduce(
      findClue,
      newRun(options),
    ),
    'cheese-stall',
  );

const moodOf = (run: DetectiveRunState, suspectId = 'baker') =>
  viewRun(run).suspects.find(({ id }) => id === suspectId)?.mood;

describe('a show that can change nothing', () => {
  const lied = () => interrogation(ask(atBaker(), 'baker', 'social', ['cart-tracks'], dice(20)));

  it('is refused, unspent, with an answer that says why', () => {
    const first = lied();
    const again = ask(first.run, 'baker', 'pressure', ['cart-tracks'], dice(20));

    expect(refusalOf(again)).toBe('nothing-new');
    if (again.ok) throw new Error('Expected a refusal.');
    expect(again.refusal.message).toContain('already given up');
    // Nothing was spent: the same state answers a talk that can change something.
    expect(first.run.turn).toBe(1);
    expect(ok(ask(first.run, 'baker', 'social', ['flour-crumbs'], dice(20))).run.turn).toBe(2);
  });

  it('is refused for a conclusion that only confirms, and for several clues that all confirm', () => {
    const drawn = addInsight(atBaker(), 'motive-debt');
    const first = interrogation(ask(drawn, 'baker', 'social', [], dice(20), ['motive-debt']));

    expect(refusalOf(ask(first.run, 'baker', 'social', [], dice(20), ['motive-debt']))).toBe('nothing-new');

    const both = interrogation(ask(atBaker(), 'baker', 'social', ['cart-tracks', 'flour-crumbs'], dice(20)));
    expect(both.run.concededLieIds).toEqual(['baker-asleep', 'baker-alone']);
    expect(refusalOf(ask(both.run, 'baker', 'social', ['flour-crumbs', 'cart-tracks'], dice(20)))).toBe(
      'nothing-new',
    );
  });

  it('goes ahead when anything shown is new, and when nothing is shown', () => {
    const first = lied();

    expect(ok(ask(first.run, 'baker', 'social', ['cart-tracks', 'flour-crumbs'], dice(20))).run.turn).toBe(2);
    expect(ok(ask(first.run, 'baker', 'social', ['cart-tracks', 'blue-glove'], dice(20))).run.turn).toBe(2);
    expect(ok(ask(first.run, 'baker', 'social', [], dice(20))).run.turn).toBe(2);
  });

  it('is only for the ruleset of stale shows', () => {
    const old = { ...lied().run, rulesetVersion: STALE_SHOWS_RULESET_VERSION - 1 };

    expect(ok(ask(old, 'baker', 'social', ['cart-tracks'], dice(20))).run.turn).toBe(2);
  });
});

describe('what a shown clue does', () => {
  it('breaks a lie the first time, and confirms it afterwards', () => {
    const first = interrogation(ask(atBaker(), 'baker', 'social', ['cart-tracks'], dice(20)));
    expect(first.outcome.presented).toEqual([{ clueId: 'cart-tracks', effect: 'breaks-lie' }]);

    // From the ruleset of stale shows the second show is refused (below); before it, it was made and confirmed.
    const second = interrogation(
      ask(
        { ...first.run, rulesetVersion: STALE_SHOWS_RULESET_VERSION - 1 },
        'baker',
        'social',
        ['cart-tracks'],
        dice(20),
      ),
    );

    expect(second.outcome.presented).toEqual([{ clueId: 'cart-tracks', effect: 'confirms' }]);
    expect(second.outcome.stance).toBe('holds');
    expect(second.run.history.shown.map(({ effect }) => effect)).toEqual(['breaks-lie', 'confirms']);
  });

  it('implicates a suspect it is about, by what it points at or by what the case says', () => {
    const talk = interrogation(
      ask(atBaker(), 'baker', 'social', ['flour-crumbs', 'debt-ledger', 'cellar-key'], dice(1)),
    );

    // The flour points at the baker, the ledger is about her; the key is nothing to do with her.
    expect(talk.outcome.presented).toEqual([
      { clueId: 'flour-crumbs', effect: 'implicates' },
      { clueId: 'debt-ledger', effect: 'implicates' },
      { clueId: 'cellar-key', effect: 'no-effect' },
    ]);
  });

  it('reads as a lie that fell, and not as an implication, when the clue is both', () => {
    const talk = interrogation(ask(atBaker(), 'baker', 'social', ['flour-crumbs'], dice(20)));

    expect(talk.outcome.presented).toEqual([{ clueId: 'flour-crumbs', effect: 'breaks-lie' }]);
  });

  it('is about the one a clue is about, and nobody else', () => {
    const run = findClue(newRun(), 'blue-glove');

    const talk = interrogation(ask(run, 'rival', 'social', ['blue-glove'], dice(1)));

    expect(talk.outcome.presented).toEqual([{ clueId: 'blue-glove', effect: 'implicates' }]);
  });

  it('is as before in a run from before the talks: nothing but a lie that fell counts', () => {
    const old = atBaker({ ruleset: TALKS_RULESET_VERSION - 1 });

    const first = interrogation(ask(old, 'baker', 'social', ['cart-tracks', 'debt-ledger'], dice(20)));
    const second = interrogation(ask(first.run, 'baker', 'social', ['cart-tracks'], dice(20)));

    expect(first.outcome.presented.map(({ effect }) => effect)).toEqual(['breaks-lie', 'no-effect']);
    expect(second.outcome.presented).toEqual([{ clueId: 'cart-tracks', effect: 'no-effect' }]);
    expect(first.outcome).not.toHaveProperty('mood');
  });
});

describe('putting a conclusion to a suspect', () => {
  const concluded = (options: Parameters<typeof newRun>[0] = {}) =>
    addInsight(atBaker(options), 'motive-debt');

  it('takes a conclusion the hero has drawn, and refuses one they have not', () => {
    const rng = createRng(1);

    expect(refusalOf(ask(atBaker(), 'baker', 'social', [], rng, ['motive-debt']))).toBe('insight-not-found');
    expect(refusalOf(ask(atBaker(), 'baker', 'social', [], rng, ['no-such-insight']))).toBe(
      'insight-not-found',
    );
    expect(rng.state()).toBe(createRng(1).state());
    expect(ask(concluded(), 'baker', 'social', [], dice(10), ['motive-debt']).ok).toBe(true);
  });

  it('is refused in a run from before the talks', () => {
    const old = addInsight(atBaker({ ruleset: TALKS_RULESET_VERSION - 1 }), 'motive-debt');

    expect(refusalOf(ask(old, 'baker', 'social', [], createRng(1), ['motive-debt']))).toBe(
      'insight-not-found',
    );
  });

  it('breaks a lie that lists it, and eases the talk twice as much as a clue does', () => {
    const rules = APPROACH_RULES.pressure;
    // A pressure talk: 14 - 4 with the oven receipt shown (which the hero does not hold) or 14 - 8 with the
    // conclusion, against the hero's pressure of 1 plus the die.
    const needed = rules.difficulty - 2 * rules.easePerBrokenLie;
    const win = interrogation(ask(concluded(), 'baker', 'pressure', [], dice(needed - 1), ['motive-debt']));

    expect(win.outcome).toMatchObject({
      succeeded: true,
      conceded: [{ lieId: 'baker-solvent' }],
      presentedInsights: [{ insightId: 'motive-debt', effect: 'breaks-lie' }],
    });
    // One point of ease less is not enough.
    const lose = interrogation(ask(concluded(), 'baker', 'pressure', [], dice(needed - 2), ['motive-debt']));
    expect(lose.outcome.succeeded).toBe(false);
    expect(win.run.concededLieIds).toEqual(['baker-solvent']);
  });

  it('confirms a lie that has fallen, and implicates a suspect its clues are about', () => {
    const first = interrogation(ask(concluded(), 'baker', 'social', [], dice(20), ['motive-debt']));

    const again = interrogation(
      ask({ ...first.run, rulesetVersion: STALE_SHOWS_RULESET_VERSION - 1 }, 'baker', 'social', [], dice(1), [
        'motive-debt',
      ]),
    );

    expect(again.outcome.presentedInsights).toEqual([{ insightId: 'motive-debt', effect: 'confirms' }]);
    // The same conclusion put to the rival is not about them: the ledger is about the baker, the receipt about no one.
    const rivalRun = moveTo(first.run, 'market-square');
    const rival = interrogation(ask(rivalRun, 'rival', 'social', [], dice(1), ['motive-debt']));
    expect(rival.outcome.presentedInsights).toEqual([{ insightId: 'motive-debt', effect: 'no-effect' }]);
    const implied = interrogation(
      ask(
        addInsight(
          atBaker({
            edit: (detectiveCase) => {
              const baker = detectiveCase.suspects.find(({ id }) => id === 'baker');
              if (baker !== undefined) baker.lies = [];
            },
          }),
          'motive-debt',
        ),
        'baker',
        'social',
        [],
        dice(1),
        ['motive-debt'],
      ),
    );
    expect(implied.outcome.presentedInsights).toEqual([{ insightId: 'motive-debt', effect: 'implicates' }]);
  });

  it('is put together with a clue that breaks another lie, each doing its own', () => {
    const talk = interrogation(
      ask(concluded(), 'baker', 'social', ['cart-tracks'], dice(20), ['motive-debt']),
    );

    expect(talk.outcome.presented).toEqual([{ clueId: 'cart-tracks', effect: 'breaks-lie' }]);
    expect(talk.outcome.presentedInsights).toEqual([{ insightId: 'motive-debt', effect: 'breaks-lie' }]);
    expect(talk.outcome.conceded.map(({ lieId }) => lieId).sort()).toEqual(['baker-asleep', 'baker-solvent']);
  });

  it('leaves out of the outcome what was not put', () => {
    expect(interrogation(ask(atBaker(), 'baker', 'social', [], dice(10))).outcome).not.toHaveProperty(
      'presentedInsights',
    );
  });
});

describe('how a talk leaves a suspect', () => {
  it('moves a suspect a step for each lie that fell, and shows it as a word', () => {
    expect(moodOf(atBaker())).toBe('calm');
    const one = interrogation(ask(atBaker(), 'baker', 'social', ['cart-tracks'], dice(20)));
    const two = interrogation(ask(atBaker(), 'baker', 'social', ['cart-tracks', 'flour-crumbs'], dice(20)));

    expect(one.outcome.mood).toBe('shaken');
    expect(moodOf(one.run)).toBe('shaken');
    expect(two.outcome.mood).toBe('cornered');
    expect(moodOf(two.run)).toBe('cornered');
    expect(moodOf(one.run, 'rival')).toBe('calm');
  });

  it('stops at broken, however many lies fall', () => {
    const three = interrogation(
      ask(
        atBaker({
          edit: (detectiveCase) => {
            const baker = detectiveCase.suspects.find(({ id }) => id === 'baker');
            baker?.lies.push({ id: 'baker-fourth', statement: 'Nothing.', brokenBy: ['blue-glove'] });
          },
        }),
        'baker',
        'social',
        ['cart-tracks', 'flour-crumbs', 'blue-glove'],
        dice(20),
      ),
    );

    expect(three.outcome.mood).toBe('broken');
    expect(MAX_MOOD_STEP).toBe(3);
  });

  it('eases the next talk with a suspect who is shaken', () => {
    const shaken = interrogation(ask(atBaker(), 'baker', 'social', ['cart-tracks'], dice(20))).run;
    const social = APPROACH_RULES.social.difficulty;
    // Hero social 0: a die of `social - SHAKEN_EASE` wins against a shaken suspect and loses against a calm one.
    const die = social - SHAKEN_EASE;

    expect(interrogation(ask(shaken, 'baker', 'social', [], dice(die))).outcome.succeeded).toBe(true);
    expect(interrogation(ask(atBaker(), 'baker', 'social', [], dice(die))).outcome.succeeded).toBe(false);
  });

  it('lets a cornered suspect slip the lead of a lie that still holds, to any success', () => {
    const edit = (detectiveCase: DetectiveCase) => {
      detectiveCase.leads = [
        {
          id: 'alone-slip',
          reason: 'She let slip who she was with.',
          earnedBy: { kind: 'lie', lieId: 'baker-alone' },
          isFalse: false,
        },
      ];
    };
    // Two lies fall (the tracks and the oven receipt, which the hero holds): the suspect is cornered with the
    // lie of the flour still standing.
    const cornered = interrogation(
      ask(
        findClue(atBaker({ edit }), 'oven-receipt'),
        'baker',
        'social',
        ['cart-tracks', 'oven-receipt'],
        dice(20),
      ),
    );
    expect(cornered.outcome.mood).toBe('cornered');
    expect(cornered.run.earnedLeads).toEqual([]);

    const slip = ok(ask(cornered.run, 'baker', 'social', [], dice(20)));
    expect(slip.newLeadIds).toEqual(['alone-slip']);
    const failed = ok(ask(cornered.run, 'baker', 'social', [], dice(2)));
    expect(failed.newLeadIds).toEqual([]);
  });

  it('gives a broken suspect up: the secret comes to any success', () => {
    const broken = {
      ...atBaker(),
      suspectMoods: [{ suspectId: 'baker', step: MAX_MOOD_STEP, closedUntil: null }],
    };

    const win = interrogation(ask(broken, 'baker', 'social', [], dice(15)));
    const lose = interrogation(ask(broken, 'baker', 'social', [], dice(2)));
    const calm = interrogation(ask(atBaker(), 'baker', 'social', [], dice(15)));

    expect(win.outcome.secret).toBe('She owes the town for an oven she cannot pay for.');
    expect(win.run.statements.map(({ kind }) => kind)).toContain('secret');
    expect(lose.outcome.secret).toBeNull();
    expect(calm.outcome.secret).toBeNull();
  });
});

describe('a pressure with nothing to stand on', () => {
  it('leaves the suspect hostile and closed for a while, and says so', () => {
    const talk = interrogation(ask(atBaker(), 'baker', 'pressure', ['cellar-key'], dice(15)));

    expect(talk.outcome.closed).toBe(true);
    expect(viewRun(talk.run).suspects.find(({ id }) => id === 'baker')?.closed).toBe(true);
    const talksAgain = viewRun(talk.run).suspects.find(({ id }) => id === 'baker')?.talksAgain;
    expect(talksAgain).toEqual({
      day: talk.run.clock.day,
      minute: talk.run.clock.minute + HOSTILE_MINUTES,
    });
    expect(viewRun(talk.run).suspects.find(({ id }) => id === 'rival')?.talksAgain).toBeNull();
    expect(refusalOf(ask(talk.run, 'baker', 'social', [], createRng(1)))).toBe('suspect-closed');
  });

  it('opens again when the time is up, and closes only the one pressed', () => {
    const talk = interrogation(ask(atBaker(), 'baker', 'pressure', [], dice(15)));

    const later = spendTime(talk.run, HOSTILE_MINUTES);
    expect(viewRun(later).suspects.find(({ id }) => id === 'baker')?.closed).toBe(false);
    expect(viewRun(later).suspects.find(({ id }) => id === 'baker')?.talksAgain).toBeNull();
    expect(ask(later, 'baker', 'social', [], dice(10)).ok).toBe(true);
    expect(ask(moveTo(talk.run, 'market-square'), 'rival', 'social', [], dice(10)).ok).toBe(true);
  });

  it('is not hostile when a clue stands behind it, or when it is charm', () => {
    const backed = interrogation(ask(atBaker(), 'baker', 'pressure', ['flour-crumbs'], dice(2)));
    const confirming = interrogation(
      ask(
        {
          ...interrogation(ask(atBaker(), 'baker', 'social', ['cart-tracks'], dice(20))).run,
          rulesetVersion: STALE_SHOWS_RULESET_VERSION - 1,
        },
        'baker',
        'pressure',
        ['cart-tracks'],
        dice(15),
      ),
    );
    const charm = interrogation(ask(atBaker(), 'baker', 'social', ['cellar-key'], dice(2)));

    expect(backed.outcome).not.toHaveProperty('closed');
    expect(confirming.outcome).not.toHaveProperty('closed');
    expect(charm.outcome).not.toHaveProperty('closed');
    expect(viewRun(backed.run).suspects.find(({ id }) => id === 'baker')?.closed).toBe(false);
  });

  it('is only for the ruleset of talks', () => {
    const old = interrogation(
      ask(atBaker({ ruleset: TALKS_RULESET_VERSION - 1 }), 'baker', 'pressure', [], dice(15)),
    );

    expect(old.outcome).not.toHaveProperty('closed');
    expect(old.run.suspectMoods).toEqual([]);
  });
});

describe('over many seeds', () => {
  it('only ever moves a suspect forward, never past broken, and keeps the check above its floor', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      let run = findClue(atBaker(), 'oven-receipt');
      let before = 0;
      for (let turn = 0; turn < 4; turn += 1) {
        const rng = createRng(seed * 10 + turn);
        const resolution = ask(
          run,
          'baker',
          seed % 2 === 0 ? 'social' : 'pressure',
          ['cart-tracks', 'flour-crumbs', 'oven-receipt'].slice(0, (seed + turn) % 4),
          rng,
        );
        if (!resolution.ok) {
          expect(['suspect-closed', 'nothing-new']).toContain(resolution.refusal.code);
          continue;
        }
        run = resolution.run;
        const step = run.suspectMoods.find(({ suspectId }) => suspectId === 'baker')?.step ?? 0;
        expect(step).toBeGreaterThanOrEqual(before);
        expect(step).toBeLessThanOrEqual(MAX_MOOD_STEP);
        before = step;
        run = spendTime(run, HOSTILE_MINUTES);
      }
    }
  });
});
