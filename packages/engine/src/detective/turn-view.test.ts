// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { TraitSchema } from '../traits.js';
import { resolveIntent, type Intent } from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { recordResolution, type RunLog } from './event-log.js';
import { DEFAULT_TURNS_SHOWN, viewTurns } from './turn-view.js';
import { DETECTIVE_TRAITS } from './traits.js';
import { createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';

const CASE_FILES = [
  'goose-of-elmwick.en.json',
  'goose-of-elmwick.ru.json',
  'leaked-memo-of-larkspur.en.json',
  'leaked-memo-of-larkspur.ru.json',
];

function sampleCases(): DetectiveCase[] {
  const base = new URL('../../../../content/cases/', import.meta.url);
  return [
    DetectiveCaseSchema.parse(buildCheeseCase()),
    ...CASE_FILES.map((file) =>
      DetectiveCaseSchema.parse(JSON.parse(readFileSync(new URL(file, base), 'utf8'))),
    ),
  ];
}

const cheeseCase = (): DetectiveCase => DetectiveCaseSchema.parse(buildCheeseCase());

function startRun(detectiveCase: DetectiveCase, seed: string): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: DETECTIVE_TRAITS.slice(0, 3).map((trait) => TraitSchema.parse(trait)),
    case: detectiveCase,
    seed,
    rngState: createRng(seed).state(),
    locale: 'en',
  });
}

/** Every intent that could make sense at this moment; the engine refuses the ones that do not. */
function candidates(run: DetectiveRunState): Intent[] {
  const found = run.foundClueIds;
  return [
    { kind: 'look' },
    { kind: 'search' },
    { kind: 'rest' },
    ...run.case.locations.map(({ id }): Intent => ({ kind: 'move', locationId: id })),
    ...run.case.suspects.flatMap(({ id }): Intent[] => [
      { kind: 'interrogate', suspectId: id, approach: 'social', clueIds: found.slice(0, 2) },
      { kind: 'interrogate', suspectId: id, approach: 'pressure', clueIds: found.slice(0, 3) },
    ]),
    ...run.case.deductions.map(({ clueIds }): Intent => ({ kind: 'deduce', clueIds: [...clueIds] })),
    { kind: 'deduce', clueIds: found.slice(0, 2) },
    ...run.garbledClueIds.map((clueId): Intent => ({ kind: 'reread', clueId })),
    { kind: 'use', itemId: 'coffee' },
  ];
}

/** Plays turns by trying intents in an order drawn from the seed, keeping the first the engine accepts. */
function explore(
  detectiveCase: DetectiveCase,
  seed: string,
  turns: number,
): { run: DetectiveRunState; log: RunLog } {
  let run = startRun(detectiveCase, seed);
  let log: RunLog = [];
  const picker = createRng(`${seed}:picker`);
  for (let turn = 0; turn < turns && run.status === 'active'; turn += 1) {
    const options = candidates(run);
    const start = picker.roll(options.length) - 1;
    for (let offset = 0; offset < options.length; offset += 1) {
      const intent = options[(start + offset) % options.length];
      if (intent === undefined) continue;
      const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
      if (!resolution.ok) continue;
      log = recordResolution(log, run, intent, resolution);
      run = resolution.run;
      break;
    }
  }
  return { run, log };
}

describe('viewTurns', () => {
  it('is empty before the first turn', () => {
    expect(viewTurns(startRun(cheeseCase(), 'a'), [])).toEqual([]);
  });

  it('shows what the player did, newest first, with the day and the hour each turn ended at', () => {
    const detectiveCase = cheeseCase();
    let run = startRun(detectiveCase, 'story');
    let log: RunLog = [];
    for (const intent of [
      { kind: 'look' },
      { kind: 'move', locationId: 'cheese-stall' },
      { kind: 'rest' },
    ] as Intent[]) {
      const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
      if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
      log = recordResolution(log, run, intent, resolution);
      run = resolution.run;
    }

    const turns = viewTurns(run, log);

    expect(turns.map(({ kind, turn }) => [kind, turn])).toEqual([
      ['rest', 3],
      ['move', 2],
      ['look', 1],
    ]);
    expect(turns[1]).toMatchObject({ kind: 'move', to: 'Cheese stall', entered: true });
    expect(turns[2]).toMatchObject({ kind: 'look', day: 1 });
    expect(turns[0]?.day).toBeGreaterThan(1);
  });

  it('keeps only the last turns that were asked for', () => {
    const { run, log } = explore(cheeseCase(), 'long', 30);

    expect(viewTurns(run, log).length).toBeLessThanOrEqual(DEFAULT_TURNS_SHOWN);
    expect(viewTurns(run, log, 3)).toHaveLength(Math.min(3, log.length));
    expect(viewTurns(run, log, 3)[0]?.turn).toBe(log.at(-1)?.turn);
    expect(viewTurns(run, log, 0)).toEqual([]);
  });

  it('names a place, a suspect or a clue it cannot find by its id', () => {
    const detectiveCase = cheeseCase();
    const run = startRun(detectiveCase, 'odd');
    const entry = (outcome: unknown) =>
      ({
        turn: 1,
        intent: { kind: 'look' },
        rngStateBefore: 1,
        details: [],
        outcome,
        clock: { day: 1, minute: 500 },
        reputation: 10,
        condition: { nerves: 10, sleepDebt: 0, conditions: [] },
        supplies: {},
        pendingEffects: [],
        status: 'active',
        endReason: null,
        worldEvents: [],
        randomEvents: [],
        night: null,
      }) as unknown as RunLog[number];
    const log: RunLog = [
      entry({ kind: 'move', from: 'a', to: 'nowhere', entered: false, minutes: 10, consequences: [] }),
      entry({
        kind: 'interrogate',
        suspectId: 'ghost',
        approach: 'social',
        minutes: 20,
        succeeded: false,
        stance: 'holds',
        alibi: '',
        presented: [],
        conceded: [],
        secret: null,
        reputationChange: 0,
        consequences: [],
      }),
      entry({ kind: 'reread', clueId: 'lost-clue', minutes: 10 }),
      entry({ kind: 'deduce', result: 'insight', deductionId: 'missing', minutes: 10 }),
    ];

    const turns = viewTurns(run, log);

    expect(turns).toMatchObject([
      { kind: 'deduce', result: 'insight', insight: null },
      { kind: 'reread', clue: 'lost-clue' },
      { kind: 'interrogate', suspect: 'ghost', showed: 0 },
      { kind: 'move', to: 'nowhere', entered: false },
    ]);
  });
});

describe('the turns of a run', () => {
  it('say how a deduction ended, and name the conclusion only when it was drawn', () => {
    const detectiveCase = cheeseCase();
    const results = new Set<string>();
    for (let index = 0; index < 40; index += 1) {
      const { run, log } = explore(detectiveCase, `deduce-${String(index)}`, 40);
      for (const turn of viewTurns(run, log, 100)) {
        if (turn.kind !== 'deduce') continue;
        results.add(turn.result);
        expect(turn.insight !== null).toBe(turn.result === 'insight');
      }
    }

    expect(results.has('insight')).toBe(true);
  });

  it('cover every kind of turn there is, over many runs of every sample case', () => {
    const kinds = new Set<string>();
    for (const detectiveCase of sampleCases()) {
      for (let index = 0; index < 25; index += 1) {
        const { run, log } = explore(detectiveCase, `kinds-${String(index)}`, 40);
        for (const turn of viewTurns(run, log, 100)) kinds.add(turn.kind);
      }
    }

    for (const kind of ['look', 'move', 'search', 'rest', 'interrogate', 'deduce', 'use']) {
      expect(kinds.has(kind), kind).toBe(true);
    }
  });

  it('hold nothing of the truth: no hidden trait, no clue that was not found, no secret, no culprit', () => {
    for (const detectiveCase of sampleCases()) {
      for (let index = 0; index < 25; index += 1) {
        const { run, log } = explore(detectiveCase, `leak-${String(index)}`, 40);
        const shown = JSON.stringify(viewTurns(run, log, 100));
        const found = new Set(run.foundClueIds);

        for (const clue of detectiveCase.clues) {
          if (!found.has(clue.id)) {
            expect(shown, clue.id).not.toContain(clue.id);
            expect(shown, clue.description).not.toContain(clue.description);
          }
        }
        for (const trait of run.traits) expect(shown).not.toContain(trait.id);
        for (const suspect of detectiveCase.suspects) {
          expect(shown).not.toContain(suspect.secret);
          expect(shown).not.toContain(suspect.id === detectiveCase.truth.culpritId ? 'culpritId' : '\u0000');
        }
        expect(shown).not.toContain(detectiveCase.truth.motive);
        expect(shown).not.toContain(detectiveCase.truth.method);
        expect(shown).not.toMatch(/rngState|difficulty|critical|isRedHerring|pointsTo|culprit/);
        // The projection takes named fields only: nothing of an entry's checks comes through.
        for (const turn of viewTurns(run, log, 100)) {
          expect(Object.keys(turn).every((key) => /^[a-z]+$/.test(key))).toBe(true);
        }
      }
    }
  });

  it('show an unrecorded accusation as made, and not what came of it', () => {
    const detectiveCase = cheeseCase();
    let run = startRun(detectiveCase, 'accuse');
    let log: RunLog = [];
    const intent: Intent = {
      kind: 'accuse',
      culpritId: detectiveCase.truth.culpritId,
      motiveInsightId: null,
      evidenceClueIds: [],
    };
    const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
    if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
    log = recordResolution(log, run, intent, resolution);
    run = resolution.run;

    const [turn] = viewTurns(run, log);

    expect(turn).toMatchObject({ kind: 'accuse' });
    expect(Object.keys(turn ?? {}).sort()).toEqual(['day', 'kind', 'minute', 'turn']);
  });
});

describe('the chronicle of the view', () => {
  const eventful = (): DetectiveRunState => {
    const detectiveCase = DetectiveCaseSchema.parse({
      ...buildCheeseCase(),
      clock: {
        days: 3,
        worldEvents: [
          { day: 2, description: 'The market closes early.' },
          { day: 3, description: 'The mayor resigns.' },
        ],
      },
    });
    return startRun(detectiveCase, 'timeline');
  };

  it('counts the working time left: today to midnight, then each full day after it', () => {
    const run = eventful();

    // 08:00 on day 1 of 3: 16 hours today, 16 on each of the two days after.
    expect(viewRun(run).chronicle.activeMinutesLeft).toBe(16 * 60 * 3);
    expect(viewRun({ ...run, clock: { day: 3, minute: 20 * 60 } }).chronicle.activeMinutesLeft).toBe(4 * 60);
  });

  it('lists only the events that have come, with their days, oldest first', () => {
    const run = eventful();

    expect(viewRun(run).chronicle.events).toEqual([]);
    expect(viewRun({ ...run, clock: { day: 2, minute: 480 } }).chronicle.events).toEqual([
      { day: 2, text: 'The market closes early.' },
    ]);
    expect(
      viewRun({ ...run, clock: { day: 3, minute: 480 } }).chronicle.events.map(({ day }) => day),
    ).toEqual([2, 3]);
  });

  it('puts the random events the night drew among them, in the order of their days', () => {
    const base = eventful();
    const withPool = {
      ...base,
      case: {
        ...base.case,
        randomEvents: [
          {
            id: 'fog',
            description: 'A fog settles over the square.',
            weight: 1,
            tones: [],
            fromDay: 1,
            untilDay: null,
            traitTriggers: [],
            effect: { kind: 'flavor' },
            duration: { kind: 'instant' },
          },
        ],
      },
      drawnEvents: [{ eventId: 'fog', day: 2 }],
      clock: { day: 3, minute: 480 },
    } as unknown as DetectiveRunState;

    expect(viewRun(withPool).chronicle.events).toEqual([
      { day: 2, text: 'The market closes early.' },
      { day: 2, text: 'A fog settles over the square.' },
      { day: 3, text: 'The mayor resigns.' },
    ]);
    expect(viewRun(withPool).news).toEqual([
      'The market closes early.',
      'The mayor resigns.',
      'A fog settles over the square.',
    ]);
  });
});
