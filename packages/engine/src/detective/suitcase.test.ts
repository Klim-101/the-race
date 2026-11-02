// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { MAX_TOOL_SLOTS, POCKET_LIMITS, START_TOOL_SLOTS } from '../progress.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { CONSUMABLE_IDS, initialSupplies, inPockets, pocketLimit, withSupplyAdded } from './consumables.js';
import { BACKGROUNDS, DETECTIVE_GEAR, startingKit, viewKit, type KitItem } from './gear.js';
import { LIFE_STATES } from './life-state.js';
import { createDetectiveRun, DetectiveRunStateSchema, viewRun, type DetectiveRunState } from './run-state.js';
import { freeSlots, suitcaseOf, takeTool } from './suitcase.js';

function newRun(toolSlots?: number): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'suitcase',
    rngState: 1,
    locale: 'en',
    toolSlots,
  });
}

const tool = (id: KitItem['id']): KitItem => ({ id, state: 'owned', suitcase: true });
const carrying = (run: DetectiveRunState, ...tools: KitItem[]): DetectiveRunState => ({
  ...run,
  kit: [...run.kit.filter(({ suitcase }) => suitcase !== true), ...tools],
});

describe('the starting kit and the slots', () => {
  it('fills one slot for a hero with nothing earned, and a slot each for one who has earned more', () => {
    for (let slots = START_TOOL_SLOTS; slots <= MAX_TOOL_SLOTS; slots += 1) {
      const kit = startingKit('police', undefined, 'slots', slots);
      const suitcase = kit.filter(({ suitcase: held }) => held === true);

      expect(suitcase).toHaveLength(slots);
      expect(new Set(kit.map(({ id }) => id)).size).toBe(kit.length);
    }
    expect(startingKit('police', undefined, 'slots')).toEqual(startingKit('police', undefined, 'slots', 1));
  });

  it('is the same for the same seed, and takes nothing from the phone or what the trade gave', () => {
    const kit = startingKit('journalist', undefined, 'again', 3);

    expect(startingKit('journalist', undefined, 'again', 3)).toEqual(kit);
    expect(kit.find(({ id }) => id === 'phone')?.suitcase).toBeUndefined();
    expect(kit.find(({ id }) => id === 'laptop')?.suitcase).toBeUndefined();
    expect(kit.filter(({ suitcase }) => suitcase === true).length).toBe(3);
  });

  it('is what a run begins with, and the run keeps the slots it was given', () => {
    const run = newRun(4);

    expect(run.toolSlots).toBe(4);
    expect(suitcaseOf(run)).toHaveLength(4);
    expect(freeSlots(run)).toBe(0);
    expect(newRun().toolSlots).toBe(START_TOOL_SLOTS);
    expect(viewRun(run).toolSlots).toEqual({ total: 4, used: 4 });
    expect(viewKit(run.kit).filter(({ suitcase }) => suitcase)).toHaveLength(4);
  });

  it('is within the slots a run is allowed, and an old save has one', () => {
    const run = newRun(2);

    expect(DetectiveRunStateSchema.safeParse({ ...run, toolSlots: 0 }).success).toBe(false);
    expect(DetectiveRunStateSchema.safeParse({ ...run, toolSlots: MAX_TOOL_SLOTS + 1 }).success).toBe(false);
    const old: Partial<DetectiveRunState> = { ...run };
    delete old.toolSlots;
    expect(DetectiveRunStateSchema.parse(old).toolSlots).toBe(START_TOOL_SLOTS);
  });
});

describe('taking a tool', () => {
  it('goes into a free slot, with its charges if it is used up', () => {
    const run = carrying(newRun(2), tool('magnifier'));

    const taken = takeTool(run, 'powder');
    const lasting = takeTool(run, 'crowbar');

    expect(taken.ok).toBe(true);
    if (!taken.ok) return;
    expect(taken.run.kit.find(({ id }) => id === 'powder')).toEqual({
      id: 'powder',
      state: 'owned',
      suitcase: true,
      charges: DETECTIVE_GEAR.powder.tool?.charges,
    });
    expect(freeSlots(taken.run)).toBe(0);
    expect(lasting.ok && lasting.run.kit.find(({ id }) => id === 'crowbar')).toEqual(tool('crowbar'));
  });

  it('is refused when there is no slot free, unless one is dropped', () => {
    const full = carrying(newRun(1), tool('magnifier'));

    expect(takeTool(full, 'knife')).toEqual({ ok: false, code: 'no-slot' });
    const swapped = takeTool(full, 'knife', 'magnifier');
    expect(swapped.ok && swapped.run.kit.map(({ id }) => id)).not.toContain('magnifier');
    expect(swapped.ok && swapped.run.kit.map(({ id }) => id)).toContain('knife');
    expect(swapped.ok && suitcaseOf(swapped.run)).toHaveLength(1);
  });

  it('is refused for what the hero already carries, and for a drop that is not in the suitcase', () => {
    const run = carrying(newRun(2), tool('magnifier'));

    expect(takeTool(run, 'magnifier')).toEqual({ ok: false, code: 'already-carried' });
    expect(takeTool(run, 'phone')).toEqual({ ok: false, code: 'already-carried' });
    expect(takeTool(run, 'knife', 'phone')).toEqual({ ok: false, code: 'not-in-suitcase' });
    expect(takeTool(run, 'knife', 'crowbar')).toEqual({ ok: false, code: 'not-in-suitcase' });
  });

  it('never drops what the trade gave: it takes no slot', () => {
    const run = carrying(newRun(1), tool('magnifier'));

    expect(freeSlots(run)).toBe(0);
    expect(run.kit.some(({ id }) => id === 'phone')).toBe(true);
    expect(takeTool(run, 'knife', 'notebook').ok).toBe(false);
  });
});

describe('the pockets', () => {
  it('hold at most two coffee and seven pills, and no other limit is invented', () => {
    expect(POCKET_LIMITS).toEqual({ coffee: 2, sedative: 7 });
    expect(pocketLimit('coffee')).toBe(2);
    expect(pocketLimit('sedative')).toBe(7);
    expect(pocketLimit('alcohol')).toBeNull();
    expect(CONSUMABLE_IDS).toContain('alcohol');
  });

  it('are never started past their limits, whatever the background and the life state', () => {
    for (const background of BACKGROUNDS) {
      for (const lifeState of [undefined, ...LIFE_STATES]) {
        const supplies = initialSupplies(background, lifeState);

        expect(supplies.coffee ?? 0).toBeLessThanOrEqual(POCKET_LIMITS.coffee);
        expect(supplies.sedative ?? 0).toBeLessThanOrEqual(POCKET_LIMITS.sedative);
      }
    }
  });

  it('cut what is over a limit and leave the rest as it is', () => {
    expect(inPockets({ coffee: 5, sedative: 9, alcohol: 4 })).toEqual({ coffee: 2, sedative: 7, alcohol: 4 });
    expect(inPockets({ coffee: 1 })).toEqual({ coffee: 1 });
  });

  it('take what fits and no more', () => {
    expect(withSupplyAdded({ coffee: 1 }, 'coffee', 3)).toEqual({ supplies: { coffee: 2 }, taken: 1 });
    expect(withSupplyAdded({}, 'sedative', 10)).toEqual({ supplies: { sedative: 7 }, taken: 7 });
    expect(withSupplyAdded({ coffee: 2 }, 'coffee', 1)).toEqual({ supplies: { coffee: 2 }, taken: 0 });
    expect(withSupplyAdded({ alcohol: 5 }, 'alcohol', 2)).toEqual({ supplies: { alcohol: 7 }, taken: 2 });
    expect(withSupplyAdded({ coffee: 1 }, 'coffee', -3).taken).toBe(0);
  });

  it('are shown with their limits', () => {
    const run = { ...newRun(), supplies: { coffee: 2, alcohol: 1 } };

    expect(viewRun(run).supplies).toMatchObject([
      { id: 'coffee', count: 2, limit: 2 },
      { id: 'alcohol', count: 1, limit: null },
    ]);
  });
});
