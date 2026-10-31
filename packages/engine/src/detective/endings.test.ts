// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng } from '../dice.js';
import { END_REASONS, statusOfEndReason, type EndReason } from '../run.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { createDetectiveRun, endRun, viewRun, type DetectiveRunState } from './run-state.js';

const ENDINGS = new URL('../../../../agents/skills/play-the-race/reference/endings.md', import.meta.url);

function runOf(): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'endings',
    rngState: 1,
    locale: 'en',
  });
}

const INTENTS = [
  { kind: 'look' },
  { kind: 'search' },
  { kind: 'rest' },
  { kind: 'move', locationId: 'cheese-stall' },
  { kind: 'interrogate', suspectId: 'rival', approach: 'social', clueIds: [] },
  { kind: 'deduce', clueIds: ['cellar-key', 'blue-glove'] },
  { kind: 'accuse', culpritId: 'baker', motiveInsightId: null, evidenceClueIds: [] },
  { kind: 'reread', clueId: 'cellar-key' },
  { kind: 'use', itemId: 'coffee' },
] as const;

function endedWith(reason: EndReason): DetectiveRunState {
  return endRun(runOf(), statusOfEndReason(reason), reason);
}

describe.each(END_REASONS)('a run that ended with %s', (reason) => {
  it('records its cause and the status the cause leads to, and only a proven case is won', () => {
    const ended = endedWith(reason);

    expect(ended.endReason).toBe(reason);
    expect(ended.status).toBe(statusOfEndReason(reason));
    expect(ended.status === 'won').toBe(reason === 'proven');
    expect(viewRun(ended).status).toBe(ended.status);
  });

  it('is read-only: every intent is refused, nothing changes and no dice are rolled', () => {
    const ended = endedWith(reason);
    for (const intent of INTENTS) {
      const rng = createRng(5);
      const before = rng.state();
      const resolution = resolveIntent(ended, intent, rng);

      expect([intent.kind, resolution.ok ? 'ok' : resolution.refusal.code]).toEqual([
        intent.kind,
        'run-over',
      ]);
      expect(rng.state()).toBe(before);
    }
  });

  it('cannot be ended a second time with another cause', () => {
    expect(() => endRun(endedWith(reason), 'lost', 'breakdown')).toThrow();
  });
});

describe('the endings the narrator tells', () => {
  const text = readFileSync(ENDINGS, 'utf8');

  it.each(END_REASONS)('has a closing scene for %s', (reason) => {
    expect(text).toContain(`\`${reason}\``);
  });

  it('says the hero leaves and never dies, and uses no word of death or harm outside that rule', () => {
    expect(text).toMatch(/The hero leaves; the hero never dies\./);
    const afterRule = text.split('This is a rule of the world, not a matter of taste.')[1] ?? '';
    expect(afterRule).not.toMatch(/\b(dies?|died|dead|death|killed|injured|wound(ed)?|hurt)\b/i);
  });
});
