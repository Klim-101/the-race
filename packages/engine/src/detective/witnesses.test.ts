// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { resolveIntent, type Resolved } from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import type { CaseIssueCode } from './case-issue.js';
import { validateCase } from './case-validator.js';
import { createDetectiveRun, DetectiveRunStateSchema, findClue, viewRun } from './run-state.js';
import type { DetectiveRunState } from './run-state.js';
import {
  WITNESS_NAMED_EASE,
  WITNESS_RULESET_VERSION,
  requireWitness,
  sightingsOf,
  witnessesHere,
} from './witnesses.js';
import { ASK_DIFFICULTY, ASK_MINUTES, FAILED_ASK_MINUTES } from './ask.js';

/** A seed whose first d20 roll is `die`. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

/**
 * The cheese case with people in it: a vendor in the market square all day (the start, where the rival is seen at
 * minute 120 of the crime day), a night guard at the stall a little after the crime, and a late vendor who is only there
 * from the afternoon.
 */
function buildWitnessCase(edit: (detectiveCase: DetectiveCase) => void = () => undefined): DetectiveCase {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  detectiveCase.witnesses = [
    {
      id: 'vendor',
      locationId: 'market-square',
      name: 'Pip the vendor',
      persona: 'A fruit seller who sees everything and says half of it.',
      hours: { fromMinute: 0, untilMinute: 1439 },
    },
    {
      id: 'night-guard',
      locationId: 'cheese-stall',
      name: 'Ned the guard',
      persona: 'A guard with a lantern and a grudge against the fair.',
      hours: { fromMinute: 200, untilMinute: 300 },
    },
    {
      id: 'late-vendor',
      locationId: 'market-square',
      name: 'Una the late vendor',
      persona: 'She only sets up her cart when the day is half over.',
      hours: { fromMinute: 900, untilMinute: 1000 },
    },
  ];
  edit(detectiveCase);
  return detectiveCase;
}

function newRun(edit?: (detectiveCase: DetectiveCase) => void): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: buildWitnessCase(edit),
    seed: 'witnesses',
    rngState: 1,
    locale: 'en',
  });
}

function ask(run: DetectiveRunState, rng: Rng, extra: Record<string, unknown>): Resolved {
  return resolveIntent(run, { kind: 'ask', ...extra }, rng);
}

function asked(resolution: Resolved) {
  if (!resolution.ok || resolution.outcome.kind !== 'ask') throw new Error('Not a question.');
  return { run: resolution.run, outcome: resolution.outcome, details: resolution.details };
}

const difficultyOf = (details: ReturnType<typeof asked>['details']): number | undefined => {
  const result = details[0]?.result;
  return result === undefined || result === 'auto' ? undefined : result.difficulty;
};

const refusalOf = (resolution: Resolved): string => {
  if (resolution.ok) throw new Error('Expected a refusal.');
  return resolution.refusal.code;
};

describe('asking a witness what they saw', () => {
  it('tells who was at their place, and writes it down for the hero', () => {
    const { run, outcome, details } = asked(ask(newRun(), dice(15), { witnessId: 'vendor' }));

    expect(outcome).toMatchObject({
      succeeded: true,
      minutes: ASK_MINUTES,
      consequences: [],
      witness: { id: 'vendor', sightings: [{ suspectId: 'rival', minuteOfDay: 120 }] },
    });
    expect(details).toMatchObject([{ subject: { kind: 'location', id: 'market-square' } }]);
    expect(run.sightings).toEqual([{ witnessId: 'vendor', suspectId: 'rival', minuteOfDay: 120, day: 1 }]);
    expect(runParses(run)).toBe(true);
  });

  it('shows in the view what was told, with the names and the place, and never what was not asked', () => {
    const before = viewRun(newRun());
    expect(before.sightings).toEqual([]);
    expect(before.witnesses).toEqual([
      {
        id: 'vendor',
        name: 'Pip the vendor',
        persona: 'A fruit seller who sees everything and says half of it.',
        victim: false,
      },
    ]);

    const { run } = asked(ask(newRun(), dice(15), { witnessId: 'vendor' }));

    expect(viewRun(run).sightings).toEqual([
      {
        witnessId: 'vendor',
        witnessName: 'Pip the vendor',
        place: { id: 'market-square', name: 'Market square' },
        suspectId: 'rival',
        minuteOfDay: 120,
        day: 1,
      },
    ]);
  });

  it('answers only about the person asked after', () => {
    const none = asked(ask(newRun(), dice(15), { witnessId: 'vendor', aboutSuspectId: 'baker' }));
    expect(none.outcome).toMatchObject({ succeeded: true, witness: { sightings: [] } });
    expect(none.run.sightings).toEqual([]);

    const rival = asked(ask(newRun(), dice(15), { witnessId: 'vendor', aboutSuspectId: 'rival' }));
    expect(rival.outcome).toMatchObject({
      witness: { sightings: [{ suspectId: 'rival', minuteOfDay: 120 }] },
    });
  });

  it('costs more time on a failure and tells nothing', () => {
    const { run, outcome } = asked(ask(newRun(), dice(2), { witnessId: 'vendor' }));

    expect(outcome).toMatchObject({
      succeeded: false,
      minutes: ASK_MINUTES + FAILED_ASK_MINUTES,
      consequences: ['time-lost'],
      witness: { sightings: [] },
    });
    expect(run.sightings).toEqual([]);
  });

  it('writes a sighting down once however often it is told', () => {
    const first = asked(ask(newRun(), dice(15), { witnessId: 'vendor' }));
    const second = asked(ask(first.run, dice(15), { witnessId: 'vendor' }));

    expect(second.outcome.witness?.sightings).toHaveLength(1);
    expect(second.run.sightings).toHaveLength(1);
  });

  it('is easier after a person the hero holds a clue about', () => {
    const plain = asked(ask(newRun(), dice(15), { witnessId: 'vendor', aboutSuspectId: 'rival' }));
    const described = asked(
      ask(findClue(newRun(), 'blue-glove'), dice(15), { witnessId: 'vendor', aboutSuspectId: 'rival' }),
    );
    const general = asked(ask(findClue(newRun(), 'blue-glove'), dice(15), { witnessId: 'vendor' }));

    expect(difficultyOf(plain.details)).toBe(ASK_DIFFICULTY);
    expect(difficultyOf(described.details)).toBe(ASK_DIFFICULTY - WITNESS_NAMED_EASE);
    expect(difficultyOf(general.details)).toBe(ASK_DIFFICULTY);
  });

  it('does not tell the locals anything: a question to a witness opens no lead', () => {
    const { run } = asked(ask(newRun(), dice(15), { witnessId: 'vendor' }));

    expect(run.earnedLeads).toEqual(newRun().earnedLeads);
  });
});

describe('who can be asked', () => {
  it('refuses a witness that does not exist, one of another place and one who is not there at this hour alike', () => {
    const run = newRun();

    expect(refusalOf(ask(run, dice(15), { witnessId: 'nobody' }))).toBe('no-witness');
    expect(refusalOf(ask(run, dice(15), { witnessId: 'night-guard' }))).toBe('no-witness');
    expect(refusalOf(ask(run, dice(15), { witnessId: 'late-vendor' }))).toBe('no-witness');
  });

  it('refuses a person to ask after who is no suspect, and a name with no witness', () => {
    expect(refusalOf(ask(newRun(), dice(15), { witnessId: 'vendor', aboutSuspectId: 'ghost' }))).toBe(
      'unknown-suspect',
    );
    expect(refusalOf(ask(newRun(), dice(15), { aboutSuspectId: 'rival' }))).toBe('invalid-intent');
  });

  it('refuses nothing and spends nothing: a refusal costs no time', () => {
    const run = newRun();
    const refused = ask(run, dice(15), { witnessId: 'nobody' });

    expect(refused.ok).toBe(false);
    expect(run.clock).toEqual(newRun().clock);
  });

  it('knows nobody in a case that has no witnesses', () => {
    const bare = createDetectiveRun({
      hero: buildHero(),
      traits: [],
      case: DetectiveCaseSchema.parse(buildCheeseCase()),
      seed: 'bare',
      rngState: 1,
      locale: 'en',
    });

    expect(witnessesHere(bare)).toEqual([]);
    expect(refusalOf(ask(bare, dice(15), { witnessId: 'vendor' }))).toBe('no-witness');
    expect(() => requireWitness(bare.case, 'vendor')).toThrow('no witness');
  });

  it('knows nobody before the ruleset of witnesses', () => {
    const old: DetectiveRunState = { ...newRun(), rulesetVersion: WITNESS_RULESET_VERSION - 1 };

    expect(witnessesHere(old)).toEqual([]);
    expect(refusalOf(ask(old, dice(15), { witnessId: 'vendor' }))).toBe('not-available');
    expect(viewRun(old).witnesses).toEqual([]);
  });

  it('keeps a general question to the locals as it was, for a case with witnesses too', () => {
    const { outcome } = asked(ask(newRun(), dice(15), {}));

    expect(outcome.witness).toBeUndefined();
  });
});

describe('what a witness saw', () => {
  const witness = (hours: { fromMinute: number; untilMinute: number }, locationId = 'market-square') => ({
    id: 'w',
    locationId,
    name: 'W',
    persona: 'P',
    hours,
  });

  it('is the people of the timeline at their place in their hours, by the minute of the day', () => {
    const detectiveCase = buildWitnessCase((built) => {
      built.truth.timeline.push({
        atMinute: 1440 + 130,
        actorId: 'baker',
        locationId: 'market-square',
        action: 'Walks across the square.',
      });
    });

    expect(sightingsOf(detectiveCase, witness({ fromMinute: 100, untilMinute: 200 }))).toEqual([
      { suspectId: 'rival', minuteOfDay: 120 },
      { suspectId: 'baker', minuteOfDay: 130 },
    ]);
    expect(sightingsOf(detectiveCase, witness({ fromMinute: 125, untilMinute: 200 }))).toEqual([
      { suspectId: 'baker', minuteOfDay: 130 },
    ]);
  });

  it('may span midnight, and never names an action or someone who is no suspect', () => {
    const detectiveCase = buildWitnessCase((built) => {
      built.truth.timeline.push({
        atMinute: 30,
        actorId: 'a-passer-by',
        locationId: 'market-square',
        action: 'Buys a pear.',
      });
    });

    expect(sightingsOf(detectiveCase, witness({ fromMinute: 1300, untilMinute: 200 }))).toEqual([
      { suspectId: 'rival', minuteOfDay: 120 },
    ]);
    expect(
      JSON.stringify(sightingsOf(detectiveCase, witness({ fromMinute: 0, untilMinute: 1439 }))),
    ).not.toContain('Tastes');
  });

  it('is nothing at a place the timeline never mentions', () => {
    expect(
      sightingsOf(buildWitnessCase(), witness({ fromMinute: 0, untilMinute: 1439 }, 'mayor-office')),
    ).toEqual([]);
  });

  it('is a witness of the case, and a name the case does not know is an error', () => {
    expect(requireWitness(buildWitnessCase(), 'vendor').name).toBe('Pip the vendor');
    expect(() => requireWitness(buildWitnessCase(), 'ghost')).toThrow('no witness');
  });
});

describe('a state that names a witness the case does not have', () => {
  it('is refused on load', () => {
    const run = newRun();
    const broken = {
      ...run,
      sightings: [{ witnessId: 'ghost', suspectId: 'rival', minuteOfDay: 1, day: 1 }],
    };

    expect(DetectiveRunStateSchema.safeParse(broken).success).toBe(false);
    expect(
      DetectiveRunStateSchema.safeParse({
        ...run,
        sightings: [{ witnessId: 'vendor', suspectId: 'ghost', minuteOfDay: 1, day: 1 }],
      }).success,
    ).toBe(false);
  });
});

describe('the validator and the witnesses', () => {
  function codes(detectiveCase: DetectiveCase): CaseIssueCode[] {
    const result = validateCase(detectiveCase, {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
    });
    return result.isValid ? [] : result.issues.map(({ code }) => code);
  }

  it('accepts witnesses who saw only the comings and goings', () => {
    expect(codes(buildWitnessCase())).toEqual([]);
  });

  it('refuses a witness who stood at the scene of the crime when it was done', () => {
    // The crime is at the stall at minute 120; the guard of the stall is there all day.
    const detectiveCase = buildWitnessCase();
    expect(
      codes(
        buildWitnessCase((built) => {
          const guard = built.witnesses?.find(({ id }) => id === 'night-guard');
          if (guard !== undefined) guard.hours = { fromMinute: 60, untilMinute: 180 };
        }),
      ),
    ).toEqual(['witness-saw-the-crime']);
    // At the stall, but off the minute: he saw the stall, not the crime.
    expect(
      codes(
        buildWitnessCase((built) => {
          const guard = built.witnesses?.find(({ id }) => id === 'night-guard');
          if (guard !== undefined) guard.hours = { fromMinute: 200, untilMinute: 300 };
        }),
      ),
    ).toEqual([]);
    expect(detectiveCase.witnesses).toHaveLength(3);
  });

  it('refuses a witness in a place that does not exist and a repeated id', () => {
    expect(
      codes(
        buildWitnessCase((built) => {
          const first = built.witnesses?.[0];
          if (first !== undefined) first.locationId = 'nowhere';
        }),
      ),
    ).toEqual(['unknown-reference']);
    expect(
      codes(
        buildWitnessCase((built) => {
          const second = built.witnesses?.[1];
          if (second !== undefined) second.id = 'vendor';
        }),
      ),
    ).toEqual(['duplicate-id']);
  });

  it('checks the words of a witness like any text of the case', () => {
    const issues = codes(
      buildWitnessCase((built) => {
        const first = built.witnesses?.[0];
        if (first !== undefined) first.name = 'Пип торговец';
      }),
    );

    expect(issues).toContain('wrong-script');
  });
});

function runParses(run: DetectiveRunState): boolean {
  return DetectiveRunStateSchema.safeParse(run).success;
}
