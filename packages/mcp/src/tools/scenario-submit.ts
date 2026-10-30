// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import {
  ARCHETYPES,
  EMPTY_RUN_LOG,
  createDetectiveRun,
  createRng,
  rollTraits,
  validateCase,
  type CaseIssue,
  type CaseIssueCode,
} from '@the-race/engine';
import { saveRun } from '@the-race/saves';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { clearPending, savePending } from '../pending-run.js';
import { MAX_CASE_ATTEMPTS, openPendingRun } from './generator-brief.js';

/** What a generator is told at most: a long list of issues helps nobody. */
const MAX_ISSUES = 8;
const MAX_MESSAGE_LENGTH = 240;
const MAX_PATH_LENGTH = 120;
/** Large enough for any case the schema allows; a bigger text is not one. */
const MAX_CASE_TEXT_LENGTH = 400_000;

/** The most fundamental problems first (a lower number): a case that does not parse has nothing else to fix yet. */
const ISSUE_PRIORITY: Record<CaseIssueCode, number> = {
  schema: 0,
  'duplicate-id': 1,
  'unknown-reference': 2,
  'locale-mismatch': 3,
  'wrong-language': 4,
  'wrong-script': 5,
  'real-name': 6,
  'unreachable-location': 7,
  'unobtainable-clue': 8,
  'unreachable-suspect': 9,
  'too-few-evidence-chains': 10,
  'overlapping-evidence-chains': 11,
  'red-herring-in-evidence-chain': 12,
  'unobtainable-evidence': 13,
  'evidence-chain-misses-culprit': 14,
  'no-chain-without-untrained-skill': 15,
  'unobtainable-motive': 16,
  'unlikely-solution': 17,
  'unbreakable-lie': 18,
  'culprit-not-at-crime': 19,
  'actor-in-two-places': 20,
  'too-many-red-herrings': 21,
  'world-event-out-of-range': 22,
  'event-cuts-solution': 23,
  'random-event-out-of-range': 24,
  'random-event-cuts-solution': 25,
  'random-event-violence': 26,
  'solution-after-culprit-flees': 27,
};

function priorityOf(issue: CaseIssue): number {
  return ISSUE_PRIORITY[issue.code];
}

function clip(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

/** Most important first, capped, and each one short. Array.sort is stable, so ties keep the engine's order. */
export function compactIssues(issues: readonly CaseIssue[]): {
  issues: { code: string; path: string; message: string }[];
  moreIssues: number;
} {
  const shown = [...issues].sort((a, b) => priorityOf(a) - priorityOf(b)).slice(0, MAX_ISSUES);
  return {
    issues: shown.map(({ code, path, message }) => ({
      code,
      path: clip(path, MAX_PATH_LENGTH),
      message: clip(message, MAX_MESSAGE_LENGTH),
    })),
    moreIssues: issues.length - shown.length,
  };
}

function readCase(input: string | Record<string, unknown>): unknown {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input);
  } catch {
    // A text that is not JSON still costs an attempt: the validator reports it like any schema error.
    return undefined;
  }
}

/**
 * Submissions are applied one at a time. Two at once would both read the same attempt count, so a
 * generator could get a fourth try, or an accepted case could be written twice.
 */
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

const FINAL_REASON = 'All three attempts were used and the engine accepted none of the cases.';

export const scenarioSubmit = defineTool({
  name: 'scenario_submit',
  description:
    'For the case generator only. Submits one complete case, as JSON text or as an object, to the engine. ' +
    "The engine validates it for this run's hero. If it is accepted the engine seals it and starts the run, " +
    'and the result is just {"accepted":true}: stop and answer "accepted". If it is not, the result lists ' +
    'the issues (code, path, message), most important first, and how many attempts are left: fix exactly ' +
    'those and submit the whole case again. At most three submissions are allowed; after that the result ' +
    'has "final":true and the run reports a failure, so stop and answer "failed: <reason>". An accepted ' +
    'case can never be replaced. Never repeat a submission that was accepted.',
  inputSchema: z.object({
    case: z.union([z.string().max(MAX_CASE_TEXT_LENGTH), z.record(z.string(), z.unknown())]),
  }),
  outputSchema: z.object({
    accepted: z.boolean(),
    attemptsLeft: z.int().optional(),
    final: z.boolean().optional(),
    reason: z.string().optional(),
    issues: z.array(z.object({ code: z.string(), path: z.string(), message: z.string() })).optional(),
    moreIssues: z.int().optional(),
  }),
  handler: (input, context) =>
    serialized(async () => {
      const { pending, hero } = await openPendingRun(context);
      if (pending.failed || pending.attempts >= MAX_CASE_ATTEMPTS) {
        return { accepted: false, attemptsLeft: 0, final: true, reason: FINAL_REASON };
      }

      const result = validateCase(readCase(input.case), {
        hero,
        traits: pending.traits,
        locale: pending.locale,
        // Phase 3 hands the names found in the headlines here; there are none yet.
        realNames: [],
      });

      if (result.isValid) {
        // The dice the run continues with are those after the trait draw, as when the hero was made.
        const rng = createRng(pending.seed);
        rollTraits(rng, ARCHETYPES[hero.archetype].traits);
        const run = createDetectiveRun({
          hero,
          traits: pending.traits,
          case: result.detectiveCase,
          seed: pending.seed,
          rngState: rng.state(),
          locale: pending.locale,
        });
        await saveRun(context.saveDir, run, context.saveFs, EMPTY_RUN_LOG);
        await clearPending(context.saveDir, context.saveFs);
        return { accepted: true };
      }

      const attempts = pending.attempts + 1;
      const attemptsLeft = MAX_CASE_ATTEMPTS - attempts;
      await savePending(
        context.saveDir,
        { ...pending, attempts, failed: attemptsLeft === 0 },
        context.saveFs,
      );
      if (attemptsLeft === 0) return { accepted: false, attemptsLeft, final: true, reason: FINAL_REASON };
      return { accepted: false, attemptsLeft, ...compactIssues(result.issues) };
    }),
});
