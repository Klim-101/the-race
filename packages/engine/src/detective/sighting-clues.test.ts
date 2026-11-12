// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { mannerOf } from './reaction-manner.js';
import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { resolveIntent, type Resolved } from './actions.js';
import type { CaseIssueCode } from './case-issue.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { LEGACY_RULES } from './case-rules.js';
import { validateCase } from './case-validator.js';
import { createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';
import { accuse, deduce } from './verdict.js';
import {
  SIGHTING_CLUES_RULESET_VERSION,
  deriveSightingClues,
  sightingClueId,
  type SightingDescription,
} from './witnesses.js';

/** A seed whose first d20 roll is `die`. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

const describe_ = (d: SightingDescription): string =>
  `${d.witnessName} saw ${d.suspectName} at ${d.placeName} at ${d.minutesOfDay.map(String).join(' and ')}.`;

/**
 * The cheese case with a vendor in the market square all day (who sees the rival at minute 120, and the baker at 110
 * and 135, the second also a day later), a night guard at the stall, and the sightings made into clues. The rival's
 * lie, "I was not even in town", is broken by what the vendor saw.
 */
function buildSeenCase(edit: (detectiveCase: DetectiveCase) => void = () => undefined): DetectiveCase {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  detectiveCase.witnesses = [
    {
      id: 'vendor',
      locationId: 'market-square',
      name: 'Pip the vendor',
      persona: 'A fruit seller.',
      hours: { fromMinute: 0, untilMinute: 1439 },
    },
  ];
  detectiveCase.truth.timeline.push(
    { atMinute: 110, actorId: 'baker', locationId: 'market-square', action: 'Crosses the square.' },
    { atMinute: 135, actorId: 'baker', locationId: 'market-square', action: 'Crosses back.' },
    { atMinute: 1440 + 135, actorId: 'baker', locationId: 'market-square', action: 'Again, a day later.' },
  );
  const rival = detectiveCase.suspects.find(({ id }) => id === 'rival');
  const lie = rival?.lies[0];
  if (lie !== undefined) lie.brokenBy = ['seen-vendor-rival'];
  edit(detectiveCase);
  return deriveSightingClues(detectiveCase, describe_);
}

function newRun(detectiveCase: DetectiveCase = buildSeenCase()): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: 'seen',
    rngState: 1,
    locale: 'en',
  });
}

function ask(run: DetectiveRunState, extra: Record<string, unknown>, die = 15) {
  const resolution: Resolved = resolveIntent(run, { kind: 'ask', witnessId: 'vendor', ...extra }, dice(die));
  if (!resolution.ok || resolution.outcome.kind !== 'ask') throw new Error('Not a question.');
  return { run: resolution.run, outcome: resolution.outcome };
}

describe('the clues a witness gives', () => {
  it('are made from the timeline, one for each witness and suspect, with all the times', () => {
    const detectiveCase = buildSeenCase();
    const baker = detectiveCase.clues.find(({ id }) => id === 'seen-vendor-baker');
    const rival = detectiveCase.clues.find(({ id }) => id === 'seen-vendor-rival');

    expect(baker).toMatchObject({
      locationId: 'market-square',
      description: 'Pip the vendor saw Orla Brenn at Market square at 110 and 135.',
      discovery: null,
      pointsTo: [],
      about: ['baker'],
      sightingOf: { witnessId: 'vendor', suspectId: 'baker' },
      isRedHerring: false,
    });
    expect(rival).toMatchObject({
      about: ['rival'],
      sightingOf: { witnessId: 'vendor', suspectId: 'rival' },
    });
    // Nobody else is in the square, and the mayor and the stall's guard-less places give none.
    expect(detectiveCase.clues.filter(({ sightingOf }) => sightingOf !== undefined)).toHaveLength(2);
  });

  it('are made once: a case derived again, and a case that has no witness, stay as they are', () => {
    const detectiveCase = buildSeenCase();

    expect(deriveSightingClues(detectiveCase, describe_)).toBe(detectiveCase);
    const bare = DetectiveCaseSchema.parse(buildCheeseCase());
    expect(deriveSightingClues(bare, describe_)).toBe(bare);
  });

  it('leave the case they were made from untouched, and are named by one rule', () => {
    const before = DetectiveCaseSchema.parse(buildCheeseCase());
    before.witnesses = [
      {
        id: 'vendor',
        locationId: 'market-square',
        name: 'Pip',
        persona: 'A seller.',
        hours: { fromMinute: 0, untilMinute: 1439 },
      },
    ];
    const count = before.clues.length;

    deriveSightingClues(before, describe_);

    expect(before.clues).toHaveLength(count);
    expect(sightingClueId('vendor', 'rival')).toBe('seen-vendor-rival');
  });

  it('are not made for a witness whose place is not in the case', () => {
    const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
    detectiveCase.witnesses = [
      {
        id: 'ghost',
        locationId: 'nowhere',
        name: 'Gus',
        persona: 'A ghost.',
        hours: { fromMinute: 0, untilMinute: 1439 },
      },
    ];
    detectiveCase.truth.timeline.push({
      atMinute: 5,
      actorId: 'baker',
      locationId: 'nowhere',
      action: 'Vanishes.',
    });

    expect(deriveSightingClues(detectiveCase, describe_)).toBe(detectiveCase);
  });
});

describe('asking a witness, from the ruleset of sighting clues', () => {
  it('gives the hero the clues of what the witness saw, and tells which', () => {
    const { run, outcome } = ask(newRun(), {});

    expect(outcome.witness).toMatchObject({
      id: 'vendor',
      clueIds: ['seen-vendor-rival', 'seen-vendor-baker'],
    });
    expect(run.foundClueIds).toEqual(['seen-vendor-rival', 'seen-vendor-baker']);
    const view = viewRun(run);
    expect(view.clues.map(({ id, number }) => [id, number !== ''])).toEqual([
      ['seen-vendor-baker', true],
      ['seen-vendor-rival', true],
    ]);
    expect(view.sightings).toHaveLength(3);
  });

  it('gives only the clue of the person asked after', () => {
    const { run, outcome } = ask(newRun(), { aboutSuspectId: 'rival' });

    expect(outcome.witness?.clueIds).toEqual(['seen-vendor-rival']);
    expect(run.foundClueIds).toEqual(['seen-vendor-rival']);
  });

  it('gives nothing on a failure, and nothing again for a clue the hero holds', () => {
    const failed = ask(newRun(), {}, 2);
    expect(failed.outcome.witness).toEqual({ id: 'vendor', sightings: [] });
    expect(failed.run.foundClueIds).toEqual([]);

    const first = ask(newRun(), {});
    const again = ask(first.run, {});
    expect(again.outcome.witness?.clueIds).toBeUndefined();
    expect(again.run.foundClueIds).toEqual(first.run.foundClueIds);
  });

  it('gives no clue for a person the witness did not see, nor in a case that made none', () => {
    const none = ask(newRun(), { aboutSuspectId: 'mayor' });
    expect(none.outcome.witness).toEqual({ id: 'vendor', sightings: [] });

    const plain = DetectiveCaseSchema.parse(buildSeenCase());
    plain.clues = plain.clues.filter(({ sightingOf }) => sightingOf === undefined);
    const bare = ask(newRun(plain), {});
    expect(bare.outcome.witness?.clueIds).toBeUndefined();
    expect(bare.run.foundClueIds).toEqual([]);
    expect(bare.run.sightings).toHaveLength(3);
  });

  it('only keeps the record of what was told before that ruleset', () => {
    const old: DetectiveRunState = { ...newRun(), rulesetVersion: SIGHTING_CLUES_RULESET_VERSION - 1 };

    const { run, outcome } = ask(old, {});

    expect(outcome.witness?.clueIds).toBeUndefined();
    expect(run.foundClueIds).toEqual([]);
    expect(run.sightings.length).toBeGreaterThan(0);
  });

  it('is the only way to find them: a glance and a search of the place do not', () => {
    const looked = resolveIntent(newRun(), { kind: 'look' }, dice(20));
    const searched = resolveIntent(newRun(), { kind: 'search' }, dice(20));

    for (const resolution of [looked, searched]) {
      if (!resolution.ok) throw new Error('Refused.');
      expect(resolution.run.foundClueIds.filter((id) => id.startsWith('seen-'))).toEqual([]);
    }
  });
});

describe('a clue that a witness told, in the view', () => {
  it('says whose words it is, and no other clue does', () => {
    const base = newRun();
    const held: DetectiveRunState = {
      ...ask(base, {}).run,
      foundClueIds: [...ask(base, {}).run.foundClueIds, 'cellar-key'],
    };

    const view = viewRun(held);

    expect(view.clues.map(({ id, witness }) => [id, witness])).toEqual([
      ['cellar-key', null],
      ['seen-vendor-baker', 'Pip the vendor'],
      ['seen-vendor-rival', 'Pip the vendor'],
    ]);
  });
});

describe('a sighting in the hands of the hero', () => {
  const holding = (): DetectiveRunState => ask(newRun(), {}).run;

  it('breaks the lie that names it, when shown to the suspect it is about', () => {
    const run: DetectiveRunState = { ...holding(), locationId: 'market-square' };

    const resolution = resolveIntent(
      run,
      { kind: 'interrogate', suspectId: 'rival', approach: 'social', clueIds: ['seen-vendor-rival'] },
      dice(15),
    );
    if (!resolution.ok || resolution.outcome.kind !== 'interrogate') throw new Error('Not a talk.');

    expect(resolution.outcome.presented).toEqual([
      { clueId: 'seen-vendor-rival', effect: 'breaks-lie', manner: mannerOf('rival', 'seen-vendor-rival') },
    ]);
    expect(resolution.outcome.conceded.map(({ lieId }) => lieId)).toEqual(['rival-away']);
  });

  it('implicates the suspect it is about and means nothing to anyone else', () => {
    const run: DetectiveRunState = { ...holding(), locationId: 'cheese-stall' };

    const resolution = resolveIntent(
      run,
      {
        kind: 'interrogate',
        suspectId: 'baker',
        approach: 'social',
        clueIds: ['seen-vendor-baker', 'seen-vendor-rival'],
      },
      dice(15),
    );
    if (!resolution.ok || resolution.outcome.kind !== 'interrogate') throw new Error('Not a talk.');

    expect(resolution.outcome.presented.map(({ clueId, effect }) => [clueId, effect])).toEqual([
      ['seen-vendor-baker', 'implicates'],
      ['seen-vendor-rival', 'no-effect'],
    ]);
  });

  it('can be linked with a clue, and laid out as proof', () => {
    const detectiveCase = buildSeenCase((built) => {
      built.deductions.push({
        id: 'baker-out',
        clueIds: ['seen-vendor-baker', 'cart-tracks'],
        insight: 'The baker was out, and the cart went to the cellar.',
      });
    });
    const run: DetectiveRunState = {
      ...newRun(detectiveCase),
      foundClueIds: ['seen-vendor-baker', 'cart-tracks'],
    };

    const linked = deduce(
      run,
      { kind: 'deduce', clueIds: ['seen-vendor-baker', 'cart-tracks'] },
      createRng(1),
    );
    if (!linked.ok) throw new Error('Refused.');
    expect(linked.outcome).toMatchObject({ result: 'insight', deductionId: 'baker-out' });

    const accused = accuse(
      run,
      { kind: 'accuse', culpritId: 'baker', motiveInsightId: null, evidenceClueIds: ['seen-vendor-baker'] },
      createRng(1),
    );
    expect(accused.ok).toBe(true);
  });
});

describe('the validator and the clues a witness gives', () => {
  function codes(detectiveCase: DetectiveCase, requireParts = false) {
    const result = validateCase(detectiveCase, {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
      rules: { ...LEGACY_RULES, parts: requireParts },
    });
    return result.isValid ? ([] as CaseIssueCode[]) : result.issues;
  }

  it('accepts a lie that names a sighting, a sighting that no part holds, and a sighting in a place of parts', () => {
    expect(codes(buildSeenCase())).toEqual([]);

    const parted = buildSeenCase((built) => {
      const square = built.locations.find(({ id }) => id === 'market-square');
      if (square !== undefined) {
        square.parts = [
          {
            id: 'fountain',
            name: 'fountain',
            obstacle: null,
            holds: 'cellar-key',
            inQuickLook: true,
            requiresLead: null,
            fallback: null,
          },
        ];
      }
    });
    // The other places of the fixture hold clues and have no parts; the square, with its sighting, is no complaint.
    expect(JSON.stringify(codes(parted, true))).not.toContain('market-square');
  });

  it('refuses a name of a sighting the timeline does not give, and says why', () => {
    const detectiveCase = buildSeenCase((built) => {
      const lie = built.suspects.find(({ id }) => id === 'rival')?.lies[0];
      if (lie !== undefined) lie.brokenBy = ['seen-vendor-mayor'];
    });

    const issues = codes(detectiveCase);

    expect(issues).toMatchObject([{ code: 'unknown-reference', path: 'suspects[1].lies[0].brokenBy[0]' }]);
    expect(JSON.stringify(issues)).toContain('truth.timeline');
  });

  it('refuses a sighting clue of a witness or a suspect the case does not have', () => {
    const detectiveCase = buildSeenCase((built) => {
      built.clues.push({
        id: 'seen-stray',
        locationId: 'market-square',
        description: 'Somebody saw somebody.',
        discovery: null,
        situations: [],
        source: null,
        pointsTo: [],
        sightingOf: { witnessId: 'ghost', suspectId: 'nobody' },
        isRedHerring: false,
      });
    });

    expect(codes(detectiveCase).map((issue) => (typeof issue === 'string' ? issue : issue.code))).toEqual([
      'unknown-reference',
      'unknown-reference',
    ]);
  });
});
