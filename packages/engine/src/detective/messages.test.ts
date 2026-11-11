// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, restoreRng, type Rng } from '../dice.js';
import { DAY_START_MINUTE } from '../run.js';
import { ABDUCTION_RULESET_VERSION } from './abduction.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema, type ClueMessage } from './case-schema.js';
import { createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';
import { CALL_WINDOW_MINUTES, deliverMessages } from './messages.js';

const base = DetectiveCaseSchema.parse(buildCheeseCase());
const CLUE = base.clues[0]?.id ?? '';
const PLACE = base.clues[0]?.locationId ?? '';
const ELSEWHERE = base.locations.find(({ id }) => id !== PLACE)?.id ?? '';
/** 17:00 of the first day. */
const ARRIVES = 17 * 60;

function abductionCase(message: unknown) {
  const raw = buildCheeseCase();
  return {
    ...raw,
    form: 'abduction',
    clues: raw.clues.map((clue, index) => (index === 0 ? { ...clue, message } : clue)),
    truth: {
      ...raw.truth,
      abduction: { victim: { kind: 'pet', name: 'Gouda' }, whereabouts: PLACE, deadlineMinute: 9999 },
    },
  };
}

function runWith(message: ClueMessage, clock = { day: 1, minute: ARRIVES }): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(abductionCase(message)),
    seed: 'messages',
    rngState: 1,
    locale: 'en',
  });
  return { ...run, clock, locationId: PLACE };
}

const text: ClueMessage = { channel: 'text', arrivesAtMinute: ARRIVES };
const call: ClueMessage = { channel: 'call', arrivesAtMinute: ARRIVES };
const note: ClueMessage = { channel: 'note', arrivesAtMinute: ARRIVES };
const at = (run: DetectiveRunState, minute: number, day = 1): DetectiveRunState => ({
  ...run,
  clock: { day, minute },
});

describe('a message that comes by itself', () => {
  it('does not come before its time, whatever its channel', () => {
    for (const message of [text, call, note]) {
      const delivered = deliverMessages(at(runWith(message), ARRIVES - 1));

      expect(delivered.arrived).toEqual([]);
      expect(delivered.run.foundClueIds).not.toContain(CLUE);
    }
  });

  it('comes on time, as a clue found where the hero stood', () => {
    for (const message of [text, call, note]) {
      const delivered = deliverMessages(runWith(message));

      expect(delivered.arrived).toEqual([{ clueId: CLUE, channel: message.channel }]);
      expect(delivered.run.foundClueIds).toContain(CLUE);
      expect(delivered.run.history.finds.at(-1)).toMatchObject({ clueId: CLUE, locationId: PLACE });
    }
  });

  it('comes once, and a clue already in hand is not told again', () => {
    const first = deliverMessages(runWith(text));
    const again = deliverMessages(first.run);

    expect(again.arrived).toEqual([]);
    expect(again.run).toBe(first.run);
  });

  it('can come on a later day, the time being a minute of the run and not of the day', () => {
    const message: ClueMessage = { channel: 'text', arrivesAtMinute: 1440 + 600 };

    expect(deliverMessages(at(runWith(message), 20 * 60, 1)).arrived).toEqual([]);
    expect(deliverMessages(at(runWith(message), 10 * 60, 2)).arrived).toHaveLength(1);
  });

  describe('a call', () => {
    it('can be taken until the window closes', () => {
      expect(deliverMessages(at(runWith(call), ARRIVES + CALL_WINDOW_MINUTES)).arrived).toHaveLength(1);
    });

    it('is missed once the window has closed, and is not delivered later', () => {
      const missed = deliverMessages(at(runWith(call), ARRIVES + CALL_WINDOW_MINUTES + 1));

      expect(missed.arrived).toEqual([]);
      expect(deliverMessages(at(missed.run, ARRIVES + 300)).arrived).toEqual([]);
    });

    it('is missed by a hero who slept through it, but a text is read in the morning', () => {
      const evening: ClueMessage = { channel: 'call', arrivesAtMinute: 1440 + 60 };

      expect(deliverMessages(at(runWith(evening), DAY_START_MINUTE, 2)).arrived).toEqual([]);
      expect(
        deliverMessages(at(runWith({ ...evening, channel: 'text' }), DAY_START_MINUTE, 2)).arrived,
      ).toHaveLength(1);
    });
  });

  describe('a note', () => {
    it('waits for the hero who is away, and is read when they come', () => {
      const away = { ...at(runWith(note), ARRIVES + 300), locationId: ELSEWHERE };

      expect(deliverMessages(away).arrived).toEqual([]);
      expect(deliverMessages({ ...away, locationId: PLACE }).arrived).toHaveLength(1);
    });
  });

  it('is not delivered in a run of a ruleset before abductions, nor to a run that is over', () => {
    const old = { ...runWith(text), rulesetVersion: ABDUCTION_RULESET_VERSION - 1 };
    const over: DetectiveRunState = { ...runWith(text), status: 'lost', endReason: 'deadline-passed' };

    expect(deliverMessages(old).arrived).toEqual([]);
    expect(deliverMessages(over).arrived).toEqual([]);
  });

  it('is told in the turn that brought it, and a missed call is not', () => {
    // A rest runs into the night, so a text of the evening is read at the first turn of the morning.
    const read = resolveIntent(at(runWith(text), ARRIVES - 5), { kind: 'rest' }, restoreRng(1));
    const missed = resolveIntent(at(runWith(call), ARRIVES - 5), { kind: 'rest' }, restoreRng(1));

    expect(read).toMatchObject({ ok: true, newMessages: [{ clueId: CLUE, channel: 'text' }] });
    expect(missed).toMatchObject({ ok: true, newMessages: [] });
  });
});

describe('the schema of a message', () => {
  const whodunitWith = (form: string | undefined) => {
    const raw = buildCheeseCase();
    return {
      ...raw,
      ...(form === undefined ? {} : { form }),
      clues: raw.clues.map((clue, index) => (index === 0 ? { ...clue, message: text } : clue)),
    };
  };

  it('is accepted in an abduction', () => {
    expect(DetectiveCaseSchema.safeParse(abductionCase(text)).success).toBe(true);
  });

  it('is refused in a whodunit, said or unsaid', () => {
    expect(DetectiveCaseSchema.safeParse(whodunitWith('whodunit')).success).toBe(false);
    expect(DetectiveCaseSchema.safeParse(whodunitWith(undefined)).success).toBe(false);
  });

  it('is refused with a channel that is not one, or a time that is not a minute of the run', () => {
    const pigeon = abductionCase({ channel: 'pigeon', arrivesAtMinute: 5 });
    const zero = abductionCase({ channel: 'text', arrivesAtMinute: 0 });

    expect(DetectiveCaseSchema.safeParse(pigeon).success).toBe(false);
    expect(DetectiveCaseSchema.safeParse(zero).success).toBe(false);
  });
});

describe('tracing a message', () => {
  /** A seed whose first d20 roll is `die`. */
  const dice = (die: number): Rng => {
    for (let seed = 0; ; seed += 1) if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  };
  /** The message is a text from a number; studied, it shows a place that was not on the map. */
  function tracing(): DetectiveRunState {
    const raw = abductionCase(text);
    raw.locations.push({
      id: 'boathouse',
      name: 'Old boathouse',
      description: 'Damp planks and the smell of tar.',
      connections: ['market-square'],
      access: { kind: 'open' },
      requiresLead: 'the-number',
    });
    (raw as unknown as { leads: object[] }).leads = [
      {
        id: 'the-number',
        reason: 'The number is a pay phone by the boats.',
        earnedBy: { kind: 'study', clueId: CLUE },
      },
    ];
    const run = createDetectiveRun({
      hero: buildHero(),
      traits: [],
      case: DetectiveCaseSchema.parse(raw),
      seed: 'trace',
      rngState: 1,
      locale: 'en',
    });
    // Only the phone, so that the camera's twelve is the number to beat.
    const phoneOnly = { ...run, kit: [{ id: 'phone' as const, state: 'owned' as const }] };
    return deliverMessages({ ...phoneOnly, clock: { day: 1, minute: ARRIVES }, locationId: 'market-square' })
      .run;
  }
  const mapOf = (run: DetectiveRunState): string[] => viewRun(run).map.places.map(({ id }) => id);
  const studied = (run: DetectiveRunState, die: number) =>
    resolveIntent(run, { kind: 'study', clueId: CLUE }, dice(die));

  it('shows a place on the map when the message is studied well, and not before', () => {
    const run = tracing();
    // The phone's camera: perception 12.
    const sharp = studied(run, 12 - buildHero().skills.perception);

    expect(mapOf(run)).not.toContain('boathouse');
    expect(sharp.ok && sharp.newLeadIds).toEqual(['the-number']);
    expect(sharp.ok && mapOf(sharp.run)).toContain('boathouse');
  });

  it('costs time and shows nothing when the trace comes to nothing, and may be tried again', () => {
    const run = tracing();
    const blurred = studied(run, 12 - buildHero().skills.perception - 1);

    expect(blurred.ok && blurred.newLeadIds).toEqual([]);
    expect(blurred.ok && mapOf(blurred.run)).not.toContain('boathouse');
    expect(blurred.ok && studied(blurred.run, 20).ok).toBe(true);
  });
});

describe('a report of a homicide', () => {
  const report: ClueMessage = { channel: 'report', arrivesAtMinute: ARRIVES };

  function homicideCase(message: unknown, form = 'homicide') {
    const raw = buildCheeseCase();
    return {
      ...raw,
      form,
      clues: raw.clues.map((clue, index) => (index === 0 ? { ...clue, message } : clue)),
      truth: {
        ...raw.truth,
        ...(form === 'homicide' ? { homicide: { victim: { name: 'Pieter Vane' }, fate: 'attempt' } } : {}),
        ...(form === 'abduction'
          ? {
              abduction: { victim: { kind: 'pet', name: 'Gouda' }, whereabouts: PLACE, deadlineMinute: 9999 },
            }
          : {}),
      },
    };
  }

  function homicideRun(clock = { day: 1, minute: ARRIVES }): DetectiveRunState {
    const run = createDetectiveRun({
      hero: buildHero(),
      traits: [],
      case: DetectiveCaseSchema.parse(homicideCase(report)),
      seed: 'reports',
      rngState: 1,
      locale: 'en',
    });
    return { ...run, clock, locationId: ELSEWHERE };
  }

  it('is a message of a homicide and of no other form, which have notes, calls and texts', () => {
    expect(DetectiveCaseSchema.safeParse(homicideCase(report)).success).toBe(true);
    expect(DetectiveCaseSchema.safeParse(homicideCase(report, 'abduction')).success).toBe(false);
    expect(DetectiveCaseSchema.safeParse(homicideCase(report, 'whodunit')).success).toBe(false);
    for (const message of [text, call, note]) {
      expect(DetectiveCaseSchema.safeParse(homicideCase(message)).success).toBe(false);
    }
    expect(DetectiveCaseSchema.safeParse(abductionCase(text)).success).toBe(true);
  });

  it('does not come before its time, and comes wherever the hero is, however late', () => {
    expect(deliverMessages(at(homicideRun(), ARRIVES - 1)).arrived).toEqual([]);
    for (const minute of [ARRIVES, ARRIVES + CALL_WINDOW_MINUTES + 1, ARRIVES + 600]) {
      const delivered = deliverMessages(at(homicideRun(), minute));

      expect(delivered.arrived).toEqual([{ clueId: CLUE, channel: 'report' }]);
      expect(delivered.run.foundClueIds).toContain(CLUE);
    }
  });

  it('comes once, in the turn after its time, and is told with that turn', () => {
    const run = homicideRun({ day: 1, minute: ARRIVES - 30 });

    const before = resolveIntent(run, { kind: 'look' }, restoreRng(run.rngState));
    const after = resolveIntent(
      { ...run, clock: { day: 1, minute: ARRIVES + 20 } },
      { kind: 'look' },
      restoreRng(run.rngState),
    );
    if (!before.ok || !after.ok) throw new Error('Refused.');
    const again = resolveIntent(after.run, { kind: 'look' }, restoreRng(after.run.rngState));

    expect(before.newMessages).toEqual([]);
    expect(after.newMessages).toEqual([{ clueId: CLUE, channel: 'report' }]);
    expect(after.run.foundClueIds).toContain(CLUE);
    expect(again.ok && again.newMessages).toEqual([]);
  });
});
