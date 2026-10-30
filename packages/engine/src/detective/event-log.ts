// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { canonicalJson } from '../canonical-json.js';
import { restoreRng } from '../dice.js';
import {
  EndReasonSchema,
  RunClockSchema,
  RunStatusSchema,
  type EndReason,
  type RunClock,
  type RunStatus,
} from '../run.js';
import { IntentSchema, resolveIntent, type Intent, type Resolution } from './actions.js';
import { HeroConditionSchema } from './condition.js';
import { EntityIdSchema } from './case-schema.js';
import { daysPassed } from './clock.js';
import { INTERROGATION_APPROACHES } from './interrogation.js';
import type { DetectiveRunState } from './run-state.js';
import { VERDICTS, type Verdict } from './verdict.js';

// The run log is ENGINE-SIDE ONLY. Its entries hold the full details of every check, which name the clues
// that were rolled for whether or not the hero found them, and an accusation's entry holds the truth. It
// goes to saves, reports and statistics, never to `viewRun` or to the narrator. It is kept apart from
// `DetectiveRunState` on purpose: the state is what a turn reads, the log is what a turn wrote, so the log
// can grow, be trimmed for a report or be stored beside the state without touching the state's schema.

const SkillCheckResultSchema = z.object({
  skill: z.string().min(1),
  die: z.int().min(1),
  skillLevel: z.int(),
  modifier: z.int(),
  total: z.int(),
  difficulty: z.int(),
  critical: z.enum(['success', 'failure']).nullable(),
  success: z.boolean(),
  rngState: z.int().min(0).max(0xffffffff),
});

const CheckDetailSchema = z.object({
  subject: z.object({ kind: z.enum(['clue', 'location', 'suspect']), id: z.string().min(1) }),
  result: z.union([SkillCheckResultSchema, z.literal('auto')]),
});

const ConsequenceSchema = z.enum(['time-lost', 'reputation-lost']);
const minutes = z.int().min(0);
const idList = z.array(EntityIdSchema);

const OutcomeSchema = z.union([
  z.object({ kind: z.literal('look'), foundClueIds: idList, minutes }),
  z.object({
    kind: z.literal('move'),
    from: EntityIdSchema,
    to: EntityIdSchema,
    entered: z.boolean(),
    minutes,
    consequences: z.array(ConsequenceSchema),
  }),
  z.object({
    kind: z.literal('search'),
    foundClueIds: idList,
    minutes,
    consequences: z.array(ConsequenceSchema),
  }),
  z.object({
    kind: z.literal('interrogate'),
    suspectId: EntityIdSchema,
    approach: z.enum(INTERROGATION_APPROACHES),
    minutes,
    succeeded: z.boolean(),
    stance: z.enum(['holds', 'gives-ground']),
    alibi: z.string(),
    presented: z.array(z.object({ clueId: EntityIdSchema, effect: z.enum(['breaks-lie', 'no-effect']) })),
    conceded: z.array(z.object({ lieId: EntityIdSchema, statement: z.string() })),
    secret: z.string().nullable(),
    reputationChange: z.int(),
    consequences: z.array(ConsequenceSchema),
  }),
  z.object({
    kind: z.literal('deduce'),
    result: z.enum(['insight', 'already-known']),
    deductionId: EntityIdSchema,
    minutes,
  }),
  z.object({
    kind: z.literal('deduce'),
    result: z.literal('nothing'),
    minutes,
    consequences: z.tuple([z.literal('time-lost')]),
  }),
  z.object({
    kind: z.literal('accuse'),
    verdict: z.enum(VERDICTS),
    culpritRight: z.boolean(),
    motiveRight: z.boolean(),
    evidenceComplete: z.boolean(),
    truth: z.object({
      culpritId: EntityIdSchema,
      motive: z.string(),
      method: z.string(),
      crimeLocationId: EntityIdSchema,
    }),
  }),
]);

/** One turn that was carried out. A refused intent changes nothing, so it leaves no entry. */
export const LogEntrySchema = z.object({
  /** The number the run had after the turn: entries of one log count up by one. */
  turn: z.int().min(1),
  intent: IntentSchema,
  /** The state of the dice before the turn: with it, the turn can be rolled again. */
  rngStateBefore: z.int().min(0).max(0xffffffff),
  details: z.array(CheckDetailSchema),
  outcome: OutcomeSchema,
  /** The state of the run after the turn. */
  clock: RunClockSchema,
  reputation: z.int().min(0),
  /** Nerves, sleep debt and conditions after the turn, so that a replay reproduces what wears off. */
  condition: HeroConditionSchema,
  status: RunStatusSchema,
  /** Why the run ended on this turn; `null` while it goes on, and for a log from before reasons. */
  endReason: EndReasonSchema.nullable().default(null),
  /** The scheduled events (indices into the case's `clock.worldEvents`) that fired as the days turned. */
  worldEvents: z.array(z.int().min(0)).default([]),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const RunLogSchema = z.array(LogEntrySchema).superRefine((log, context) => {
  log.forEach((entry, index) => {
    const previous = log[index - 1];
    if (previous !== undefined && entry.turn !== previous.turn + 1) {
      context.addIssue({ code: 'custom', path: [index, 'turn'], message: 'Turns of a log count up by one.' });
    }
    if (previous !== undefined && previous.status !== 'active') {
      context.addIssue({ code: 'custom', path: [index], message: 'Nothing happens after the run is over.' });
    }
  });
});
export type RunLog = readonly LogEntry[];

export const EMPTY_RUN_LOG: RunLog = [];

/** The entry for a turn that `resolution` carried out on `before`; the intent is what the player asked for. */
function entryOf(before: DetectiveRunState, intent: Intent, resolution: Resolution & { ok: true }): LogEntry {
  const { run: after } = resolution;
  return LogEntrySchema.parse({
    turn: after.turn,
    intent,
    rngStateBefore: before.rngState,
    details: resolution.details,
    outcome: resolution.outcome,
    clock: after.clock,
    reputation: after.reputation,
    condition: after.condition,
    status: after.status,
    endReason: after.endReason,
    worldEvents: daysPassed(before.case, before.clock.day, after.clock.day).firedEventIndexes,
  });
}

/** Adds an entry at the end. The log is never edited: the old log is left alone and a new one returned. */
export function appendEntry(log: RunLog, entry: LogEntry): RunLog {
  const last = log[log.length - 1];
  if (last !== undefined && last.status !== 'active') {
    throw new RangeError(`The run ended on turn ${String(last.turn)}; nothing can follow.`);
  }
  if (last !== undefined && entry.turn !== last.turn + 1) {
    throw new RangeError(`Turn ${String(entry.turn)} cannot follow turn ${String(last.turn)}.`);
  }
  return [...log, LogEntrySchema.parse(entry)];
}

/**
 * Writes down a resolution: `before` is the state the intent was given, `input` the intent as it came in.
 * A refusal leaves the log as it was.
 */
export function recordResolution(
  log: RunLog,
  before: DetectiveRunState,
  input: unknown,
  resolution: Resolution,
): RunLog {
  if (!resolution.ok) return log;
  return appendEntry(log, entryOf(before, IntentSchema.parse(input), resolution));
}

export type ReplayFailureCode =
  /** The entry does not pick up where the run stands: a turn or the dice are out of step. */
  | 'out-of-order'
  /** The engine refuses an intent the log says was carried out. */
  | 'refused'
  /** The engine gives another result than the log holds: the rules or the log have changed. */
  | 'diverged';

export type ReplayResult =
  | { readonly ok: true; readonly run: DetectiveRunState }
  | {
      readonly ok: false;
      /** The index of the entry that did not replay. */
      readonly index: number;
      readonly code: ReplayFailureCode;
    };

/**
 * Plays a log again from the state a run started in, with the dice restored from the state: every intent is
 * resolved anew and its entry must come out exactly as it was written. With the same seed and rules the
 * final state is the one the run ended in; any difference stops the replay at the entry where it shows.
 */
export function replay(initial: DetectiveRunState, log: RunLog): ReplayResult {
  let run = initial;
  for (const [index, entry] of log.entries()) {
    if (entry.turn !== run.turn + 1 || entry.rngStateBefore !== run.rngState) {
      return { ok: false, index, code: 'out-of-order' };
    }
    const resolution = resolveIntent(run, entry.intent, restoreRng(run.rngState));
    if (!resolution.ok) return { ok: false, index, code: 'refused' };
    if (canonicalJson(entryOf(run, entry.intent, resolution)) !== canonicalJson(entry)) {
      return { ok: false, index, code: 'diverged' };
    }
    run = resolution.run;
  }
  return { ok: true, run };
}

export interface RunStats {
  readonly turns: number;
  /** Game time spent on the turns. */
  readonly minutes: number;
  /** Checks that were rolled; a clue found without a roll is not one. */
  readonly checksRolled: number;
  readonly checksPassed: number;
  /** Clues found by looking and searching. */
  readonly cluesFound: number;
  readonly insights: number;
  readonly criticalSuccesses: number;
  readonly criticalFailures: number;
  /** The accusation's verdict, or `null` while none was made. */
  readonly verdict: Verdict | null;
  /** The status of the run after its last turn. */
  readonly status: RunStatus;
  /** Why the run ended, or `null` while it goes on. */
  readonly endReason: EndReason | null;
  /** The clock after its last turn, or `null` for an empty log. */
  readonly clock: RunClock | null;
}

/** Everything a report needs, from the log alone. */
export function deriveStats(log: RunLog): RunStats {
  const rolls = log.flatMap(({ details }) =>
    details.flatMap(({ result }) => (result === 'auto' ? [] : [result])),
  );
  const last = log[log.length - 1];
  let verdict: Verdict | null = null;
  let cluesFound = 0;
  let insights = 0;
  let spent = 0;
  for (const { outcome } of log) {
    if ('minutes' in outcome) spent += outcome.minutes;
    if (outcome.kind === 'look' || outcome.kind === 'search') cluesFound += outcome.foundClueIds.length;
    if (outcome.kind === 'deduce' && outcome.result === 'insight') insights += 1;
    if (outcome.kind === 'accuse') verdict = outcome.verdict;
  }
  return {
    turns: log.length,
    minutes: spent,
    checksRolled: rolls.length,
    checksPassed: rolls.filter(({ success }) => success).length,
    cluesFound,
    insights,
    criticalSuccesses: rolls.filter(({ critical }) => critical === 'success').length,
    criticalFailures: rolls.filter(({ critical }) => critical === 'failure').length,
    verdict,
    status: last?.status ?? 'active',
    endReason: last?.endReason ?? null,
    clock: last?.clock ?? null,
  };
}
