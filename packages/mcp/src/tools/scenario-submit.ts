// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import {
  EMPTY_RUN_LOG,
  MIN_RANDOM_EVENTS,
  GENERATED_DAYS,
  GENERATED_MAP,
  createDetectiveRun,
  deriveSightingClues,
  toolSlotsOf,
  validateCase,
  worldRealNames,
  PatchOpSchema,
  applyPatch,
  readCaseOrFrame,
  toJsonPointer,
  type CaseIssue,
  type CaseIssueCode,
  type CaseValidationContext,
  type DetectiveCase,
  type PatchOp,
} from '@the-race/engine';
import { makeRunId, saveRun, saveRunSeeds } from '@the-race/saves';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { seedsOfRun } from '../news.js';
import { PENDING_STAGES, clearPending, savePending, type PendingRun } from '../pending-run.js';
import { ToolFailure } from '../tool-error.js';
import { recordsOrNone } from '../profile.js';
import { describeSighting } from '../sighting-text.js';
import { requireWorld } from '../world.js';
import { keepGenerationLog, keepStats } from '../stats.js';
import { MAX_CASE_ATTEMPTS, MAX_FRAME_ATTEMPTS, chooseBrief, openPendingRun } from './generator-brief.js';

/** What a generator is told at most: a long list of issues helps nobody. */
const MAX_ISSUES = 8;
const MAX_MESSAGE_LENGTH = 240;
const MAX_PATH_LENGTH = 120;
/** Large enough for any case the schema allows; a bigger text is not one. */
const MAX_CASE_TEXT_LENGTH = 400_000;

/** The most fundamental problems first (a lower number): a case that does not parse has nothing else to fix yet. */
const ISSUE_PRIORITY: Record<CaseIssueCode, number> = {
  // A patch that did not apply leaves nothing else to judge.
  'patch-failed': -1,
  schema: 0,
  // A blank text is the next thing to fix once the schema is satisfied.
  'text-missing': 0.5,
  'duplicate-id': 1,
  'unknown-reference': 2,
  'locale-mismatch': 3,
  'wrong-language': 4,
  'wrong-script': 5,
  'real-name': 6,
  'map-too-small': 6.2,
  'map-too-large': 6.2,
  'too-few-outdoor-places': 6.4,
  'single-building': 6.6,
  'hidden-start': 6.7,
  'suspect-in-hidden-place': 6.7,
  'empty-public-place': 6.9,
  'parts-missing': 6.8,
  'part-in-wrong-place': 6.8,
  'clue-in-two-parts': 6.8,
  'clue-without-part': 6.8,
  'part-never-shown': 6.8,
  'unreachable-location': 7,
  'unobtainable-clue': 8,
  'unreachable-suspect': 9,
  'clue-not-tied': 9.05,
  'lie-without-admission': 9.06,
  'lie-chain-broken': 9.07,
  'alibi-replaced-twice': 9.075,
  'witness-saw-the-crime': 18.5,
  'chain-without-deduction': 17.5,
  'culprit-cleared': 17.6,
  'suspect-without-true-claim': 17.62,
  'reaction-not-tied': 17.65,
  'reaction-names-trait': 17.66,
  'suspect-cannot-be-cleared': 17.7,
  'red-herring-unexplained': 17.8,
  'red-herring-without-thread': 17.85,
  'unearnable-lead': 9.1,
  'unused-lead': 9.1,
  'false-lead-holds-clue': 9.1,
  'part-without-fallback': 9.2,
  'fallback-unreachable': 9.4,
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
  'too-few-random-events': 27,
  'random-events-miss-a-day': 27.5,
  'run-length-out-of-range': 27.6,
  'solution-after-culprit-flees': 28,
  'clue-draws-conclusion': 29,
};

function priorityOf(issue: CaseIssue): number {
  return ISSUE_PRIORITY[issue.code];
}

function clip(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

const mostImportantFirst = (issues: readonly CaseIssue[]): CaseIssue[] =>
  [...issues].sort((a, b) => priorityOf(a) - priorityOf(b));

/** The distinct codes of all the issues, the most fundamental first: what the log keeps, and never a message. */
export function codesOf(issues: readonly CaseIssue[]): string[] {
  return [...new Set(mostImportantFirst(issues).map(({ code }) => code))];
}

/**
 * Most important first, capped, and each one short. Array.sort is stable, so ties keep the engine's order. A path is
 * a JSON Pointer, so that the generator can patch the very place it is told about.
 */
export function compactIssues(issues: readonly CaseIssue[]): {
  issues: { code: string; path: string; message: string }[];
  moreIssues: number;
} {
  const shown = mostImportantFirst(issues).slice(0, MAX_ISSUES);
  return {
    issues: shown.map(({ code, path, message }) => ({
      code,
      path: clip(toJsonPointer(path), MAX_PATH_LENGTH),
      message: clip(message, MAX_MESSAGE_LENGTH),
    })),
    moreIssues: issues.length - shown.length,
  };
}

function readCase(input: string | Record<string, unknown> | undefined): unknown {
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

const FINAL_REASON = 'All three attempts of a stage were used and the engine accepted no case.';

export const SUBMIT_ERROR_CODES = { caseOrPatch: 'case-or-patch' } as const;

/** At most this many operations in one patch; a fix that needs more is a case to send again. */
const MAX_PATCH_OPERATIONS = 200;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type Submission = { readonly submitted: unknown } | { readonly issue: CaseIssue };

/**
 * The clues in which witnesses tell what they saw are made here, with words in the language of the case: the generator
 * names them (`seen-<witness>-<suspect>`) and writes no text for them. They are added after the clues it wrote, so the
 * paths of the issues stay the places of its own text. In a frame the words are placeholders, and the clues are made
 * again once the texts are written.
 */
const withSightings = (detectiveCase: DetectiveCase): DetectiveCase =>
  deriveSightingClues(detectiveCase, describeSighting(detectiveCase.locale));

/**
 * What was submitted: the case the generator wrote, or the last case with the patch applied. A patch that has no case
 * to go on or does not apply is an issue, and it costs an attempt like any rejection.
 */
function readSubmission(
  input: {
    readonly case?: string | Record<string, unknown> | undefined;
    readonly patch?: readonly PatchOp[] | undefined;
  },
  lastCase: Record<string, unknown> | undefined,
): Submission {
  if (input.patch === undefined) return { submitted: readCase(input.case) };
  const failed = (path: string, message: string): Submission => ({
    issue: { code: 'patch-failed', path, message },
  });
  if (lastCase === undefined) {
    return failed('patch', 'There is no earlier case to patch: send the case itself as `case`.');
  }
  const applied = applyPatch(lastCase, input.patch);
  if (applied.ok) return { submitted: applied.document };
  return failed(
    `patch[${String(applied.index)}]`,
    `The operation "${applied.operation.op} ${applied.operation.path}" does not apply: ${applied.reason}. ` +
      'Nothing was changed; fix the operation or send the case itself as `case`.',
  );
}

/** The pending run with the case a patch goes on from; a final failure keeps none, so the file stays small. */
function withLastCase(pending: PendingRun, lastCase: Record<string, unknown> | undefined): PendingRun {
  const next: PendingRun = { ...pending };
  delete next.lastCase;
  return lastCase === undefined ? next : { ...next, lastCase };
}

type Stage = PendingRun['stage'];

/** What the engine made of a submission, and the stage it was judged in. */
type Judged =
  | {
      readonly kind: 'rejected';
      readonly stage: Stage;
      readonly issues: readonly CaseIssue[];
      /** The texts still blank, by JSON Pointer, when there are any. */
      readonly toWrite: readonly string[];
    }
  | { readonly kind: 'framed'; readonly toWrite: readonly string[] }
  | { readonly kind: 'accepted'; readonly detectiveCase: DetectiveCase };

/**
 * The stage a patch that did not apply belongs to: the texts' once a frame is accepted, and the frame's while there is
 * no case yet or the case it would go on from is a frame still (some text blank). A patch to a case with every text
 * written is a fix of a whole case, which is judged as the text stage.
 */
function stageOfPatch(at: Stage, lastCase: Record<string, unknown> | undefined): Stage {
  if (at === 'text') return 'text';
  if (lastCase === undefined) return 'frame';
  const reading = readCaseOrFrame(lastCase);
  return reading.kind !== 'whole' && reading.blanks.length > 0 ? 'frame' : 'text';
}

/**
 * Judges a submission in the stage the generator is at. At the frame stage a document with blank texts is a frame and
 * is judged on its structure alone; a complete case is judged by every check, whichever stage that is. Once a frame is
 * accepted the stage is the text one: a text that is still blank is then an issue of its own, and the whole case is
 * judged again by every check, so a fix there may change the frame as well.
 */
function judge(
  submission: Submission,
  at: Stage,
  lastCase: Record<string, unknown> | undefined,
  rules: CaseValidationContext,
): Judged {
  if ('issue' in submission) {
    return { kind: 'rejected', stage: stageOfPatch(at, lastCase), issues: [submission.issue], toWrite: [] };
  }
  const reading = readCaseOrFrame(submission.submitted);
  const blanks = reading.kind === 'whole' ? [] : reading.blanks;
  const stage: Stage = at === 'frame' && blanks.length > 0 ? 'frame' : 'text';
  // A frame that is rejected has its texts blank by design, and the generator knows them: only the texts still to
  // write after the frame was accepted are listed.
  const remaining = stage === 'text' ? blanks : [];
  if (reading.kind === 'invalid') {
    return { kind: 'rejected', stage, issues: reading.issues, toWrite: remaining };
  }
  if (reading.kind === 'frame' && stage === 'text') {
    const issues = blanks.map((path) => ({
      code: 'text-missing' as const,
      path,
      message: 'This text is still blank: write it, by a patch that replaces this path.',
    }));
    return { kind: 'rejected', stage, issues, toWrite: remaining };
  }
  const result = validateCase(
    withSightings(reading.detectiveCase),
    reading.kind === 'frame' ? { ...rules, frame: true } : rules,
  );
  if (!result.isValid) return { kind: 'rejected', stage, issues: result.issues, toWrite: remaining };
  return reading.kind === 'frame'
    ? { kind: 'framed', toWrite: blanks }
    : { kind: 'accepted', detectiveCase: result.detectiveCase };
}

export const scenarioSubmit = defineTool({
  name: 'scenario_submit',
  description:
    'For the case generator only. Submits a case to the engine in two stages. First the frame: the case with every ' +
    'narrative text (names, descriptions, personas, statements, admissions, claims, insights, motive, method, reasons, ' +
    'the title and the premise) left as an empty string "". The engine judges it on its structure alone. If it is ' +
    'sound the result has `frameAccepted: true` and `toWrite`, the JSON Pointers of every text still blank: write them ' +
    'all in one `patch`. A complete case with every text written is also accepted, at once, and is judged by every ' +
    'check. A submission is `case` (JSON text or an object) or `patch` (a list of operations on the last case you ' +
    'submitted), never both. A patch is JSON Patch limited to `add`, `replace` and `remove` on JSON Pointers, such as ' +
    '{"op":"replace","path":"/clues/3/description","value":"..."}; all of its operations apply or none does. ' +
    "The engine validates it for this run's hero. If the case is accepted the engine seals it and starts the run, " +
    'and the result is just {"accepted":true}: stop and answer "accepted". If a submission is not, the result lists ' +
    'the issues (code, path, message), most important first, `stage` (`frame` or `text`) and how many attempts are ' +
    'left in that stage. The path of an issue is a JSON Pointer to the place to fix: fix exactly those with a patch, ' +
    'which is far shorter than the case. Each stage has three attempts, a patch counted like a case; a frame that is ' +
    'accepted costs none. After the last the result has "final":true (with the issues of that last rejection) and ' +
    'the run reports a failure, so stop and answer "failed: <reason>". An accepted case can never be replaced. ' +
    'Never repeat a submission that was accepted.',
  inputSchema: z.object({
    case: z.union([z.string().max(MAX_CASE_TEXT_LENGTH), z.record(z.string(), z.unknown())]).optional(),
    patch: z.array(PatchOpSchema).min(1).max(MAX_PATCH_OPERATIONS).optional(),
  }),
  outputSchema: z.object({
    accepted: z.boolean(),
    /** The stage the submission was judged in; absent when the case was accepted. */
    stage: z.enum(PENDING_STAGES).optional(),
    /** A frame was accepted: the run has not started, and `toWrite` says what is left to write. */
    frameAccepted: z.boolean().optional(),
    toWrite: z.array(z.string()).optional(),
    attemptsLeft: z.int().optional(),
    final: z.boolean().optional(),
    reason: z.string().optional(),
    issues: z.array(z.object({ code: z.string(), path: z.string(), message: z.string() })).optional(),
    moreIssues: z.int().optional(),
  }),
  handler: (input, context) =>
    serialized(async () => {
      const { pending, hero } = await openPendingRun(context);
      if (
        pending.failed ||
        pending.attempts >= MAX_CASE_ATTEMPTS ||
        pending.frameAttempts >= MAX_FRAME_ATTEMPTS
      ) {
        return { accepted: false, attemptsLeft: 0, final: true, reason: FINAL_REASON };
      }

      // Not a submission at all, so it costs no attempt: the form is wrong, not the case.
      if ((input.case === undefined) === (input.patch === undefined)) {
        throw new ToolFailure({
          code: SUBMIT_ERROR_CODES.caseOrPatch,
          message: 'Send exactly one of `case` (the case itself) and `patch` (operations on your last case).',
          remediation: 'Submit again with one of them. No attempt was used.',
        });
      }

      const world = await requireWorld(context);
      // What the brief gave the generator, as it was kept when the generator asked: the news or the world may have
      // changed since. A record from before it was kept has none, and the choice is made now, as it always was.
      const brief = pending.brief ?? (await chooseBrief(context, pending, hero, world));
      const logged = {
        date: context.today(),
        seed: pending.seed,
        locale: pending.locale,
        theme: brief.theme,
        archetype: hero.archetype,
      };
      const submission = readSubmission(input, pending.lastCase);
      const judged = judge(submission, pending.stage, pending.lastCase, {
        hero,
        traits: pending.traits,
        locale: pending.locale,
        minRandomEvents: MIN_RANDOM_EVENTS,
        map: GENERATED_MAP,
        days: GENERATED_DAYS,
        requireParts: true,
        requireTies: true,
        requireAdmissions: true,
        requireLinkable: true,
        requireClearing: true,
        requireClaims: true,
        requirePublicLife: true,
        requireObservations: true,
        // The real names of the dictionary and those of the day's headlines the seeds were drawn from.
        realNames: [
          ...new Set([...worldRealNames(world), ...((await seedsOfRun(context))?.realNames ?? [])]),
        ],
      });

      if (judged.kind === 'accepted') {
        // The run's id and folder, made now: the date and time it starts and the seed.
        const runId = makeRunId(context.now(), pending.seed);
        // The run continues the dice the hero was made with: the pending record holds their state.
        const run = createDetectiveRun({
          hero,
          traits: pending.traits,
          case: judged.detectiveCase,
          seed: pending.seed,
          runId,
          rngState: pending.rngState,
          locale: pending.locale,
          // The country the brief named; the run keeps it from here on.
          setting: brief.setting,
          // Shown to the player later, as what the case grew from.
          inspiration: brief.seed && { kind: brief.seed.kind, premise: brief.seed.premise },
          // The tool slots the player's runs have earned this hero.
          toolSlots: toolSlotsOf(await recordsOrNone(context)),
        });
        await saveRun(context.saveDir, run, context.saveFs, EMPTY_RUN_LOG);
        // The news the run was made from stays with it, so that it can be read back on its own.
        const news = await seedsOfRun(context);
        if (news !== undefined) await saveRunSeeds(context.saveDir, runId, news, context.saveFs);
        await keepGenerationLog(context, {
          ...logged,
          stage: 'text',
          attempt: pending.attempts + 1,
          outcome: 'accepted',
          codes: [],
          issues: 0,
        });
        await keepStats(context);
        await clearPending(context.saveDir, context.saveFs);
        return { accepted: true };
      }

      // The next patch goes on from this case, or from the one before when this was not a JSON object (or a patch
      // that did not apply).
      const goesOn =
        'issue' in submission || !isObject(submission.submitted) ? pending.lastCase : submission.submitted;

      if (judged.kind === 'framed') {
        // The frame stage is over, and costs no attempt: from here the texts are written into this frame.
        await savePending(
          context.saveDir,
          withLastCase({ ...pending, stage: 'text' }, goesOn),
          context.saveFs,
        );
        await keepGenerationLog(context, {
          ...logged,
          stage: 'frame',
          attempt: pending.frameAttempts + 1,
          outcome: 'framed',
          codes: [],
          issues: 0,
        });
        return {
          accepted: false,
          stage: 'frame' as const,
          frameAccepted: true,
          toWrite: [...judged.toWrite],
          attemptsLeft: MAX_CASE_ATTEMPTS - pending.attempts,
        };
      }

      const inFrame = judged.stage === 'frame';
      const spent = (inFrame ? pending.frameAttempts : pending.attempts) + 1;
      const attemptsLeft = (inFrame ? MAX_FRAME_ATTEMPTS : MAX_CASE_ATTEMPTS) - spent;
      // After the last attempt of a stage there is no next one, so no case is kept.
      await savePending(
        context.saveDir,
        withLastCase(
          {
            ...pending,
            ...(inFrame ? { frameAttempts: spent } : { attempts: spent }),
            failed: attemptsLeft === 0,
          },
          attemptsLeft === 0 ? undefined : goesOn,
        ),
        context.saveFs,
      );
      await keepGenerationLog(context, {
        ...logged,
        stage: judged.stage,
        attempt: spent,
        outcome: attemptsLeft === 0 ? 'final' : 'rejected',
        codes: codesOf(judged.issues),
        issues: judged.issues.length,
      });
      // The last rejection keeps its issues too: without them a run that failed cannot be told why.
      const rejection = {
        accepted: false,
        stage: judged.stage,
        attemptsLeft,
        ...compactIssues(judged.issues),
        ...(judged.toWrite.length === 0 ? {} : { toWrite: [...judged.toWrite] }),
      };
      if (attemptsLeft === 0) {
        // A run left without a case is an end of a kind: the page of statistics tells it at once.
        await keepStats(context);
        return { ...rejection, final: true, reason: FINAL_REASON };
      }
      return rejection;
    }),
});
