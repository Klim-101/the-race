// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { resolveIntent, type Resolved } from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { inWindow, LEADS_RULESET_VERSION } from './leads.js';
import {
  DetectiveRunStateSchema,
  addInsight,
  createDetectiveRun,
  findClue,
  moveTo,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';

/** A seed whose first d20 roll is `die`, so that a test can choose how a check goes. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

type LeadInput = Record<string, unknown>;

const lead = (id: string, earnedBy: Record<string, unknown>, extra: LeadInput = {}): LeadInput => ({
  id,
  reason: `The hero has a reason to look: ${id.replaceAll('-', ' ')}.`,
  earnedBy,
  isFalse: false,
  ...extra,
});

const part = (id: string, requiresLead: string | null, overrides: LeadInput = {}): LeadInput => ({
  id,
  name: `The ${id}`,
  obstacle: null,
  holds: null,
  inQuickLook: requiresLead === null,
  requiresLead,
  fallback: null,
  ...overrides,
});

/**
 * The cheese case where the mayor's office waits for a lead from the flour, and three spots of the square are
 * shown by a lead each: one for a talk with the baker, one for the lie of the baker and one for the motive.
 */
function buildLeadCase(): DetectiveCase {
  const detectiveCase = buildCheeseCase();
  const byId = (id: string) => detectiveCase.locations.find((place) => place.id === id);
  const office = byId('mayor-office');
  if (office !== undefined) office.requiresLead = 'office-hint';
  const square = byId('market-square');
  if (square !== undefined) {
    square.parts = [
      part('fountain-edge', null, { holds: 'cellar-key' }),
      part('talk-spot', 'baker-trust'),
      part('lie-spot', 'asleep-fell'),
      part('deduction-spot', 'debt-seen'),
    ];
  }
  const stall = byId('cheese-stall');
  if (stall !== undefined) {
    stall.parts = [
      part('plinth', null, { holds: 'flour-crumbs' }),
      part('crate', null, {
        holds: 'blue-glove',
        obstacle: 'locked',
        fallback: { kind: 'lead', leadId: 'glove-tip' },
      }),
    ];
  }
  detectiveCase.leads = [
    lead('office-hint', { kind: 'clue', clueId: 'flour-crumbs' }),
    lead('baker-trust', { kind: 'talk', suspectId: 'baker' }),
    lead('asleep-fell', { kind: 'lie', lieId: 'baker-asleep' }),
    lead('debt-seen', { kind: 'deduction', deductionId: 'motive-debt' }),
    lead('glove-tip', { kind: 'clue', clueId: 'cart-tracks' }),
  ];
  return DetectiveCaseSchema.parse(detectiveCase);
}

function newRun(options: { ruleset?: number; edit?: (detectiveCase: DetectiveCase) => void } = {}) {
  const detectiveCase = buildLeadCase();
  options.edit?.(detectiveCase);
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: 'leads',
    rngState: 1,
    locale: 'en',
  });
  return options.ruleset === undefined ? run : { ...run, rulesetVersion: options.ruleset };
}

function ok(resolution: Resolved): Extract<Resolved, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

const earnedIds = (run: DetectiveRunState): string[] => run.earnedLeads.map(({ leadId }) => leadId);
const atStall = (run = newRun()): DetectiveRunState => moveTo(run, 'cheese-stall');

describe('earning a lead', () => {
  it('comes from finding a clue', () => {
    const run = findClue(newRun(), 'flour-crumbs');

    expect(earnedIds(run)).toEqual(['office-hint']);
    expect(run.earnedLeads[0]?.turn).toBe(run.turn + 1);
  });

  it('comes from a talk that goes well, and not from one that does not', () => {
    const talk = (die: number) =>
      ok(
        resolveIntent(atStall(), { kind: 'interrogate', suspectId: 'baker', approach: 'social' }, dice(die)),
      );

    expect(earnedIds(talk(20).run)).toEqual(['baker-trust']);
    expect(talk(20).newLeadIds).toEqual(['baker-trust']);
    expect(earnedIds(talk(2).run)).toEqual([]);
    expect(talk(2).newLeadIds).toEqual([]);
  });

  it('comes from a lie that falls, even when the talk was not won', () => {
    const shown = findClue(atStall(), 'cart-tracks');
    const failed = ok(
      resolveIntent(
        shown,
        { kind: 'interrogate', suspectId: 'baker', approach: 'social', clueIds: ['cart-tracks'] },
        dice(5),
      ),
    );

    expect(failed.outcome).toMatchObject({ succeeded: false, conceded: [{ lieId: 'baker-asleep' }] });
    expect(earnedIds(failed.run)).toContain('asleep-fell');
    expect(earnedIds(failed.run)).not.toContain('baker-trust');
  });

  it('comes from a conclusion drawn', () => {
    const run = findClue(findClue(newRun(), 'oven-receipt'), 'debt-ledger');

    const drawn = ok(
      resolveIntent(run, { kind: 'deduce', clueIds: ['oven-receipt', 'debt-ledger'] }, dice(10)),
    );

    expect(drawn.newLeadIds).toEqual(['debt-seen']);
    expect(earnedIds(addInsight(newRun(), 'motive-debt'))).toEqual(['debt-seen']);
  });

  it('is for good: the same deed earns nothing the second time', () => {
    const once = findClue(newRun(), 'flour-crumbs');

    expect(earnedIds(findClue(once, 'flour-crumbs'))).toEqual(['office-hint']);
    expect(earnedIds(addInsight(addInsight(newRun(), 'motive-debt'), 'motive-debt'))).toEqual(['debt-seen']);
  });

  it('is told to the player in the turn that earned it, and listed after in the view', () => {
    const run = atStall(newRun({ edit: () => undefined }));
    const searched = ok(resolveIntent(looked(run), { kind: 'search', partId: 'plinth' }, dice(20)));

    expect(searched.newLeadIds).toEqual(['office-hint']);
    const view = viewRun(findClue(newRun(), 'flour-crumbs'));
    expect(view.leads).toEqual([
      {
        id: 'office-hint',
        reason: 'The hero has a reason to look: office hint.',
        window: null,
        openNow: true,
        source: { kind: 'clue', clueId: 'flour-crumbs' },
        opens: [{ kind: 'place', id: 'mayor-office', name: 'Mayor office' }],
      },
    ]);
  });
});

describe('what earned a lead', () => {
  const sourceOf = (run: DetectiveRunState, leadId: string) =>
    viewRun(run).leads.find(({ id }) => id === leadId)?.source;

  it('is written down with the lead and shown in the view, whatever the deed', () => {
    const talked = ok(
      resolveIntent(atStall(), { kind: 'interrogate', suspectId: 'baker', approach: 'social' }, dice(20)),
    ).run;
    const fell = ok(
      resolveIntent(
        findClue(atStall(), 'cart-tracks'),
        { kind: 'interrogate', suspectId: 'baker', approach: 'social', clueIds: ['cart-tracks'] },
        dice(5),
      ),
    ).run;

    expect(sourceOf(findClue(newRun(), 'flour-crumbs'), 'office-hint')).toEqual({
      kind: 'clue',
      clueId: 'flour-crumbs',
    });
    expect(sourceOf(talked, 'baker-trust')).toEqual({ kind: 'talk', suspectId: 'baker' });
    expect(sourceOf(fell, 'asleep-fell')).toEqual({ kind: 'lie', suspectId: 'baker' });
    expect(sourceOf(addInsight(newRun(), 'motive-debt'), 'debt-seen')).toEqual({
      kind: 'deduction',
      insightId: 'motive-debt',
    });
  });

  it('names a rumour by its place and a study by its clue and tool, and a lie of nobody by no one', () => {
    const withSource = (source: unknown) =>
      ({ ...newRun(), earnedLeads: [{ leadId: 'office-hint', turn: 1, source }] }) as DetectiveRunState;

    expect(sourceOf(withSource({ kind: 'locals', locationId: 'cheese-stall' }), 'office-hint')).toEqual({
      kind: 'locals',
      locationId: 'cheese-stall',
    });
    expect(
      sourceOf(withSource({ kind: 'study', clueId: 'flour-crumbs', tool: 'magnifier' }), 'office-hint'),
    ).toEqual({ kind: 'study', clueId: 'flour-crumbs', tool: 'magnifier' });
    expect(sourceOf(withSource({ kind: 'study', clueId: 'flour-crumbs' }), 'office-hint')).toEqual({
      kind: 'study',
      clueId: 'flour-crumbs',
      tool: null,
    });
    expect(sourceOf(withSource({ kind: 'lie', lieId: 'no-such-lie' }), 'office-hint')).toEqual({
      kind: 'lie',
      suspectId: null,
    });
  });

  it('is shown as none for a lead earned before it was written down, and the save still loads', () => {
    const old = { ...newRun(), earnedLeads: [{ leadId: 'office-hint', turn: 1 }] };

    expect(DetectiveRunStateSchema.safeParse(old).success).toBe(true);
    expect(sourceOf(old, 'office-hint')).toBeNull();
  });

  it('is told of earned leads only, and never whether a lead is false', () => {
    const view = viewRun(findClue(newRun(), 'flour-crumbs'));

    expect(view.leads.map(({ id }) => id)).toEqual(['office-hint']);
    expect(JSON.stringify(view)).not.toContain('isFalse');
  });
});

function looked(run: DetectiveRunState): DetectiveRunState {
  return ok(resolveIntent(run, { kind: 'look' }, createRng(3))).run;
}

describe('a place that waits for a lead', () => {
  it('is not among the exits or on the map, and cannot be walked to, until a lead names it', () => {
    const run = atStall();

    expect(viewRun(run).location.exits.map(({ id }) => id)).toEqual(['market-square']);
    expect(viewRun(run).map.places.map(({ id }) => id)).not.toContain('mayor-office');
    const refused = resolveIntent(run, { kind: 'move', locationId: 'mayor-office' }, createRng(1));
    const unknown = resolveIntent(run, { kind: 'move', locationId: 'no-such-place' }, createRng(1));
    expect(refused).toMatchObject({ ok: false, refusal: { code: 'unknown-location' } });
    expect(unknown).toMatchObject({ ok: false, refusal: { code: 'unknown-location' } });
  });

  it('shows up with the reason of the lead once it is named, and can be walked to', () => {
    const run = findClue(atStall(), 'flour-crumbs');

    const exit = viewRun(run).location.exits.find(({ id }) => id === 'mayor-office');
    expect(exit).toMatchObject({ visited: false, lead: 'The hero has a reason to look: office hint.' });
    expect(viewRun(run).map.places.find(({ id }) => id === 'mayor-office')?.lead).toBe(exit?.lead);
    expect(viewRun(run).map.links).toContainEqual({ from: 'cheese-stall', to: 'mayor-office' });
    const moved = ok(resolveIntent(run, { kind: 'move', locationId: 'mayor-office' }, dice(20)));
    expect(moved.outcome).toMatchObject({ kind: 'move', entered: true });
  });

  it('drops its marker once the hero has been there', () => {
    const run = moveTo(findClue(atStall(), 'flour-crumbs'), 'mayor-office');

    expect(
      viewRun(moveTo(run, 'cheese-stall')).location.exits.find(({ id }) => id === 'mayor-office'),
    ).toMatchObject({
      visited: true,
      lead: null,
    });
  });

  it('is known as before to a run of a ruleset from before the leads', () => {
    const run = findClue(atStall(newRun({ ruleset: LEADS_RULESET_VERSION - 1 })), 'flour-crumbs');

    expect(earnedIds(run)).toEqual([]);
    expect(viewRun(run).location.exits.map(({ id }) => id)).toContain('mayor-office');
    expect(viewRun(run).leads).toEqual([]);
  });
});

describe('a part that a lead shows', () => {
  it('is shown when its lead is earned, with its obstacle, in the place it is in', () => {
    const run = addInsight(newRun(), 'motive-debt');

    expect(run.noticedPartIds).toContain('deduction-spot');
    expect(viewRun(run).location.parts.map(({ id }) => id)).toEqual(['deduction-spot']);
    expect(viewRun(addInsight(newRun(), 'motive-debt')).leads[0]?.opens).toEqual([
      { kind: 'part', id: 'deduction-spot', name: 'The deduction-spot' },
    ]);
  });

  it('is left out of a quick look until its lead is earned', () => {
    const edit = (detectiveCase: DetectiveCase) => {
      const spot = detectiveCase.locations[0]?.parts?.[1];
      if (spot !== undefined) spot.inQuickLook = true;
    };

    expect(ok(resolveIntent(newRun({ edit }), { kind: 'look' }, createRng(3))).run.noticedPartIds).toEqual([
      'fountain-edge',
    ]);
    expect(
      ok(resolveIntent(addInsightLead(newRun({ edit })), { kind: 'look' }, createRng(3))).run.noticedPartIds,
    ).toEqual(['talk-spot', 'fountain-edge']);
  });
});

function addInsightLead(run: DetectiveRunState): DetectiveRunState {
  const talked = ok(
    resolveIntent(
      moveTo(run, 'cheese-stall'),
      { kind: 'interrogate', suspectId: 'baker', approach: 'social' },
      dice(20),
    ),
  );
  return moveTo(talked.run, 'market-square');
}

describe('a lead that is the way round an obstacle', () => {
  it('hands over the clue behind it when it is earned', () => {
    const run = findClue(atStall(), 'cart-tracks');

    expect(earnedIds(run)).toEqual(['glove-tip']);
    expect(run.foundClueIds).toEqual(['cart-tracks', 'blue-glove']);
  });
});

describe('a window of time', () => {
  const night = { fromMinute: 22 * 60, untilMinute: 5 * 60 };
  const withWindow = (detectiveCase: DetectiveCase) => {
    const hint = detectiveCase.leads?.find(({ id }) => id === 'office-hint');
    if (hint !== undefined) hint.window = night;
    const spot = detectiveCase.locations[0]?.parts?.[3];
    if (spot !== undefined) spot.requiresLead = 'office-hint';
  };

  it('knows which hours are in it, across midnight too', () => {
    expect(inWindow(night, 23 * 60)).toBe(true);
    expect(inWindow(night, 3 * 60)).toBe(true);
    expect(inWindow(night, 12 * 60)).toBe(false);
    const day = { fromMinute: 8 * 60, untilMinute: 12 * 60 };
    expect(inWindow(day, 9 * 60)).toBe(true);
    expect(inWindow(day, 12 * 60)).toBe(false);
    expect(inWindow(day, 7 * 60)).toBe(false);
  });

  it('keeps a place shut out of its hours, without spending anything', () => {
    const run = findClue(atStall(newRun({ edit: withWindow })), 'flour-crumbs');
    const rng = createRng(1);

    const refused = resolveIntent(run, { kind: 'move', locationId: 'mayor-office' }, rng);

    expect(refused).toMatchObject({ ok: false, refusal: { code: 'lead-window' } });
    expect(rng.state()).toBe(createRng(1).state());
    expect(viewRun(run).leads[0]).toMatchObject({ window: night, openNow: false });
    const late = { ...run, clock: { ...run.clock, minute: 23 * 60 } };
    expect(viewRun(late).leads[0]).toMatchObject({ openNow: true });
    expect(
      ok(resolveIntent(late, { kind: 'move', locationId: 'mayor-office' }, dice(20))).outcome,
    ).toMatchObject({ entered: true });
  });

  it('keeps a part shut out of its hours', () => {
    const run = findClue(moveTo(newRun({ edit: withWindow }), 'market-square'), 'flour-crumbs');

    expect(resolveIntent(run, { kind: 'search', partId: 'deduction-spot' }, createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'lead-window' },
    });
    const late = { ...run, clock: { ...run.clock, minute: 23 * 60 } };
    expect(
      ok(resolveIntent(late, { kind: 'search', partId: 'deduction-spot' }, createRng(1))).outcome,
    ).toMatchObject({ kind: 'search', partId: 'deduction-spot' });
  });

  it('does not bind a run of a ruleset from before the leads', () => {
    const run = atStall(newRun({ edit: withWindow, ruleset: LEADS_RULESET_VERSION - 1 }));

    expect(
      ok(resolveIntent(run, { kind: 'move', locationId: 'mayor-office' }, dice(20))).outcome,
    ).toMatchObject({ entered: true });
  });
});

describe('the state of leads', () => {
  it('refuses a lead the case does not have', () => {
    const run = newRun();

    const parsed = DetectiveRunStateSchema.safeParse({
      ...run,
      earnedLeads: [{ leadId: 'no-such-lead', turn: 1 }],
    });

    expect(parsed.success).toBe(false);
    expect(
      DetectiveRunStateSchema.safeParse({ ...run, earnedLeads: [{ leadId: 'office-hint', turn: 1 }] })
        .success,
    ).toBe(true);
  });

  it('rejects a window of no hours', () => {
    const detectiveCase = buildLeadCase();
    const hint = { ...detectiveCase.leads?.[0], window: { fromMinute: 60, untilMinute: 60 } };

    expect(DetectiveCaseSchema.safeParse({ ...detectiveCase, leads: [hint] }).success).toBe(false);
  });
});
