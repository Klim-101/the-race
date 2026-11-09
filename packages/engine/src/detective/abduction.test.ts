// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng } from '../dice.js';
import { MINUTES_PER_DAY } from '../run.js';
import { ABDUCTION_RULESET_VERSION, deadlineAt, minutesToDeadline, runMinuteOf } from './abduction.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { settleClock } from './clock.js';
import { createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';
import { accuse } from './verdict.js';

const raw = DetectiveCaseSchema.parse(buildCheeseCase());
const CULPRIT = raw.truth.culpritId;
const INNOCENT = raw.suspects.map(({ id }) => id).find((id) => id !== CULPRIT) ?? '';
const KEPT_AT = raw.locations[0]?.id ?? '';
const ELSEWHERE = raw.locations[1]?.id ?? '';
/** 23:00 of the second day. */
const DEADLINE = 2820;
const ALL_CLUES = raw.clues.map(({ id }) => id);
const PROOF = {
  motiveInsightId: raw.solution.motiveDeductionId,
  evidenceClueIds: raw.solution.evidenceChains[0] ?? [],
};

function abductionRun(rulesetVersion?: number): DetectiveRunState {
  const built = { ...buildCheeseCase(), form: 'abduction' };
  built.truth.abduction = {
    victim: { kind: 'pet', name: 'Gouda, the cheese-shop cat' },
    whereabouts: KEPT_AT,
    deadlineMinute: DEADLINE,
  };
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(built),
    seed: 'abduction',
    rngState: 1,
    locale: 'en',
  });
  return {
    ...run,
    ...(rulesetVersion === undefined ? {} : { rulesetVersion }),
    foundClueIds: ALL_CLUES,
    insightIds: [raw.solution.motiveDeductionId],
  };
}

function whodunitRun(): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'whodunit',
    rngState: 1,
    locale: 'en',
  });
  return { ...run, foundClueIds: ALL_CLUES, insightIds: [raw.solution.motiveDeductionId] };
}

const at = (run: DetectiveRunState, day: number, minute: number): DetectiveRunState => ({
  ...run,
  clock: { day, minute },
});

describe('the clock of an abduction', () => {
  it('counts the run from midnight of day 1 as one number', () => {
    expect(runMinuteOf({ day: 1, minute: 0 })).toBe(0);
    expect(runMinuteOf({ day: 2, minute: 23 * 60 })).toBe(MINUTES_PER_DAY + 23 * 60);
    expect(runMinuteOf({ day: 2, minute: 23 * 60 })).toBe(DEADLINE);
  });

  it('tells the minutes left to the deadline, and none left once it is reached', () => {
    expect(minutesToDeadline(at(abductionRun(), 2, 22 * 60))).toBe(60);
    expect(minutesToDeadline(at(abductionRun(), 2, 23 * 60))).toBe(0);
    expect(minutesToDeadline(at(abductionRun(), 3, 8 * 60))).toBe(0);
  });

  it('has no deadline in a whodunit, nor in a run of a ruleset before it', () => {
    expect(minutesToDeadline(whodunitRun())).toBeNull();
    expect(minutesToDeadline(abductionRun(ABDUCTION_RULESET_VERSION - 1))).toBeNull();
  });

  it('tells the day and the hour the deadline falls at, as the hero reads them off the clock', () => {
    expect(deadlineAt(abductionRun())).toEqual({ day: 2, minute: 23 * 60 });
  });

  it('shows the deadline that closes a day as the end of that day, not as the start of the next', () => {
    const run = abductionRun();
    const closing = {
      ...run,
      case: {
        ...run.case,
        truth: {
          ...run.case.truth,
          abduction: { ...run.case.truth.abduction!, deadlineMinute: 2 * MINUTES_PER_DAY },
        },
      },
    };

    expect(deadlineAt(closing)).toEqual({ day: 2, minute: MINUTES_PER_DAY });
  });

  it('puts the time left and the moment of the deadline in the view of the run', () => {
    const view = viewRun(at(abductionRun(), 2, 22 * 60)).chronicle;

    expect(view).toMatchObject({ minutesToDeadline: 60, deadline: { day: 2, minute: 23 * 60 } });
    expect(viewRun(whodunitRun()).chronicle).toMatchObject({ minutesToDeadline: null, deadline: null });
  });

  it('has no moment for a deadline in a run of a ruleset before it', () => {
    expect(deadlineAt(abductionRun(ABDUCTION_RULESET_VERSION - 1))).toBeNull();
  });

  it('keeps the run going while there is time', () => {
    const settled = settleClock(at(abductionRun(), 2, 22 * 60 + 59), 2);

    expect(settled.status).toBe('active');
  });

  it('loses the run when the clock reaches the deadline before the victim is found', () => {
    expect(settleClock(at(abductionRun(), 2, 23 * 60), 2)).toMatchObject({
      status: 'lost',
      endReason: 'deadline-passed',
    });
  });

  it('does not end a whodunit, or an older run, at any minute', () => {
    expect(settleClock(at(whodunitRun(), 2, 23 * 60 + 30), 2).status).toBe('active');
    expect(settleClock(at(abductionRun(ABDUCTION_RULESET_VERSION - 1), 2, 23 * 60 + 30), 2).status).toBe(
      'active',
    );
  });
});

describe('the accusation of an abduction', () => {
  const accuseWith = (
    run: DetectiveRunState,
    culpritId: string,
    whereaboutsId?: string,
    proof: { motiveInsightId: string | null; evidenceClueIds: string[] } = PROOF,
  ) =>
    accuse(
      run,
      { kind: 'accuse', culpritId, ...(whereaboutsId === undefined ? {} : { whereaboutsId }), ...proof },
      createRng(1),
    );

  it('is proven when the culprit and the place are right and the proof holds', () => {
    const resolution = accuseWith(abductionRun(), CULPRIT, KEPT_AT);

    expect(resolution).toMatchObject({
      ok: true,
      run: { status: 'won', endReason: 'proven' },
      outcome: {
        verdict: 'proven',
        culpritRight: true,
        placeRight: true,
        truth: { whereaboutsId: KEPT_AT },
      },
    });
  });

  it('falls short when both are right but the proof does not hold', () => {
    const resolution = accuseWith(abductionRun(), CULPRIT, KEPT_AT, {
      motiveInsightId: null,
      evidenceClueIds: [],
    });

    expect(resolution).toMatchObject({ ok: true, outcome: { verdict: 'unproven', placeRight: true } });
  });

  describe('of a case that asks for the place to be deduced', () => {
    const WHERE = 'where-gouda';
    /** The abduction whose place is a conclusion, the hero holding or not holding it. */
    function deducedRun(drawn: boolean): DetectiveRunState {
      const built = { ...buildCheeseCase(), form: 'abduction' };
      built.truth.abduction = {
        victim: { kind: 'pet', name: 'Gouda, the cheese-shop cat' },
        whereabouts: KEPT_AT,
        deadlineMinute: DEADLINE,
      };
      built.deductions.push({
        id: WHERE,
        clueIds: [ALL_CLUES[0] ?? '', ALL_CLUES[1] ?? ''],
        insight: 'There.',
      });
      (built.solution as { whereaboutsDeductionId?: string }).whereaboutsDeductionId = WHERE;
      const run = createDetectiveRun({
        hero: buildHero(),
        traits: [],
        case: DetectiveCaseSchema.parse(built),
        seed: 'abduction',
        rngState: 1,
        locale: 'en',
      });
      const insights = [raw.solution.motiveDeductionId, ...(drawn ? [WHERE] : [])];
      return { ...run, foundClueIds: ALL_CLUES, insightIds: insights };
    }

    it('is proven when the place was reasoned to', () => {
      expect(accuseWith(deducedRun(true), CULPRIT, KEPT_AT)).toMatchObject({
        ok: true,
        outcome: { verdict: 'proven', placeRight: true },
      });
    });

    it('is not proven when the place was right and only picked: a guess proves nothing', () => {
      const resolution = accuseWith(deducedRun(false), CULPRIT, KEPT_AT);

      expect(resolution).toMatchObject({
        ok: true,
        run: { status: 'lost', endReason: 'unproven' },
        outcome: { verdict: 'unproven', placeRight: true, shortfall: { place: { drawn: false } } },
      });
    });

    it('is told, once the place has been reasoned to but the proof fell short, that the place held', () => {
      const resolution = accuseWith(deducedRun(true), CULPRIT, KEPT_AT, {
        motiveInsightId: null,
        evidenceClueIds: [],
      });

      expect(resolution).toMatchObject({
        ok: true,
        outcome: { verdict: 'unproven', shortfall: { place: { drawn: true } } },
      });
    });

    it('asks nothing of the place in a case that never asked, so its shortfall has no word of it', () => {
      const resolution = accuseWith(abductionRun(), CULPRIT, KEPT_AT, {
        motiveInsightId: null,
        evidenceClueIds: [],
      });

      expect(resolution.ok && resolution.outcome.shortfall).not.toHaveProperty('place');
    });

    it('is wrong, as ever, for a place that was not the place', () => {
      expect(accuseWith(deducedRun(true), CULPRIT, ELSEWHERE)).toMatchObject({
        ok: true,
        outcome: { verdict: 'wrong', placeRight: false },
      });
    });
  });

  it('is wrong when the culprit is right and the place is not', () => {
    expect(accuseWith(abductionRun(), CULPRIT, ELSEWHERE)).toMatchObject({
      ok: true,
      run: { status: 'lost', endReason: 'wrong' },
      outcome: { verdict: 'wrong', culpritRight: true, placeRight: false },
    });
  });

  it('is wrong when the place is right and the culprit is not', () => {
    expect(accuseWith(abductionRun(), INNOCENT, KEPT_AT)).toMatchObject({
      ok: true,
      outcome: { verdict: 'wrong', culpritRight: false, placeRight: true },
    });
  });

  it('is wrong when neither is right', () => {
    expect(accuseWith(abductionRun(), INNOCENT, ELSEWHERE)).toMatchObject({
      ok: true,
      outcome: { verdict: 'wrong', culpritRight: false, placeRight: false },
    });
  });

  it('is refused, unspent, without a place', () => {
    expect(accuseWith(abductionRun(), CULPRIT)).toMatchObject({
      ok: false,
      refusal: { code: 'place-needed' },
    });
  });

  it('is refused for a place that is not in the case', () => {
    expect(accuseWith(abductionRun(), CULPRIT, 'the-moon')).toMatchObject({
      ok: false,
      refusal: { code: 'unknown-location' },
    });
  });

  it('is refused in a whodunit that is given a place', () => {
    expect(accuseWith(whodunitRun(), CULPRIT, KEPT_AT)).toMatchObject({
      ok: false,
      refusal: { code: 'place-unwanted' },
    });
  });

  it('leaves a whodunit verdict as it was, with no place in it', () => {
    const resolution = accuseWith(whodunitRun(), CULPRIT);

    expect(resolution).toMatchObject({ ok: true, outcome: { verdict: 'proven' } });
    if (resolution.ok) {
      expect(resolution.outcome).not.toHaveProperty('placeRight');
      expect(resolution.outcome.truth).not.toHaveProperty('whereaboutsId');
    }
  });
});
