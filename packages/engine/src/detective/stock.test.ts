// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { resolveIntent, type Resolution } from './actions.js';
import { DetectiveCaseSchema, StockEntrySchema, type DetectiveCase } from './case-schema.js';
import { validateCase } from './case-validator.js';
import { RunLogSchema, recordResolution, type RunLog } from './event-log.js';
import { DetectiveRunStateSchema, createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';
import { BUY_MINUTES, FIND_MINUTES, offeredHere, takeStock } from './stock.js';
import { viewTurns } from './turn-view.js';

/** The cheese case with stock in the stall: a crowbar in a search, a sedative on sale, a second tool on sale. */
function stockedCase(edit: (detectiveCase: DetectiveCase) => void = () => undefined): DetectiveCase {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  const stall = detectiveCase.locations.find(({ id }) => id === 'cheese-stall');
  if (stall) {
    stall.stock = [
      { id: 'stall-crowbar', kind: 'tool', itemId: 'crowbar', how: 'found' },
      { id: 'stall-sedative', kind: 'supply', itemId: 'sedative', how: 'sold' },
      { id: 'stall-magnifier', kind: 'tool', itemId: 'magnifier', how: 'sold' },
      { id: 'stall-coffee', kind: 'supply', itemId: 'coffee', how: 'found' },
    ];
  }
  edit(detectiveCase);
  return detectiveCase;
}

function runAt(
  options: {
    searched?: boolean;
    slots?: number;
    kit?: DetectiveRunState['kit'];
    edit?: (detectiveCase: DetectiveCase) => void;
  } = {},
): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: stockedCase(options.edit),
    seed: 'stock',
    rngState: 1,
    locale: 'en',
    toolSlots: options.slots ?? 2,
  });
  return {
    ...run,
    locationId: 'cheese-stall',
    kit: options.kit ?? run.kit.filter(({ suitcase }) => suitcase !== true),
    supplies: {},
    searchedLocationIds: options.searched === true ? ['cheese-stall'] : [],
  };
}

const ids = (run: DetectiveRunState): string[] => offeredHere(run).map(({ id }) => id);

function ok(resolution: Resolution): Extract<Resolution, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}
const take = (run: DetectiveRunState, stockId: string, dropId?: string) =>
  resolveIntent(run, { kind: 'take', stockId, ...(dropId === undefined ? {} : { dropId }) }, createRng(1));
const codeOf = (resolution: Resolution): string => (resolution.ok ? 'ok' : resolution.refusal.code);

describe('what a place offers', () => {
  it('is what is sold there, and what a search turns up once the place has been searched', () => {
    expect(ids(runAt())).toEqual(['stall-sedative', 'stall-magnifier']);
    expect(ids(runAt({ searched: true }))).toEqual([
      'stall-crowbar',
      'stall-sedative',
      'stall-magnifier',
      'stall-coffee',
    ]);
  });

  it('counts a search of one part of the place as a search of the place', () => {
    const parted = runAt({
      edit: (detectiveCase) => {
        const stall = detectiveCase.locations.find(({ id }) => id === 'cheese-stall');
        if (stall) {
          stall.parts = [
            {
              id: 'plinth',
              name: 'The plinth',
              obstacle: null,
              holds: null,
              inQuickLook: true,
              requiresLead: null,
              fallback: null,
            },
          ];
        }
      },
    });

    expect(ids(parted)).not.toContain('stall-crowbar');
    const searched = {
      ...parted,
      searchedParts: [{ partId: 'plinth', locationId: 'cheese-stall', turn: 1, foundClueIds: [] }],
    };
    expect(ids(searched)).toContain('stall-crowbar');
  });

  it('is nothing in a place with no stock, and nothing of what was taken', () => {
    const bare = { ...runAt(), locationId: 'market-square' };
    expect(ids(bare)).toEqual([]);
    expect(ids({ ...runAt({ searched: true }), takenStockIds: ['stall-crowbar'] })).not.toContain(
      'stall-crowbar',
    );
  });

  it('is told by the view, and never names what lies undiscovered', () => {
    const before = JSON.stringify(viewRun(runAt()).location.offers);
    expect(before).toContain('stall-sedative');
    expect(before).not.toContain('crowbar');
    expect(JSON.stringify(viewRun(runAt({ searched: true })).location.offers)).toContain('crowbar');
  });
});

describe('taking what a place offers', () => {
  it('puts a tool in a free slot of the suitcase, and takes the time of a find', () => {
    const run = runAt({ searched: true });
    const result = takeStock(run, 'stall-crowbar');

    if (!result.ok) throw new Error('Refused.');
    expect(result.minutes).toBe(FIND_MINUTES);
    expect(result.run.kit.find(({ id }) => id === 'crowbar')).toMatchObject({
      suitcase: true,
      state: 'owned',
    });
    expect(result.run.takenStockIds).toEqual(['stall-crowbar']);
  });

  it('puts a supply in the pockets, and takes the time of a purchase for what is sold', () => {
    const result = takeStock(runAt(), 'stall-sedative');

    if (!result.ok) throw new Error('Refused.');
    expect(result.minutes).toBe(BUY_MINUTES);
    expect(result.run.supplies.sedative).toBe(1);
  });

  it('refuses what is not on offer here now, alike for an id that names nothing, another place and a find not yet made', () => {
    const run = runAt();
    for (const id of ['nothing-like-it', 'stall-crowbar']) {
      const result = takeStock(run, id);
      expect(result).toMatchObject({ ok: false, code: 'unknown-stock' });
    }
    const elsewhere = { ...run, locationId: 'market-square' };
    expect(takeStock(elsewhere, 'stall-sedative')).toMatchObject({ ok: false, code: 'unknown-stock' });
  });

  it('refuses what was taken already', () => {
    const run = runAt({ searched: true });
    const once = takeStock(run, 'stall-crowbar');
    if (!once.ok) throw new Error('Refused.');

    expect(takeStock(once.run, 'stall-crowbar')).toMatchObject({ ok: false, code: 'stock-taken' });
  });

  it('refuses a tool the hero already carries, and full pockets', () => {
    const carrying = runAt({
      searched: true,
      kit: [{ id: 'crowbar', state: 'owned', suitcase: true }],
    });
    expect(takeStock(carrying, 'stall-crowbar')).toMatchObject({ ok: false, code: 'already-carried' });

    const full = { ...runAt({ searched: true }), supplies: { coffee: 2 } };
    expect(takeStock(full, 'stall-coffee')).toMatchObject({ ok: false, code: 'pockets-full' });
  });

  it('refuses a tool for a full suitcase until a tool of it is named to drop, and refuses a drop that is not in it', () => {
    const full = runAt({
      searched: true,
      slots: 1,
      kit: [{ id: 'picks', state: 'owned', suitcase: true }],
    });

    expect(takeStock(full, 'stall-crowbar')).toMatchObject({ ok: false, code: 'no-slot' });
    expect(takeStock(full, 'stall-crowbar', 'mirror')).toMatchObject({ ok: false, code: 'not-in-suitcase' });
    const dropped = takeStock(full, 'stall-crowbar', 'picks');
    if (!dropped.ok) throw new Error('Refused.');
    expect(dropped.run.kit.map(({ id }) => id)).toEqual(['crowbar']);
  });
});

describe('the take intent', () => {
  it('is a turn: time passes and the outcome says what was taken, how, and what was dropped', () => {
    const run = runAt({ searched: true, slots: 1, kit: [{ id: 'picks', state: 'owned', suitcase: true }] });
    const turn = ok(take(run, 'stall-crowbar', 'picks'));

    expect(turn.outcome).toEqual({
      kind: 'take',
      stockId: 'stall-crowbar',
      how: 'found',
      itemKind: 'tool',
      itemId: 'crowbar',
      minutes: FIND_MINUTES,
      dropped: 'picks',
    });
    expect(turn.run.turn).toBe(run.turn + 1);
    expect(turn.run.clock.minute).toBeGreaterThan(run.clock.minute);
  });

  it('says nothing of a drop for a supply, or when none was named', () => {
    const supply = ok(take(runAt(), 'stall-sedative')).outcome;
    const tool = ok(take(runAt({ searched: true }), 'stall-crowbar')).outcome;

    expect(supply).not.toHaveProperty('dropped');
    expect(tool).not.toHaveProperty('dropped');
    expect(supply).toMatchObject({
      how: 'sold',
      itemKind: 'supply',
      itemId: 'sedative',
      minutes: BUY_MINUTES,
    });
  });

  it('is refused, unspent, with the code of the refusal', () => {
    const run = runAt();

    expect(codeOf(take(run, 'stall-crowbar'))).toBe('unknown-stock');
    expect(codeOf(take({ ...run, status: 'won' }, 'stall-sedative'))).toBe('run-over');
    expect(codeOf(resolveIntent(run, { kind: 'take' }, createRng(1)))).toBe('invalid-intent');
  });

  it('is logged, replays to the same state, and is shown to the player as a turn', () => {
    const run = runAt();
    const resolution = take(run, 'stall-magnifier');
    const log: RunLog = recordResolution([], run, { kind: 'take', stockId: 'stall-magnifier' }, resolution);
    const done = ok(resolution).run;

    expect(RunLogSchema.parse(log)).toEqual(log);
    expect(viewTurns(done, log)[0]).toMatchObject({
      kind: 'take',
      how: 'sold',
      itemKind: 'tool',
      item: 'magnifier',
    });
    expect(createDetectiveRunFromJson(done).takenStockIds).toEqual(['stall-magnifier']);
  });

  it('is not weighed down by fatigue: a tired hero takes it with no mishap', () => {
    const tired = { ...runAt(), condition: { ...runAt().condition, nerves: 1 } };

    expect(ok(take(tired, 'stall-sedative')).outcome).toMatchObject({ kind: 'take' });
  });
});

function createDetectiveRunFromJson(run: DetectiveRunState): DetectiveRunState {
  return DetectiveRunStateSchema.parse(JSON.parse(JSON.stringify(run)));
}

describe('stock in a case', () => {
  const codes = (detectiveCase: DetectiveCase): string[] => {
    const result = validateCase(detectiveCase, {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
    });
    return result.isValid ? [] : result.issues.map(({ code }) => code);
  };

  it('is accepted, and changes nothing about whether the case can be solved', () => {
    expect(codes(stockedCase())).toEqual([]);
  });

  it('takes an id of the one set of ids of the case', () => {
    const clash = stockedCase((detectiveCase) => {
      const stall = detectiveCase.locations.find(({ id }) => id === 'cheese-stall');
      if (stall?.stock?.[0] !== undefined) stall.stock[0].id = 'flour-crumbs';
    });

    expect(codes(clash)).toContain('duplicate-id');
  });

  it('refuses a tool that is no tool and a supply that is no supply', () => {
    expect(
      StockEntrySchema.safeParse({ id: 'x', kind: 'tool', itemId: 'coffee', how: 'found' }).success,
    ).toBe(false);
    expect(
      StockEntrySchema.safeParse({ id: 'x', kind: 'supply', itemId: 'crowbar', how: 'sold' }).success,
    ).toBe(false);
    expect(
      StockEntrySchema.safeParse({ id: 'x', kind: 'tool', itemId: 'crowbar', how: 'given' }).success,
    ).toBe(false);
  });

  it('refuses a save that has taken what no place keeps', () => {
    const run = runAt();

    expect(() =>
      DetectiveRunStateSchema.parse({ ...JSON.parse(JSON.stringify(run)), takenStockIds: ['nowhere'] }),
    ).toThrow(/does not exist in this run/);
  });

  it('is the same for a run restored from its log', () => {
    const run = runAt();
    const rng = restoreRng(run.rngState);
    const resolution = resolveIntent(run, { kind: 'take', stockId: 'stall-sedative' }, rng);

    expect(ok(resolution).run.supplies.sedative).toBe(1);
  });
});
