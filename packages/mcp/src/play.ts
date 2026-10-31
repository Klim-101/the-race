// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import {
  recordResolution,
  resolveIntent,
  restoreRng,
  viewRun,
  type DetectiveRunState,
  type RunLog,
  REVEAL_REASONS,
  type Revealed,
  type SignalFelt,
} from '@the-race/engine';
import { loadRun, saveRun, type LoadFailureReason } from '@the-race/saves';
import { z } from 'zod';
import type { ServerContext } from './context.js';
import { ToolFailure, refusalToToolError } from './tool-error.js';

/**
 * Every tool that changes a run takes the turn the caller last saw. A call whose turn is not the run's own
 * turn is refused untouched, so a call that was sent twice (a retry after a timeout, a model that repeats
 * itself) can never be carried out twice.
 */
export const TurnSchema = z
  .int()
  .min(0)
  .describe(
    'The run\'s current turn number, exactly as `turn` in the last run_view or in the "view" of the last ' +
      'result. A stale number is refused with the code "stale-turn" and nothing changes.',
  );

/** What a tool says after a turn: enough to carry on, nothing the player has not seen. Full state is run_view. */
export const RunSummarySchema = z.object({
  /** The case's title and the language of the run: a HUD that listens to the tools tells one run from the next. */
  title: z.string(),
  locale: z.enum(['ru', 'en']),
  turn: z.int().min(0),
  status: z.enum(['active', 'won', 'lost', 'gave-up']),
  endReason: z.string().nullable(),
  clock: z.object({ day: z.int(), minute: z.int(), totalDays: z.int() }),
  reputation: z.int(),
  warnings: z.array(z.string()),
  location: z.object({ id: z.string(), name: z.string() }),
  /** The places the hero knows, as in `run_view`, so a HUD never has to rebuild the map from the exits. */
  map: z.object({
    current: z.string(),
    places: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        visited: z.boolean(),
        blocked: z.enum(['locked', 'closed']).nullable(),
      }),
    ),
    links: z.array(z.object({ from: z.string(), to: z.string() })),
  }),
  clueCount: z.int(),
  insightCount: z.int(),
});

export function summarizeRun(run: DetectiveRunState): z.input<typeof RunSummarySchema> {
  const view = viewRun(run);
  return {
    title: view.title,
    locale: view.locale,
    turn: view.turn,
    status: view.status,
    endReason: run.endReason,
    clock: view.clock,
    reputation: view.reputation,
    warnings: [...view.warnings],
    location: { id: view.location.id, name: view.location.name },
    map: {
      current: view.map.current,
      places: view.map.places.map((place) => ({ ...place })),
      links: view.map.links.map((link) => ({ ...link })),
    },
    clueCount: view.clues.length,
    insightCount: view.insights.length,
  };
}

/** An engine outcome as the narrator gets it; the engine builds it to hold nothing that is still secret. */
export const OutcomeSchema = z.looseObject({ kind: z.string() });

/** The result of a tool that played one turn. */
/** A random event that happened during the turn, in the words of the case and by the kind of effect it had. */
export const TurnEventSchema = z.object({ description: z.string(), effect: z.string() });

/**
 * What the hero's character signal did in the turn, in words and never as a number: it `helped` or `hindered` a
 * check of a skill, or `shielded` a meter from a loss. Public data of the hero, like the signal itself.
 */
export const FeltSignalSchema = z.object({
  signal: z.string(),
  effect: z.enum(['helped', 'hindered', 'shielded']),
  skill: z.string().optional(),
  meter: z.string().optional(),
});

/**
 * A hidden trait that showed itself in the turn: from here on it is public, with its effects, in `run_view`.
 * `reason` says how it showed: it shifted a `modifier`, found a clue without a roll (`auto-discover`), shut a
 * source (`lock-out`) or brought a debt collector who cost an hour (`spawn-event`).
 */
export const RevealedTraitSchema = z.object({
  trait: z.string(),
  polarity: z.enum(['positive', 'negative', 'mixed']),
  reason: z.enum(REVEAL_REASONS),
});

export const TurnResultSchema = z.object({
  outcome: OutcomeSchema,
  /** The random events this turn brought (in the day, at midday or in the evening, or in the night); often none. */
  events: z.array(TurnEventSchema).default([]),
  /** What the signal did in this turn; empty for a hero without a signal and for a turn it did not touch. */
  felt: z.array(FeltSignalSchema).default([]),
  /** The hidden traits this turn showed, each told once; empty on most turns. */
  revealed: z.array(RevealedTraitSchema).default([]),
  view: RunSummarySchema,
});

const SAVE_PROBLEMS: Record<Exclude<LoadFailureReason, 'missing'>, string> = {
  corrupt: 'The saved run is damaged and cannot be read.',
  'unsupported-version': 'The saved run was made by another version of the game.',
  unreadable: 'The saved run could not be read from the disk.',
  'log-mismatch': 'The saved run does not match its own history.',
};

/** The failure for a save that exists but cannot be used. Nothing about the file or its place is told. */
export function saveUnusable(reason: Exclude<LoadFailureReason, 'missing'>): ToolFailure {
  return new ToolFailure({
    code: 'save-unusable',
    message: SAVE_PROBLEMS[reason],
    remediation:
      'Tell the player in one plain sentence that the save cannot be loaded, and do not start another run ' +
      'over it. The player can move the save folder away to start fresh.',
  });
}

export interface SavedRun {
  readonly run: DetectiveRunState;
  readonly log: RunLog;
}

/** The run on disk, or a `ToolFailure` that says why there is none. */
export async function requireRun(context: ServerContext): Promise<SavedRun> {
  const loaded = await loadRun(context.saveDir, context.saveFs);
  if (loaded.ok) return { run: loaded.run, log: loaded.log };
  if (loaded.reason === 'missing') {
    throw new ToolFailure({
      code: 'no-run',
      message: 'There is no run to play.',
      remediation: 'Call run_view to see where things stand; if there is no run, offer the player a new one.',
    });
  }
  throw saveUnusable(loaded.reason);
}

/** Refuses a call made against an old view of the run. */
export function assertFreshTurn(run: DetectiveRunState, turn: number): void {
  if (run.turn !== turn) {
    throw new ToolFailure({
      code: 'stale-turn',
      message: `The run is at turn ${String(run.turn)}, not turn ${String(turn)}. Nothing was changed.`,
      remediation:
        'Call run_view and use its `turn`. The earlier call may already have been carried out: look at ' +
        'the view before deciding whether to act again.',
    });
  }
}

/** The engine's `felt` effects of a turn, named by the signal of the hero and put into words. */
function feltOfTurn(run: DetectiveRunState, felt: readonly SignalFelt[]): z.input<typeof FeltSignalSchema>[] {
  const signal = run.hero.signalId;
  return signal === undefined
    ? []
    : felt.map((item) =>
        item.kind === 'shield'
          ? { signal, effect: 'shielded' as const, meter: item.meter }
          : {
              signal,
              effect: item.amount > 0 ? ('helped' as const) : ('hindered' as const),
              skill: item.skill,
            },
      );
}

/** The traits the engine showed in a turn, with the polarity the narrator needs for the tone. */
function revealedOfTurn(revealed: readonly Revealed[]): z.input<typeof RevealedTraitSchema>[] {
  return revealed.map(({ traitId, polarity, reason }) => ({ trait: traitId, polarity, reason }));
}

/** The random events drawn between two states of a run: what the turn brought, already applied by the engine. */
function eventsOfTurn(
  before: DetectiveRunState,
  after: DetectiveRunState,
): z.input<typeof TurnEventSchema>[] {
  const pool = after.case.randomEvents ?? [];
  return after.drawnEvents
    .slice(before.drawnEvents.length)
    .flatMap(({ eventId }) => pool.filter(({ id }) => id === eventId))
    .map(({ description, effect }) => ({ description, effect: effect.kind }));
}

/**
 * Plays one intent on the saved run: checks the turn, resolves it on the run's own dice, writes the turn to
 * the run's log and saves both. A refusal changes nothing, not even the file. The outcome returned is what
 * the engine says the narrator may know; the engine's check details stay in the log.
 */
export async function playIntent(
  context: ServerContext,
  turn: number,
  intent: unknown,
): Promise<z.input<typeof TurnResultSchema>> {
  const { run, log } = await requireRun(context);
  assertFreshTurn(run, turn);
  const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
  if (!resolution.ok) throw new ToolFailure(refusalToToolError(resolution.refusal));
  await saveRun(
    context.saveDir,
    resolution.run,
    context.saveFs,
    recordResolution(log, run, intent, resolution),
  );
  return {
    outcome: { ...resolution.outcome },
    events: eventsOfTurn(run, resolution.run),
    felt: feltOfTurn(run, resolution.felt ?? []),
    revealed: revealedOfTurn(resolution.revealed),
    view: summarizeRun(resolution.run),
  };
}
