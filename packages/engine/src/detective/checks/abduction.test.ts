// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import { createRng } from '../../dice.js';
import { MOVE_MINUTES } from '../actions.js';
import type { CaseIssue } from '../case-issue.js';
import { validateCase } from '../case-validator.js';
import { DETECTIVE_TRAITS } from '../traits.js';

type Raw = ReturnType<typeof buildCheeseCase>;

const base = buildCheeseCase();
const CULPRIT_NAME = 'Orla Brenn';
/** A place a clue of the first evidence chain lies in. */
const LED_PLACE = (
  base.clues.find(({ id }) => id === base.solution.evidenceChains[0]?.[0]) as { locationId: string }
).locationId;
/** 23:00 of the third day, the last of the case. */
const DEADLINE = 4260;

function messageClue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ransom-text',
    locationId: 'market-square',
    description: 'A text from an unknown number: "She is cold, but she is fine."',
    discovery: null,
    pointsTo: [],
    isRedHerring: false,
    message: { channel: 'text', arrivesAtMinute: 1600 },
    ...overrides,
  };
}

function abduction(change: (built: Raw) => void = () => undefined): Raw {
  const built = buildCheeseCase();
  built.form = 'abduction';
  built.truth.abduction = {
    victim: { kind: 'pet', name: 'Gouda' },
    whereabouts: LED_PLACE,
    deadlineMinute: DEADLINE,
  };
  built.clues.push(messageClue());
  // The place is named by a clue of the other chain, found outside it: this is how the hero is led there.
  (built.clues.find(({ id }) => id === 'cart-tracks') as { description: string }).description +=
    ' Cheese rinds in the tracks, from the cheese stall.';
  change(built);
  return built;
}

function issuesOf(input: unknown, traits = [] as typeof DETECTIVE_TRAITS): CaseIssue[] {
  const result = validateCase(input, { hero: buildHero(), traits, locale: 'en', realNames: [] });
  return result.isValid ? [] : [...result.issues];
}
const codesOf = (input: unknown): string[] => issuesOf(input).map(({ code }) => code);

describe('the fairness of an abduction', () => {
  it('accepts a fair abduction with its message', () => {
    expect(issuesOf(abduction())).toEqual([]);
  });

  it('has nothing to judge in a whodunit', () => {
    expect(issuesOf(buildCheeseCase())).toEqual([]);
  });

  describe('the deadline', () => {
    it('is no later than the end of the case', () => {
      const end = base.clock.days * 1440;
      const late = abduction((c) => {
        c.truth.abduction = { ...(c.truth.abduction as object), deadlineMinute: end + 1 };
      });
      const last = abduction((c) => {
        c.truth.abduction = { ...(c.truth.abduction as object), deadlineMinute: end };
        (c.clues[c.clues.length - 1] as { message: object }).message = {
          channel: 'text',
          arrivesAtMinute: 1600,
        };
      });

      expect(codesOf(late)).toEqual(['deadline-out-of-range']);
      expect(codesOf(last)).toEqual([]);
    });

    it('falls on the last day of the case: the run ends there, so no day after it is shown', () => {
      const early = abduction((c) => {
        c.truth.abduction = { ...(c.truth.abduction as object), deadlineMinute: 2820 };
      });

      expect(issuesOf(early)).toMatchObject([{ code: 'deadline-out-of-range', path: 'clock.days' }]);
      expect(issuesOf(early)[0]?.message).toContain('"clock.days" to 2');
      // Midnight closing the last day is still that day.
      expect(
        codesOf(
          abduction((c) => {
            c.truth.abduction = { ...(c.truth.abduction as object), deadlineMinute: 3 * 1440 };
          }),
        ),
      ).not.toContain('deadline-out-of-range');
    });

    it('leaves the hero time to walk to the victim, from 08:00 of the first day', () => {
      // The place is a step from the start; the deadline falls before the hero can be there.
      const walk = abduction((c) => {
        c.truth.abduction = {
          ...(c.truth.abduction as object),
          whereabouts: 'cheese-stall',
          deadlineMinute: 480 + MOVE_MINUTES - 1,
        };
        c.clues = c.clues.filter(({ id }) => id !== 'ransom-text');
      });

      expect(codesOf(walk)).toContain('deadline-too-short');
    });

    it('is not asked to fit a proof that cannot be gathered at all: other checks say so', () => {
      const hopeless = abduction((c) => {
        for (const id of ['flour-crumbs', 'cart-tracks', 'oven-receipt']) {
          (c.clues.find((clue) => clue.id === id) as { discovery: object }).discovery = {
            skill: 'perception',
            difficulty: 30,
          };
        }
      });

      expect(codesOf(hopeless)).toContain('unobtainable-evidence');
      expect(codesOf(hopeless)).not.toContain('deadline-too-short');
    });

    it('leaves the hero time to gather the cheapest chain of proof', () => {
      const short = abduction((c) => {
        c.truth.abduction = { ...(c.truth.abduction as object), deadlineMinute: 540 };
        // The deadline is on the first day, so the case is one day long.
        c.clock = { days: 1, worldEvents: [] };
        c.clues = c.clues.filter(({ id }) => id !== 'ransom-text');
      });

      expect(issuesOf(short)).toMatchObject([
        { code: 'deadline-too-short', path: 'truth.abduction.deadlineMinute' },
      ]);
    });
  });

  describe('the victim place', () => {
    /** A place off the square that no clue of a chain lies in, where the victim is kept. */
    const withBoathouse = (c: Raw, access: object = { kind: 'open' }): void => {
      (c.locations.find(({ id }) => id === 'market-square') as { connections: string[] }).connections.push(
        'boathouse',
      );
      c.locations.push({
        id: 'boathouse',
        name: 'Old boathouse',
        description: 'Damp planks and the smell of tar.',
        connections: [],
        access,
      });
      c.truth.abduction = { ...(c.truth.abduction as object), whereabouts: 'boathouse' };
    };

    it('is one the hero can enter', () => {
      const shut = abduction((c) => {
        withBoathouse(c, { kind: 'skill', check: { skill: 'social', difficulty: 30 } });
      });

      expect(codesOf(shut)).toContain('victim-place-unreachable');
      expect(codesOf(shut)).not.toContain('deadline-too-short');
    });

    it('is led to by some chain: a clue of a chain, found outside it, names it, opens the way in or earns the lead', () => {
      const unled = abduction((c) => {
        withBoathouse(c);
      });
      const named = abduction((c) => {
        withBoathouse(c);
        (c.clues.find(({ id }) => id === 'flour-crumbs') as { description: string }).description +=
          ' Tar on it, from the old boathouse.';
      });
      const opens = abduction((c) => {
        withBoathouse(c, { kind: 'clue', clueId: 'flour-crumbs' });
      });
      const leads = abduction((c) => {
        withBoathouse(c);
        (c.locations.find(({ id }) => id === 'boathouse') as { requiresLead?: string }).requiresLead =
          'boathouse-lead';
        (c as unknown as { leads: object[] }).leads = [
          { id: 'boathouse-lead', reason: 'Tar.', earnedBy: { kind: 'clue', clueId: 'flour-crumbs' } },
        ];
      });

      expect(codesOf(unled)).toContain('victim-place-unled');
      expect(issuesOf(unled).find(({ code }) => code === 'victim-place-unled')?.path).toBe(
        'truth.abduction.whereabouts',
      );
      for (const led of [named, opens, leads]) expect(codesOf(led)).not.toContain('victim-place-unled');
    });

    it('is not led to by a clue that lies in it, even a clue of a chain that names it', () => {
      const lies = abduction((c) => {
        withBoathouse(c);
        const clue = c.clues.find(({ id }) => id === 'flour-crumbs') as {
          description: string;
          locationId: string;
        };
        clue.locationId = 'boathouse';
        clue.description += ' Tar on it, from the old boathouse.';
      });

      expect(codesOf(lies)).toContain('victim-place-unled');
    });

    it('is not led to by a clue the hero could reach only by passing through it', () => {
      // The mayor office is a door past the cheese stall: from outside the stall its clues cannot be had.
      const behind = abduction((c) => {
        c.clues.find(({ id }) => id === 'cart-tracks')!.description = 'Round tracks of something heavy.';
        (c.clues.find(({ id }) => id === 'oven-receipt') as { description: string }).description +=
          ' Folded in a leaflet of the cheese stall.';
      });

      expect(codesOf(behind)).toContain('victim-place-unled');
    });

    it('is walked to in time: the clue that leads there is gathered, then the way is walked', () => {
      // The oven receipt (65 minutes) names the boathouse, which is three steps from the mayor office.
      const named = (deadlineMinute: number): Raw =>
        abduction((c) => {
          withBoathouse(c);
          c.truth.abduction = { ...(c.truth.abduction as object), deadlineMinute };
          // The deadline is on the first day, so the case is one day long.
          c.clock = { days: 1, worldEvents: [] };
          c.clues = c.clues.filter(({ id }) => id !== 'ransom-text');
          c.clues.find(({ id }) => id === 'cart-tracks')!.description = 'Round tracks of something heavy.';
          (c.clues.find(({ id }) => id === 'oven-receipt') as { description: string }).description +=
            ' Tar on it, from the old boathouse.';
        });

      expect(issuesOf(named(480 + 100))).toMatchObject([
        { code: 'deadline-too-short', path: 'truth.abduction.deadlineMinute' },
      ]);
      expect(codesOf(named(480 + 65 + 3 * MOVE_MINUTES))).toEqual([]);
    });

    it('is not timed by a clue that can only be had from a person: the plan of a search does not reach it', () => {
      const told = abduction((c) => {
        withBoathouse(c);
        const crumbs = c.clues.find(({ id }) => id === 'flour-crumbs') as {
          description: string;
          discovery: object;
        };
        crumbs.discovery = { skill: 'perception', difficulty: 30 };
        crumbs.description += ' Tar on it, from the old boathouse.';
        (c.suspects.find(({ id }) => id === 'rival')!.lies[0] as { gives?: string }).gives = 'flour-crumbs';
      });

      expect(codesOf(told)).not.toContain('victim-place-unled');
      expect(codesOf(told)).not.toContain('deadline-too-short');
    });

    it('is not timed by a way the hero cannot walk: another check says the place is shut', () => {
      const shut = abduction((c) => {
        withBoathouse(c, { kind: 'skill', check: { skill: 'social', difficulty: 30 } });
        (c.clues.find(({ id }) => id === 'flour-crumbs') as { description: string }).description +=
          ' Tar on it, from the old boathouse.';
      });

      expect(codesOf(shut)).toContain('victim-place-unreachable');
      expect(codesOf(shut)).not.toContain('deadline-too-short');
    });

    it('needs no leading when the hero starts there', () => {
      const here = abduction((c) => {
        c.truth.abduction = { ...(c.truth.abduction as object), whereabouts: 'market-square' };
      });

      expect(codesOf(here)).not.toContain('victim-place-unled');
    });

    it('is not led to by a lead that no clue of a chain earns, nor by a name in a text not yet written', () => {
      const other = abduction((c) => {
        withBoathouse(c);
        (c.locations.find(({ id }) => id === 'boathouse') as { requiresLead?: string }).requiresLead =
          'boathouse-lead';
        (c as unknown as { leads: object[] }).leads = [
          { id: 'boathouse-lead', reason: 'Tar.', earnedBy: { kind: 'clue', clueId: 'ransom-text' } },
        ];
      });
      const frame = abduction((c) => {
        withBoathouse(c);
        (c.clues.find(({ id }) => id === 'flour-crumbs') as { description: string }).description +=
          ' From the old boathouse.';
      });

      const talk = abduction((c) => {
        withBoathouse(c);
        (c.locations.find(({ id }) => id === 'boathouse') as { requiresLead?: string }).requiresLead =
          'boathouse-lead';
        (c as unknown as { leads: object[] }).leads = [
          { id: 'boathouse-lead', reason: 'Tar.', earnedBy: { kind: 'talk', suspectId: 'baker' } },
        ];
      });

      expect(codesOf(other)).toContain('victim-place-unled');
      expect(codesOf(talk)).toContain('victim-place-unled');
      const result = validateCase(frame, {
        hero: buildHero(),
        traits: [],
        locale: 'en',
        realNames: [],
        frame: true,
      });
      expect(!result.isValid && result.issues.map(({ code }) => code)).toContain('victim-place-unled');
    });
  });

  describe('the weekdays', () => {
    it('are named in no text: the premise, a clue or a message, wherever the text is', () => {
      const named = abduction((c) => {
        c.premise = 'The treaty is signed by 18:00 on Friday, or it is void.';
        c.clues.find(({ id }) => id === 'ransom-text')!.description = 'A text: "Gouda is fine, come Monday."';
      });
      const issues = issuesOf(named).filter(({ code }) => code === 'weekday-named');

      expect(issues.map(({ path }) => path)).toEqual(['premise', 'clues[6].description']);
      expect(issues[0]?.message).toContain('Friday');
    });

    it('are judged only once the texts are written, and only in an abduction', () => {
      const frame = abduction((c) => {
        c.premise = 'Signed by Friday.';
      });
      const result = validateCase(frame, {
        hero: buildHero(),
        traits: [],
        locale: 'en',
        realNames: [],
        frame: true,
      });
      const whodunit = buildCheeseCase();
      whodunit.premise = 'Signed by Friday.';

      expect(!result.isValid && result.issues.map(({ code }) => code)).not.toContain('weekday-named');
      expect(codesOf(whodunit)).not.toContain('weekday-named');
    });
  });

  describe('a message', () => {
    it('arrives before the deadline', () => {
      const onTime = abduction((c) => {
        (c.clues[c.clues.length - 1] as { message: object }).message = {
          channel: 'call',
          arrivesAtMinute: DEADLINE - 1,
        };
      });
      const late = abduction((c) => {
        (c.clues[c.clues.length - 1] as { message: object }).message = {
          channel: 'call',
          arrivesAtMinute: DEADLINE,
        };
      });

      expect(codesOf(onTime)).toEqual([]);
      expect(issuesOf(late)).toMatchObject([
        { code: 'message-after-deadline', path: 'clues[6].message.arrivesAtMinute' },
      ]);
    });

    it('does not name the culprit, by name, by id or by a word of the name', () => {
      const texts = [
        `Text: ${CULPRIT_NAME} has her.`,
        'Text: baker has her.',
        `Text: ${CULPRIT_NAME.split(' ')[0] ?? ''} says she is fine.`,
      ];
      for (const description of texts) {
        const named = abduction((c) => {
          (c.clues[c.clues.length - 1] as { description: string }).description = description;
        });

        expect(codesOf(named)).toContain('message-names-culprit');
      }
    });

    it('does not name a trait of the hero', () => {
      const trait = DETECTIVE_TRAITS[0];
      if (trait === undefined) throw new Error('No trait.');
      const named = abduction((c) => {
        (c.clues[c.clues.length - 1] as { description: string }).description =
          `Text: ${trait.id} is what you are.`;
      });

      expect(codesOf(named)).not.toContain('message-names-trait');
      expect(issuesOf(named, [trait]).map(({ code }) => code)).toContain('message-names-trait');
    });

    it('is judged by what it says only once it is written', () => {
      const result = validateCase(
        abduction((c) => {
          (c.clues[c.clues.length - 1] as { description: string }).description = `${CULPRIT_NAME} has her.`;
        }),
        { hero: buildHero(), traits: [], locale: 'en', realNames: [], frame: true },
      );

      expect(result.isValid ? [] : result.issues.map(({ code }) => code)).not.toContain(
        'message-names-culprit',
      );
    });
  });

  it('holds over many seeds: out of range exactly past the end, a message late exactly from the deadline', () => {
    const end = base.clock.days * 1440;
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = createRng(seed);
      const deadline = 600 + Math.floor(rng.next() * (end + 400 - 600));
      const arrives = 1 + Math.floor(rng.next() * (end + 400));
      const codes = codesOf(
        abduction((c) => {
          c.truth.abduction = { ...(c.truth.abduction as object), deadlineMinute: deadline };
          (c.clues[c.clues.length - 1] as { message: object }).message = {
            channel: 'text',
            arrivesAtMinute: arrives,
          };
        }),
      );

      const lastDay = Math.floor((deadline - 1) / 1440) + 1 === base.clock.days;
      expect(codes.includes('deadline-out-of-range'), `seed ${String(seed)}`).toBe(
        deadline > end || !lastDay,
      );
      expect(codes.includes('message-after-deadline'), `seed ${String(seed)}`).toBe(arrives >= deadline);
    }
  });
});
