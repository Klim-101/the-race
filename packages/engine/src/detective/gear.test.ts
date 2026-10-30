// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { collectModifier } from '../modifiers.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { modifierSources } from './condition.js';
import {
  BACKGROUNDS,
  BACKGROUND_KITS,
  DEFAULT_BACKGROUND,
  DETECTIVE_GEAR,
  GEAR_IDS,
  gearModifiers,
  initialKit,
  viewKit,
  withGearState,
} from './gear.js';
import { DetectiveHeroSchema } from './archetype.js';
import {
  DetectiveRunStateSchema,
  createDetectiveRun,
  endRun,
  loseGear,
  replaceGear,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';

function newRun(background = buildHero().background): DetectiveRunState {
  return createDetectiveRun({
    hero: { ...buildHero(), background },
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'gear',
    rngState: 1,
    locale: 'en',
  });
}

const modifier = (run: DetectiveRunState, skill: string): number =>
  collectModifier(modifierSources(run), skill, []);

describe('the kit by background', () => {
  it('is the same for the same background and every piece is owned at the start', () => {
    for (const background of BACKGROUNDS) {
      expect(newRun(background).kit).toEqual(initialKit(background));
      expect(newRun(background).kit.map(({ id }) => id)).toEqual(BACKGROUND_KITS[background]);
      expect(newRun(background).kit.every(({ state }) => state === 'owned')).toBe(true);
    }
  });

  it('differs between backgrounds, and uses only gear that has a definition', () => {
    expect(new Set(BACKGROUNDS.map((background) => BACKGROUND_KITS[background].join())).size).toBe(
      BACKGROUNDS.length,
    );
    for (const id of GEAR_IDS) expect(DETECTIVE_GEAR[id].effects.length).toBeGreaterThan(0);
  });

  it('is a policeman for a hero who names no background', () => {
    const bare: Partial<ReturnType<typeof buildHero>> = buildHero();
    delete bare.background;
    expect(DetectiveHeroSchema.parse(bare).background).toBe(DEFAULT_BACKGROUND);
  });
});

describe('gear on checks', () => {
  it('gives its bonus through the shared modifier path while the piece is in hand', () => {
    const run = newRun('journalist');

    expect(modifier(run, 'contacts')).toBe(1);
    expect(modifier(run, 'reasoning')).toBe(1);
    expect(modifier(run, 'tech')).toBe(1);
    expect(modifier(run, 'perception')).toBe(0);
  });

  it('takes the bonus away and adds a penalty when a piece is lost, and undoes both on replacement', () => {
    const run = newRun('journalist');
    const robbed = loseGear(run, 'phone');

    expect(robbed.kit.find(({ id }) => id === 'phone')).toEqual({ id: 'phone', state: 'lost' });
    expect(modifier(robbed, 'contacts')).toBe(-1);
    expect(modifier(robbed, 'reasoning')).toBe(1);
    expect(modifier(replaceGear(robbed, 'phone'), 'contacts')).toBe(1);
    expect(replaceGear(robbed, 'phone')).toEqual(run);
  });

  it('only misses a piece that carries no extra penalty', () => {
    const robbed = loseGear(newRun('journalist'), 'notebook');

    expect(modifier(robbed, 'reasoning')).toBe(0);
  });

  it('is gone with the kit for a save that has none', () => {
    expect(gearModifiers([])).toEqual([]);
    expect(modifier({ ...newRun(), kit: [] }, 'contacts')).toBe(0);
  });
});

describe('losing and replacing gear', () => {
  it('is idempotent and pure', () => {
    const run = newRun();
    const once = loseGear(run, 'phone');

    expect(loseGear(once, 'phone')).toEqual(once);
    expect(run.kit[0]?.state).toBe('owned');
    expect(replaceGear(run, 'phone')).toEqual(run);
  });

  it('refuses gear the hero never had, a name that is no gear and a finished run', () => {
    expect(() => loseGear(newRun('police'), 'laptop')).toThrow(RangeError);
    expect(() => replaceGear(newRun('police'), 'laptop')).toThrow(RangeError);
    expect(() => loseGear(newRun(), 'sword')).toThrow();
    expect(() => loseGear(endRun(newRun(), 'gave-up'), 'phone')).toThrow(RangeError);
    expect(() => replaceGear(endRun(newRun(), 'gave-up'), 'phone')).toThrow(RangeError);
  });

  it('never changes the case, the seal or what was found, over every background and piece', () => {
    for (const background of BACKGROUNDS) {
      const run = newRun(background);
      for (const { id } of run.kit) {
        for (const next of [loseGear(run, id), replaceGear(loseGear(run, id), id)]) {
          expect(next.case).toEqual(run.case);
          expect(next.caseSeal).toBe(run.caseSeal);
          expect(next.foundClueIds).toEqual(run.foundClueIds);
          expect(next.insightIds).toEqual(run.insightIds);
          expect(DetectiveRunStateSchema.parse(next)).toEqual(next);
        }
      }
    }
  });
});

describe('the kit in the state and the view', () => {
  it('is shown to the player with the name key and the state of each piece', () => {
    const view = viewRun(loseGear(newRun('police'), 'phone')).kit;

    expect(view).toEqual([
      { id: 'phone', nameKey: 'gear.phone', state: 'lost' },
      { id: 'notebook', nameKey: 'gear.notebook', state: 'owned' },
    ]);
    expect(viewKit([])).toEqual([]);
  });

  it('parses an old save without a kit as an empty one, and refuses a piece twice', () => {
    const old: Partial<DetectiveRunState> = newRun();
    delete old.kit;
    expect(DetectiveRunStateSchema.parse(old).kit).toEqual([]);

    const twice = { ...newRun(), kit: [...initialKit('police'), ...initialKit('police')] };
    expect(DetectiveRunStateSchema.safeParse(twice).success).toBe(false);
  });

  it('refuses to change the state of a piece that is not in the kit', () => {
    expect(() => withGearState([], 'phone', 'lost')).toThrow(RangeError);
  });
});
