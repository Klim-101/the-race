// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';
import { deriveSightingClues, sightingsOf, witnessesHere } from './witnesses.js';

const at = (hour: number): number => hour * 60;
const VICTIM = 'Pieter Vane, the stallholder';
/** The visiting hours of the place where the victim lies, and the hours they can be asked in. */
const VISITING = { fromMinute: at(14), untilMinute: at(18) };

type Raw = ReturnType<typeof buildCheeseCase>;

/**
 * The cheese case as an attempt whose victim lies at the market square (a ward), asked between 14:00 and 18:00. The culprit,
 * the baker, passed the square at 01:50 and the rival stood there at 02:00, so a witness of the square would have seen both.
 */
function attempt(
  options: { fate?: string; name?: string; second?: boolean; form?: string; plain?: boolean } = {},
): Raw {
  const raw = buildCheeseCase();
  raw.truth.timeline.push({
    atMinute: 110,
    actorId: 'baker',
    locationId: 'market-square',
    action: 'Passes the square.',
  });
  Object.assign(raw, { form: options.form ?? 'homicide' });
  Object.assign(raw.truth, { homicide: { victim: { name: VICTIM }, fate: options.fate ?? 'attempt' } });
  const ward = raw.locations.find(({ id }) => id === 'market-square');
  Object.assign(ward ?? {}, { hours: VISITING });
  const witness = {
    id: 'victim-witness',
    locationId: 'market-square',
    name: options.name ?? VICTIM,
    persona: 'A man in a hospital bed who remembers little of that night.',
    hours: { fromMinute: 0, untilMinute: 1439 },
    ...(options.plain === true ? {} : { victim: true }),
  };
  Object.assign(raw, {
    witnesses: [witness, ...(options.second === true ? [{ ...witness, id: 'second' }] : [])],
  });
  return raw;
}

function run(raw: Raw, minute = at(15), seed = 'victim'): DetectiveRunState {
  const created = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(raw),
    seed,
    rngState: createRng(seed).state(),
    locale: 'en',
  });
  return { ...created, clock: { day: 1, minute }, locationId: 'market-square' };
}

describe('the victim of an attempt as a witness, in the case', () => {
  it('is accepted for an attempt, with the name of the victim', () => {
    expect(DetectiveCaseSchema.safeParse(attempt()).success).toBe(true);
  });

  it('is refused for any other form, for a killed victim, for another name and for a second victim', () => {
    expect(DetectiveCaseSchema.safeParse(attempt({ fate: 'death' })).success).toBe(false);
    expect(DetectiveCaseSchema.safeParse(attempt({ name: 'Somebody else' })).success).toBe(false);
    expect(DetectiveCaseSchema.safeParse(attempt({ second: true })).success).toBe(false);
    const whodunit = buildCheeseCase();
    Object.assign(whodunit, {
      witnesses: [
        {
          id: 'pretender',
          locationId: 'market-square',
          name: VICTIM,
          persona: 'Says he was the victim.',
          hours: { fromMinute: 0, untilMinute: 1439 },
          victim: true,
        },
      ],
    });
    expect(DetectiveCaseSchema.safeParse(whodunit).success).toBe(false);
  });

  it('is a witness like any other for a case with none, which is as it was', () => {
    expect(JSON.stringify(DetectiveCaseSchema.parse(buildCheeseCase()))).not.toContain('victim');
  });
});

describe('what the victim saw', () => {
  const parsed = DetectiveCaseSchema.parse(attempt());
  const plain = DetectiveCaseSchema.parse(attempt({ plain: true }));
  const victim = parsed.witnesses?.[0];
  const ordinary = plain.witnesses?.[0];
  if (victim === undefined || ordinary === undefined) throw new Error('No witness.');

  it('never has the culprit in it, though the culprit was at their place in their hours', () => {
    expect(
      sightingsOf(plain, ordinary)
        .map(({ suspectId }) => suspectId)
        .toSorted(),
    ).toEqual(['baker', 'rival']);
    expect(sightingsOf(parsed, victim).map(({ suspectId }) => suspectId)).toEqual(['rival']);
  });

  it('gives no clue that names the culprit, however it is asked or derived', () => {
    const derived = deriveSightingClues(parsed, ({ suspectName }) => `Seen: ${suspectName}.`);
    const ids = derived.clues.map(({ id }) => id).filter((id) => id.startsWith('seen-victim-witness-'));

    expect(ids).toEqual(['seen-victim-witness-rival']);
    expect(sightingsOf(parsed, victim, 'baker')).toEqual([]);
  });

  it('is told by asking them, over many seeds, and never names the culprit', () => {
    const told = new Set<string>();
    for (let index = 0; index < 60; index += 1) {
      const start = run(attempt(), at(15), `ask-${String(index)}`);
      for (const about of [undefined, 'baker', 'rival']) {
        const resolution = resolveIntent(
          start,
          {
            kind: 'ask',
            witnessId: 'victim-witness',
            ...(about === undefined ? {} : { aboutSuspectId: about }),
          },
          restoreRng(start.rngState),
        );
        if (!resolution.ok || resolution.outcome.kind !== 'ask') continue;
        for (const { suspectId } of resolution.outcome.witness?.sightings ?? []) told.add(suspectId);
      }
    }

    expect([...told]).toEqual(['rival']);
  });
});

describe('visiting the victim', () => {
  it('is possible only in the visiting hours of the place, which gate the way in', () => {
    const elsewhere = (minute: number) => ({ ...run(attempt(), minute), locationId: 'cheese-stall' });
    const go = (state: DetectiveRunState) =>
      resolveIntent(state, { kind: 'move', locationId: 'market-square' }, restoreRng(state.rngState));

    expect(go(elsewhere(at(10)))).toMatchObject({ ok: false, refusal: { code: 'closed-hours' } });
    expect(go(elsewhere(at(15))).ok).toBe(true);
  });

  it('is shown in the view as the victim, only while they can be asked', () => {
    expect(viewRun(run(attempt())).witnesses).toEqual([
      expect.objectContaining({ id: 'victim-witness', victim: true }),
    ]);
    const shut = DetectiveCaseSchema.parse(attempt());
    const narrow = {
      ...shut,
      witnesses: (shut.witnesses ?? []).map((witness) => ({
        ...witness,
        hours: { fromMinute: at(9), untilMinute: at(10) },
      })),
    };
    const later = { ...run(attempt()), case: narrow };

    expect(witnessesHere(later)).toEqual([]);
  });
});
