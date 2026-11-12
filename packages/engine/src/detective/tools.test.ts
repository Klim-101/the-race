// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { MAX_REPUTATION } from '../run.js';
import { FAILED_SEARCH_MINUTES, PART_SEARCH_MINUTES, resolveIntent, type Resolved } from './actions.js';
import { DetectiveCaseSchema, OBSTACLE_KINDS, type ObstacleKind } from './case-schema.js';
import {
  BACKGROUNDS,
  BACKGROUND_KITS,
  BACKGROUND_TOOL_LEAN,
  DETECTIVE_GEAR,
  GEAR_IDS,
  chargesLeft,
  gearModifiers,
  startingKit,
  viewKit,
  worn,
  type GearId,
  type KitItem,
} from './gear.js';
import { RISK_RULESET_VERSION } from './risk.js';
import { SEARCH_ATTEMPT_RULESET_VERSION, TOOLS_RULESET_VERSION, chooseTool } from './search-parts.js';
import {
  createDetectiveRun,
  loseGear,
  moveTo,
  viewRun,
  wearTool,
  type DetectiveRunState,
} from './run-state.js';

/** A seed whose first d20 roll is `die`, so that a test can choose how a check goes. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

const owned = (id: GearId, charges?: number): KitItem => ({
  id,
  state: 'owned',
  ...(charges === undefined ? {} : { charges }),
});

/**
 * The cheese case where the key under the fountain's edge is behind `obstacle`; the hero has looked round the
 * square. It is the ruleset before the risk of an unlawful tool, unless one is given (see `risk.test.ts`).
 */
function runWith(
  obstacle: ObstacleKind | null,
  kit: readonly KitItem[],
  ruleset = RISK_RULESET_VERSION - 1,
): DetectiveRunState {
  const detectiveCase = buildCheeseCase();
  const square = detectiveCase.locations.find((place) => place.id === 'market-square');
  if (square !== undefined) {
    square.parts = [
      {
        id: 'fountain-edge',
        name: 'The fountain edge',
        obstacle,
        holds: 'cellar-key',
        inQuickLook: true,
        requiresLead: null,
        fallback: { kind: 'ask', suspectId: 'baker' },
      },
    ];
  }
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(detectiveCase),
    seed: 'tools',
    rngState: 1,
    locale: 'en',
  });
  const equipped: DetectiveRunState = {
    ...run,
    kit: [...kit],
    rulesetVersion: ruleset,
  };
  const looked = resolveIntent(equipped, { kind: 'look' }, createRng(3));
  if (!looked.ok) throw new Error('The look was refused.');
  return looked.run;
}

function ok(resolution: Resolved): Extract<Resolved, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

const search = (run: DetectiveRunState, rng: Rng, toolId?: GearId) =>
  resolveIntent(
    run,
    { kind: 'search', partId: 'fountain-edge', ...(toolId === undefined ? {} : { toolId }) },
    rng,
  );

const refusalOf = (run: DetectiveRunState, toolId?: GearId): string => {
  const rng = createRng(1);
  const resolution = search(run, rng, toolId);
  if (resolution.ok) throw new Error('Expected a refusal.');
  expect(rng.state()).toBe(createRng(1).state());
  return resolution.refusal.code;
};

const itemOf = (run: DetectiveRunState, id: GearId): KitItem | undefined =>
  run.kit.find((piece) => piece.id === id);

describe('which tool the hero uses', () => {
  const phone = owned('phone');

  it('needs none for a part that lies open', () => {
    expect(chooseTool(runWith(null, [phone]), null, undefined)).toEqual({ kind: 'none' });
  });

  it('is the phone for the dark, and nothing else in a run from before the tools', () => {
    const old = runWith(null, [phone], TOOLS_RULESET_VERSION - 1);

    expect(chooseTool(old, 'dark', undefined)).toEqual({ kind: 'none' });
    expect(chooseTool(old, 'locked', undefined)).toEqual({ kind: 'refused', code: 'needs-tool' });
    expect(chooseTool({ ...old, kit: [phone, owned('picks')] }, 'locked', 'picks')).toEqual({
      kind: 'refused',
      code: 'needs-tool',
    });
  });

  it('is a tool of the kit that removes the kind, or a refusal when there is none', () => {
    const run = runWith(null, [phone, owned('picks'), owned('tape-measure')]);

    expect(chooseTool(run, 'dark', undefined)).toMatchObject({ kind: 'tool', item: { id: 'phone' } });
    expect(chooseTool(run, 'locked', undefined)).toMatchObject({ kind: 'tool', item: { id: 'picks' } });
    expect(chooseTool(run, 'digital', undefined)).toEqual({ kind: 'refused', code: 'needs-tool' });
    expect(chooseTool(run, 'soft', undefined)).toEqual({ kind: 'refused', code: 'needs-tool' });
  });

  it('is the one named, if the kit has it and it gets past that kind', () => {
    const run = runWith(null, [phone, owned('magnifier'), owned('powder')]);

    expect(chooseTool(run, 'trace', 'powder')).toMatchObject({ kind: 'tool', item: { id: 'powder' } });
    expect(chooseTool(run, 'trace', 'knife')).toEqual({ kind: 'refused', code: 'wrong-tool' });
    expect(chooseTool(run, 'trace', 'phone')).toEqual({ kind: 'refused', code: 'wrong-tool' });
  });

  it('is the one that wears least when none is named', () => {
    const kit = [phone, owned('powder'), owned('test-kit'), owned('magnifier')];

    expect(chooseTool(runWith(null, kit), 'trace', undefined)).toMatchObject({ item: { id: 'magnifier' } });
    expect(chooseTool(runWith(null, kit.slice(0, 3)), 'trace', undefined)).toMatchObject({
      item: { id: 'powder' },
    });
    expect(
      chooseTool(runWith(null, [phone, owned('crowbar'), owned('picks')]), 'locked', undefined),
    ).toMatchObject({ item: { id: 'crowbar' } });
  });

  it('leaves out a tool that is lost, spent or broken', () => {
    const base = runWith(null, [phone, owned('picks')]);

    for (const state of ['lost', 'spent', 'broken'] as const) {
      const run = { ...base, kit: [phone, { id: 'picks' as const, state }] };
      expect(chooseTool(run, 'locked', undefined)).toEqual({ kind: 'refused', code: 'needs-tool' });
      expect(chooseTool(run, 'locked', 'picks')).toEqual({ kind: 'refused', code: 'wrong-tool' });
    }
    expect(chooseTool(loseGear(base, 'picks'), 'locked', undefined)).toEqual({
      kind: 'refused',
      code: 'needs-tool',
    });
  });
});

describe('a search against an obstacle', () => {
  it('shines the phone on the dark with no roll, and finds what lies in plain sight', () => {
    const rng = dice(2);
    const { outcome, details, run } = ok(search(runWith('dark', [owned('phone')]), rng));

    expect(outcome).toMatchObject({
      foundClueIds: ['cellar-key'],
      partId: 'fountain-edge',
      tool: { id: 'phone', cleared: true, wear: null },
      minutes: PART_SEARCH_MINUTES,
    });
    expect(details.map(({ subject }) => subject.kind)).toEqual(['clue']);
    expect(itemOf(run, 'phone')).toEqual(owned('phone'));
  });

  it('gets through with a roll and then finds what the part holds', () => {
    const { outcome, details, run } = ok(
      search(runWith('locked', [owned('phone'), owned('picks')]), dice(15)),
    );

    expect(outcome).toMatchObject({ foundClueIds: ['cellar-key'], tool: { id: 'picks', cleared: true } });
    expect(details[0]).toMatchObject({ subject: { kind: 'part', id: 'fountain-edge' } });
    expect(run.searchedParts).toMatchObject([{ partId: 'fountain-edge', foundClueIds: ['cellar-key'] }]);
    expect(itemOf(run, 'picks')).toEqual(owned('picks'));
  });

  it('costs the time of the attempt and a point of nerves when it does not get through, and may be tried again', () => {
    const run = runWith('locked', [owned('phone'), owned('picks')]);
    const nerves = run.condition.nerves;

    const failed = ok(search(run, dice(2)));

    expect(failed.outcome).toEqual({
      kind: 'search',
      foundClueIds: [],
      minutes: PART_SEARCH_MINUTES + DETECTIVE_GEAR.picks.tool!.failureMinutes,
      consequences: ['time-lost', 'nerves-lost'],
      partId: 'fountain-edge',
      tool: { id: 'picks', cleared: false, wear: null },
    });
    expect(failed.run.condition.nerves).toBe(nerves - 1);
    expect(failed.run.searchedParts).toEqual([]);
    expect(itemOf(failed.run, 'picks')).toEqual(owned('picks'));
    const again = ok(search(failed.run, dice(15)));
    expect(again.outcome).toMatchObject({ foundClueIds: ['cellar-key'] });
  });

  it('says the attempt was blocked, and not an empty part, from the ruleset that tells it', () => {
    const run = runWith('locked', [owned('phone'), owned('picks')], SEARCH_ATTEMPT_RULESET_VERSION);

    const failed = ok(search(run, dice(2)));

    expect(failed.outcome).toMatchObject({
      foundClueIds: [],
      partId: 'fountain-edge',
      attempt: 'blocked',
      tool: { id: 'picks', cleared: false },
    });
    expect(failed.run.searchedParts).toEqual([]);
  });

  it('breaks a lockpick on a blunder, which costs reputation, and then wants another tool', () => {
    const run = runWith('locked', [owned('phone'), owned('picks')]);

    const blundered = ok(search(run, dice(1)));

    expect(blundered.outcome).toMatchObject({
      foundClueIds: [],
      consequences: ['time-lost', 'reputation-lost'],
      tool: { id: 'picks', cleared: false, wear: 'broken' },
    });
    expect(blundered.run.reputation).toBe(MAX_REPUTATION - 1);
    expect(itemOf(blundered.run, 'picks')?.state).toBe('broken');
    expect(refusalOf(blundered.run)).toBe('needs-tool');
  });

  it('wears a piece that is used up, and spends the last of it', () => {
    const run = runWith('trace', [owned('phone'), owned('powder', 2)]);

    const once = ok(search(run, dice(2)));
    expect(itemOf(once.run, 'powder')).toEqual(owned('powder', 1));
    expect(once.outcome).toMatchObject({ tool: { wear: null } });

    const last = ok(search(once.run, dice(15)));
    expect(last.outcome).toMatchObject({ tool: { id: 'powder', cleared: true, wear: 'spent' } });
    expect(itemOf(last.run, 'powder')).toEqual({ id: 'powder', state: 'spent', charges: 0 });
    expect(viewRun(last.run).kit.find(({ id }) => id === 'powder')).toMatchObject({
      state: 'spent',
      charges: 0,
    });
  });

  it('counts a piece that was never used as full', () => {
    const run = runWith('trace', [owned('phone'), owned('test-kit')]);

    const used = ok(search(run, dice(15)));

    expect(itemOf(used.run, 'test-kit')).toEqual(owned('test-kit', 1));
  });

  it('keeps a lasting tool as it was, win or lose', () => {
    const run = runWith('trace', [owned('phone'), owned('magnifier')]);

    expect(itemOf(ok(search(run, dice(15))).run, 'magnifier')).toEqual(owned('magnifier'));
    expect(itemOf(ok(search(run, dice(1))).run, 'magnifier')).toEqual(owned('magnifier'));
  });

  it('uses the tool the player names, and refuses one that does not fit before anything is spent', () => {
    const run = runWith('trace', [owned('phone'), owned('magnifier'), owned('powder', 3)]);

    expect(ok(search(run, dice(15), 'powder')).outcome).toMatchObject({ tool: { id: 'powder' } });
    expect(ok(search(run, dice(15))).outcome).toMatchObject({ tool: { id: 'magnifier' } });
    expect(refusalOf(run, 'knife')).toBe('wrong-tool');
  });

  it('refuses an obstacle with nothing in the kit that gets past it', () => {
    expect(refusalOf(runWith('locked', [owned('phone'), owned('tape-measure')]))).toBe('needs-tool');
    expect(refusalOf(runWith('digital', [owned('phone')]))).toBe('needs-tool');
  });

  it('keeps to the old rule in a run from before the tools', () => {
    const old = (obstacle: ObstacleKind) =>
      runWith(obstacle, [owned('phone'), owned('picks')], TOOLS_RULESET_VERSION - 1);

    expect(refusalOf(old('locked'))).toBe('needs-tool');
    expect(ok(search(old('dark'), dice(2))).outcome).toMatchObject({ foundClueIds: ['cellar-key'] });
    expect(ok(search(old('dark'), dice(2))).outcome).not.toHaveProperty('tool');
  });

  it('plays out the same way over many seeds: the roll decides, and the time follows', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const resolution = ok(search(runWith('locked', [owned('phone'), owned('picks')]), createRng(seed)));
      if (resolution.outcome.kind !== 'search') throw new Error('Not a search.');
      const { foundClueIds, minutes, tool } = resolution.outcome;

      expect(foundClueIds.length === 1).toBe(tool?.cleared);
      expect(minutes).toBe(
        tool?.cleared === true ? PART_SEARCH_MINUTES : PART_SEARCH_MINUTES + FAILED_SEARCH_MINUTES,
      );
      expect(itemOf(resolution.run, 'picks')?.state).toBe(tool?.wear === 'broken' ? 'broken' : 'owned');
    }
  });
});

describe('the tools as data', () => {
  it('has a tool for every kind of obstacle, and removes only kinds the case can name', () => {
    const removed = new Set(GEAR_IDS.flatMap((id) => DETECTIVE_GEAR[id].tool?.removes ?? []));

    for (const kind of OBSTACLE_KINDS) expect(removed.has(kind)).toBe(true);
  });

  it('gives every used-up tool its charges, and no other tool any', () => {
    for (const id of GEAR_IDS) {
      const rules = DETECTIVE_GEAR[id].tool;
      expect(rules?.wear === 'used-up').toBe((rules?.charges ?? 0) > 0);
    }
  });

  it('wears as the rules say', () => {
    expect(worn(owned('powder', 3), false)).toEqual({ item: owned('powder', 2), wear: null });
    expect(worn(owned('powder', 1), false)).toEqual({
      item: { id: 'powder', state: 'spent', charges: 0 },
      wear: 'spent',
    });
    expect(worn(owned('picks'), true)).toEqual({ item: { id: 'picks', state: 'broken' }, wear: 'broken' });
    expect(worn(owned('picks'), false)).toEqual({ item: owned('picks'), wear: null });
    expect(worn(owned('crowbar'), true)).toEqual({ item: owned('crowbar'), wear: null });
    expect(worn(owned('notebook'), true)).toEqual({ item: owned('notebook'), wear: null });
  });

  it('counts charges only for a piece that is used up', () => {
    expect(chargesLeft(owned('powder'))).toBe(3);
    expect(chargesLeft(owned('powder', 1))).toBe(1);
    expect(chargesLeft(owned('picks'))).toBeNull();
    expect(viewKit([owned('cash')])).toEqual([
      {
        id: 'cash',
        nameKey: 'gear.cash',
        state: 'owned',
        removes: [],
        charges: 2,
        lawful: true,
        suitcase: false,
        study: false,
        helpsAsking: true,
      },
    ]);
  });

  it('gives a spent or broken piece no bonus at all', () => {
    const effects = (state: 'owned' | 'lost' | 'spent' | 'broken') =>
      gearModifiers([{ id: 'laptop', state }])[0]?.effects;

    expect(effects('owned')).toEqual(DETECTIVE_GEAR.laptop.effects);
    expect(effects('lost')).toEqual(DETECTIVE_GEAR.laptop.lostEffects);
    expect(effects('spent')).toEqual([]);
    expect(effects('broken')).toEqual([]);
  });

  it('refuses to wear a tool the hero does not have, or in a run that is over', () => {
    const run = runWith(null, [owned('phone')]);

    expect(() => wearTool(run, 'picks', false)).toThrow(RangeError);
    expect(wearTool(run, 'phone', false).kit).toEqual([owned('phone')]);
  });
});

describe('the kit a hero starts with', () => {
  it('is the same for the same seed, and holds the phone whatever the background', () => {
    for (const background of BACKGROUNDS) {
      const kit = startingKit(background, undefined, 'seed-1');

      expect(startingKit(background, undefined, 'seed-1')).toEqual(kit);
      expect(kit.map(({ id }) => id)).toContain('phone');
      expect(kit.map(({ id }) => id)).toEqual(expect.arrayContaining([...BACKGROUND_KITS[background]]));
      expect(new Set(kit.map(({ id }) => id)).size).toBe(kit.length);
      expect(kit.every(({ state }) => state === 'owned')).toBe(true);
    }
  });

  it('adds exactly one tool to what the background gives and the phone', () => {
    for (const background of BACKGROUNDS) {
      const base = new Set<GearId>(['phone', ...BACKGROUND_KITS[background]]);

      expect(startingKit(background, undefined, 'seed-2')).toHaveLength(base.size + 1);
    }
  });

  it('never hands out a piece that moves a roll, only tools', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const kit = startingKit('analyst', undefined, `s-${String(seed)}`);
      const extra = kit.filter(({ id }) => id !== 'phone' && !BACKGROUND_KITS.analyst.includes(id));

      expect(extra).toHaveLength(1);
      expect(DETECTIVE_GEAR[extra[0]?.id ?? 'phone'].effects).toEqual([]);
    }
  });

  it('fills a piece that is used up, and leans towards the background', () => {
    let leaned = 0;
    for (let seed = 0; seed < 400; seed += 1) {
      const kit = startingKit('pharmacist', undefined, `lean-${String(seed)}`);
      const extra = kit.find(({ id }) => !['phone', 'notebook'].includes(id));
      if (extra !== undefined && BACKGROUND_TOOL_LEAN.pharmacist.includes(extra.id)) leaned += 1;
      if (extra?.id === 'test-kit') expect(extra.charges).toBe(2);
    }

    // Two of the ten tools are favoured three to one, which makes them 6 of 14 draws: about 43%.
    expect(leaned / 400).toBeGreaterThan(0.33);
    expect(leaned / 400).toBeLessThan(0.55);
  });

  it('is what a run begins with', () => {
    const run = createDetectiveRun({
      hero: buildHero(),
      traits: [],
      case: DetectiveCaseSchema.parse(buildCheeseCase()),
      seed: 'the-seed',
      rngState: 1,
      locale: 'en',
    });

    expect(run.kit).toEqual(startingKit(buildHero().background, undefined, 'the-seed'));
    expect(moveTo(run, 'cheese-stall').kit).toEqual(run.kit);
  });
});
