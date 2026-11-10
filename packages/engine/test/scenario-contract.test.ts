// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ARCHETYPES, type Hero } from '../src/hero.js';
import { ISSUE_ORDER, type CaseIssueCode } from '../src/detective/case-issue.js';
import { CRIME_TYPES, DetectiveCaseSchema, type DetectiveCase } from '../src/detective/case-schema.js';
import { collectNarrativeTexts } from '../src/detective/checks/texts.js';
import { DETECTIVE_SCENARIO } from '../src/detective/scenario.js';
import { createDetectiveRun } from '../src/detective/run-state.js';
import { readFrame } from '../src/frame.js';
import { SHARED_ISSUE_CODES } from '../src/issues.js';
import { applyPatch, toJsonPointer, type PatchOp } from '../src/json-patch.js';
import { SEED_CRIMES } from '../src/news/choose-seed.js';
import type { NewsSeed } from '../src/news/seed.js';
import { luckTokensOf, toolSlotsOf } from '../src/progress.js';
import { chooseRemembered } from '../src/remembered.js';
import type { ProfileRecord } from '../src/profile.js';
import { SCENARIOS, scenarioOf, type ArchetypeRun } from '../src/scenarios.js';
import type { ScenarioContext, ScenarioKind, StartRunInput } from '../src/scenario.js';
import { checkLocale, checkNarrativeTexts } from '../src/text/check-texts.js';
import { EntityIdSchema } from '../src/detective/case-schema.js';
import { LocaleSchema } from '../src/locale.js';

const CASES = new URL('../../../content/cases/', import.meta.url);
const sample = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(name, CASES), 'utf8')) as Record<string, unknown>;

const HERO: Hero = {
  name: 'Mira Kos, former auditor',
  gender: 'female',
  archetype: 'detective',
  skills: { perception: 4, reasoning: 5, social: 1, pressure: 0, tech: 0, contacts: 0 },
  background: 'analyst',
};

const CONTEXT: ScenarioContext = { hero: HERO, traits: [], locale: 'en', realNames: [], frame: false };
const describeSighting = (): string => 'The sweeper saw someone in the street.';

const SEED: NewsSeed = {
  id: 'grain-shortage',
  headlineIds: ['h0a1b2c3d'],
  kind: 'shortage',
  tone: 'wry',
  premise: 'A staple runs short and everyone suspects the middlemen.',
};

const START: StartRunInput<DetectiveCase> = {
  hero: HERO,
  traits: [],
  scenario: DetectiveCaseSchema.parse(sample('goose-of-elmwick.en.json')),
  seed: 'seed-1',
  runId: '20261031-120000-seed-1',
  rngState: 12345,
  locale: 'en',
  setting: null,
  inspiration: { kind: 'shortage', premise: SEED.premise },
  records: [],
};

/** The sample as a generator writes it: the clues in which witnesses tell what they saw are the engine's to make. */
function written(): Record<string, unknown> {
  const json = sample('goose-of-elmwick.en.json');
  return {
    ...json,
    clues: (json.clues as { sightingOf?: unknown }[]).filter((clue) => clue.sightingOf === undefined),
  };
}

describe('the registry of scenarios', () => {
  it('has a scenario for every archetype there is, and none for any other', () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(Object.keys(ARCHETYPES).sort());
  });

  it('gives the scenario of an archetype by its id, as the registry holds it', () => {
    expect(scenarioOf('detective')).toBe(SCENARIOS.detective);
  });

  it('starts the run of the archetype: the detective starts the detective run', () => {
    const run: ArchetypeRun = SCENARIOS.detective.startRun(START);

    expect(run.archetype).toBe('detective');
  });
});

describe('the detective scenario', () => {
  it('has the themes of a detective case, which are its crime types', () => {
    expect(DETECTIVE_SCENARIO.themes).toEqual(CRIME_TYPES);
  });

  it('shows its issues in the order of its own list, which holds every code that all archetypes share', () => {
    expect(DETECTIVE_SCENARIO.issueOrder).toBe(ISSUE_ORDER);
    // Checked by the compiler too: a shared code that the detective's codes did not have would not assign here.
    const shared: readonly CaseIssueCode[] = SHARED_ISSUE_CODES;
    for (const code of shared) expect(DETECTIVE_SCENARIO.issueOrder).toContain(code);
  });

  describe('choosing a theme', () => {
    it('gives the seed and a crime type that the seed allows, the same on every call', () => {
      const first = DETECTIVE_SCENARIO.chooseTheme([SEED], HERO, 'seed-1');

      expect(first?.seed).toEqual(SEED);
      expect(SEED_CRIMES.shortage).toContain(first?.theme);
      expect(DETECTIVE_SCENARIO.chooseTheme([SEED], HERO, 'seed-1')).toEqual(first);
    });

    it('gives nothing when there is no seed', () => {
      expect(DETECTIVE_SCENARIO.chooseTheme([], HERO, 'seed-1')).toBeUndefined();
    });
  });

  describe('reading a case', () => {
    it('reads a complete case as whole, and a case with its texts blank as a frame', () => {
      expect(DETECTIVE_SCENARIO.read(sample('goose-of-elmwick.en.json')).kind).toBe('whole');

      const blanks = collectNarrativeTexts(DetectiveCaseSchema.parse(written())).map(({ path }): PatchOp => ({
        op: 'replace',
        path: toJsonPointer(path),
        value: '',
      }));
      const frame = applyPatch(written(), blanks);

      expect(frame.ok && DETECTIVE_SCENARIO.read(frame.document).kind).toBe('frame');
    });

    it('says what is wrong with a document that is not a case', () => {
      expect(DETECTIVE_SCENARIO.read({ nothing: true })).toMatchObject({ kind: 'invalid', blanks: [] });
    });
  });

  describe('checking a case', () => {
    it('accepts a sample case for a hero who can solve it', () => {
      const reading = DETECTIVE_SCENARIO.read(sample('goose-of-elmwick.en.json'));
      if (reading.kind !== 'whole') throw new Error('Not a whole case.');

      const result = DETECTIVE_SCENARIO.check(reading.scenario, CONTEXT, describeSighting);

      expect(result.isValid).toBe(true);
    });

    it('makes the clues in which witnesses tell what they saw, in the words it is given', () => {
      const reading = DETECTIVE_SCENARIO.read(written());
      if (reading.kind !== 'whole') throw new Error('Not a whole case.');
      expect(reading.scenario.clues.some(({ id }) => id.startsWith('seen-'))).toBe(false);

      const result = DETECTIVE_SCENARIO.check(reading.scenario, CONTEXT, describeSighting);

      expect(result.isValid).toBe(true);
      const made = result.isValid
        ? result.scenario.clues.find(({ id }) => id === 'seen-street-sweeper-postmaster')
        : undefined;
      expect(made?.description).toBe('The sweeper saw someone in the street.');
    });

    it('judges a frame on its structure, and the whole case again once the texts are written', () => {
      const texts = collectNarrativeTexts(DetectiveCaseSchema.parse(written()));
      const blank = applyPatch(
        written(),
        texts.map(({ path }): PatchOp => ({ op: 'replace', path: toJsonPointer(path), value: '' })),
      );
      const frame = blank.ok ? DETECTIVE_SCENARIO.read(blank.document) : undefined;
      if (frame?.kind !== 'frame') throw new Error('Not a frame.');

      expect(
        DETECTIVE_SCENARIO.check(frame.scenario, { ...CONTEXT, frame: true }, describeSighting).isValid,
      ).toBe(true);

      const filled = applyPatch(
        blank.ok ? blank.document : undefined,
        texts.map(({ path, text }): PatchOp => ({ op: 'replace', path: toJsonPointer(path), value: text })),
      );
      const whole = filled.ok ? DETECTIVE_SCENARIO.read(filled.document) : undefined;
      if (whole?.kind !== 'whole') throw new Error('Not a whole case.');
      expect(DETECTIVE_SCENARIO.check(whole.scenario, CONTEXT, describeSighting).isValid).toBe(true);
    });

    it('lists the issues of a case that is wrong, among them the language of the case', () => {
      const reading = DETECTIVE_SCENARIO.read(sample('goose-of-elmwick.en.json'));
      if (reading.kind !== 'whole') throw new Error('Not a whole case.');

      const result = DETECTIVE_SCENARIO.check(
        reading.scenario,
        { ...CONTEXT, locale: 'ru' },
        describeSighting,
      );

      expect(result.isValid).toBe(false);
      expect(!result.isValid && result.issues.map(({ code }) => code)).toContain('locale-mismatch');
    });
  });

  describe('starting a run', () => {
    it('starts the run the engine would start by hand, with the same dice and the same case', () => {
      const run = DETECTIVE_SCENARIO.startRun(START);

      expect(run).toEqual(
        createDetectiveRun({
          hero: HERO,
          traits: [],
          case: START.scenario,
          seed: 'seed-1',
          runId: '20261031-120000-seed-1',
          rngState: 12345,
          locale: 'en',
          setting: null,
          inspiration: START.inspiration,
          toolSlots: toolSlotsOf([]),
          luckTokens: luckTokensOf(0),
        }),
      );
    });

    it('gives the hero the tool slots that the runs behind them have earned', () => {
      const won: ProfileRecord = {
        version: 1,
        runId: 'earlier',
        locale: 'en',
        title: 'A case',
        hero: { name: 'Mira', background: 'analyst', lifeState: undefined },
        endReason: 'proven',
        won: true,
        days: 1,
        turns: 1,
        minutes: 1,
        cluesFound: 0,
        insights: 0,
        traitsRevealed: 0,
        traitsTotal: 2,
      };

      const run = DETECTIVE_SCENARIO.startRun({ ...START, records: [won, won] });

      expect(run.toolSlots).toBe(toolSlotsOf([won, won]));
      expect(run.toolSlots).toBeGreaterThan(DETECTIVE_SCENARIO.startRun(START).toolSlots);
    });

    it('gives the hero the luck tokens that their wins have earned', () => {
      const won: ProfileRecord = {
        version: 1,
        runId: 'earlier',
        locale: 'en',
        title: 'A case',
        hero: { name: 'Mira', background: 'analyst', lifeState: undefined },
        endReason: 'proven',
        won: true,
        days: 1,
        turns: 1,
        minutes: 1,
        cluesFound: 0,
        insights: 0,
        traitsRevealed: 0,
        traitsTotal: 2,
      };

      const run = DETECTIVE_SCENARIO.startRun({ ...START, records: [won, won] });

      expect(run.luckTokens).toEqual({ total: luckTokensOf(2), left: luckTokensOf(2) });
      expect(DETECTIVE_SCENARIO.startRun(START).luckTokens.total).toBe(luckTokensOf(0));
    });

    it('remembers a hero of the profile on the dice of its seed, and no one when the profile has none to give', () => {
      const earlier = (name: string, won: boolean): ProfileRecord => ({
        version: 1,
        runId: `earlier-${name}`,
        locale: 'en',
        title: 'A case',
        hero: { name, background: 'police', lifeState: undefined },
        endReason: won ? 'proven' : 'time-ran-out',
        won,
        days: 3,
        turns: 30,
        minutes: 300,
        cluesFound: 4,
        insights: 1,
        traitsRevealed: 0,
        traitsTotal: 2,
      });
      const records = [earlier('Ada', false), earlier('Bo', true)];
      const seeds = Array.from({ length: 60 }, (_, index) => `remember-${String(index)}`);

      const runs = seeds.map((seed) => DETECTIVE_SCENARIO.startRun({ ...START, seed, records }));

      for (const [index, run] of runs.entries()) {
        expect(run.remembers).toEqual(chooseRemembered(records, seeds[index] ?? '') ?? null);
      }
      expect(runs.some(({ remembers }) => remembers?.name === 'Ada')).toBe(true);
      expect(runs.some(({ remembers }) => remembers === null)).toBe(true);
      expect(DETECTIVE_SCENARIO.startRun(START).remembers).toBeNull();
    });
  });
});

// An archetype that is not the detective's, to show the contract is one that another can implement, and that what drives
// it needs to know nothing of the case. Its case is a title and some steps; it starts a run that is a title and a seed.
const ToySchema = z.object({
  locale: LocaleSchema,
  title: z.string().trim().min(1),
  steps: z.array(z.object({ id: EntityIdSchema, text: z.string().trim().min(1) })).min(1),
});
type Toy = z.infer<typeof ToySchema>;
interface ToyRun {
  readonly title: string;
  readonly seed: string;
}

const TOY: ScenarioKind<Toy, ToyRun, string> = {
  themes: ['storm', 'famine'],
  issueOrder: [...SHARED_ISSUE_CODES, 'no-steps'],
  chooseTheme: (seeds) => {
    const [seed] = seeds;
    return seed && { seed, theme: 'storm' };
  },
  read: (document) => readFrame(ToySchema, document),
  check: (scenario, context, words) => {
    const issues = [
      ...checkLocale(scenario.locale, context.locale),
      ...(context.frame
        ? []
        : checkNarrativeTexts(
            [
              { path: 'title', text: scenario.title },
              ...scenario.steps.map(({ text }, index) => ({ path: `steps[${String(index)}].text`, text })),
            ],
            context.locale,
            context.realNames,
          )),
    ];
    return issues.length === 0
      ? { isValid: true, scenario: { ...scenario, title: `${scenario.title} ${words}` } }
      : { isValid: false, issues };
  },
  startRun: (input) => ({ title: input.scenario.title, seed: input.seed }),
};

/** What the server does with any archetype's scenario: read, judge as a frame, patch the texts in, judge, start. */
function drive<Case, Run, Words>(
  kind: ScenarioKind<Case, Run, Words>,
  frame: unknown,
  patch: readonly PatchOp[],
  words: Words,
  start: (scenario: Case) => StartRunInput<Case>,
): Run {
  const reading = kind.read(frame);
  if (reading.kind !== 'frame') throw new Error(`Not a frame: ${reading.kind}.`);
  if (!kind.check(reading.scenario, { ...CONTEXT, frame: true }, words).isValid)
    throw new Error('Frame refused.');

  const patched = applyPatch(frame, patch);
  if (!patched.ok) throw new Error(patched.reason);
  const whole = kind.read(patched.document);
  if (whole.kind !== 'whole') throw new Error(`Not whole: ${whole.kind}.`);
  const checked = kind.check(whole.scenario, CONTEXT, words);
  if (!checked.isValid) throw new Error('Case refused.');
  return kind.startRun(start(checked.scenario));
}

describe('an archetype that is not the detective', () => {
  const frame = {
    locale: 'en',
    title: '',
    steps: [
      { id: 'gather', text: '' },
      { id: 'flee', text: '' },
    ],
  };
  const patch: PatchOp[] = [
    { op: 'replace', path: '/title', value: 'The storm' },
    { op: 'replace', path: '/steps/0/text', value: 'Gather the neighbours.' },
    { op: 'replace', path: '/steps/1/text', value: 'Leave by the river road.' },
  ];

  it('can implement the contract, and is held in a registry that takes any scenario', () => {
    const registered: ScenarioKind<unknown, unknown, unknown> = TOY;

    expect(registered.themes).toEqual(['storm', 'famine']);
    expect(TOY.chooseTheme([SEED], HERO, 'seed-1')).toEqual({ seed: SEED, theme: 'storm' });
    expect(TOY.chooseTheme([], HERO, 'seed-1')).toBeUndefined();
  });

  it('goes through the frame, the patch and the start of a run, driven by what knows nothing of its case', () => {
    expect(drive(TOY, frame, patch, 'was written.', (scenario) => ({ ...START, scenario }))).toEqual({
      title: 'The storm was written.',
      seed: 'seed-1',
    });
  });

  it('is judged by the shared checks of texts: a real name and a wrong script are refused', () => {
    const reading = TOY.read({
      locale: 'en',
      title: 'Все должны всем.',
      steps: [{ id: 'a', text: 'Norway.' }],
    });
    if (reading.kind !== 'whole') throw new Error('Not whole.');

    const result = TOY.check(reading.scenario, { ...CONTEXT, realNames: ['Norway'] }, '');

    expect(!result.isValid && result.issues.map(({ code }) => code)).toEqual(['wrong-script', 'real-name']);
  });

  it('is judged on the language of its case in a frame, and not on what the texts say', () => {
    const reading = TOY.read(frame);
    if (reading.kind !== 'frame') throw new Error('Not a frame.');

    expect(TOY.check(reading.scenario, { ...CONTEXT, frame: true, locale: 'ru' }, '')).toMatchObject({
      isValid: false,
      issues: [{ code: 'locale-mismatch' }],
    });
  });
});
