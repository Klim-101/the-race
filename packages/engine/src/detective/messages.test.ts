// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { restoreRng } from '../dice.js';
import { DAY_START_MINUTE } from '../run.js';
import { ABDUCTION_RULESET_VERSION } from './abduction.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema, type ClueMessage } from './case-schema.js';
import { createDetectiveRun, type DetectiveRunState } from './run-state.js';
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
