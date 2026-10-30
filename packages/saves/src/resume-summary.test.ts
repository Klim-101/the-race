// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { addInsight, findClue, revealTrait } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { newRun } from '../test/new-run.js';
import { RESUME_LABELS, buildResumeSummary } from './resume-summary.js';

describe('buildResumeSummary', () => {
  it('names the case, the hero, the place and what the hero has found', () => {
    const base = newRun();
    const run = revealTrait(
      findClue(addInsight(base, 'motive-debt'), 'flour-crumbs'),
      base.traits[0]?.id ?? '',
    );
    const text = buildResumeSummary(run);
    const clue = run.case.clues.find(({ id }) => id === 'flour-crumbs');

    expect(text).toContain(RESUME_LABELS.heading);
    expect(text).toContain(run.case.title);
    expect(text).toContain(run.hero.name);
    expect(text).toContain(run.case.locations.find(({ id }) => id === run.locationId)?.name);
    expect(text).toContain(clue?.description);
    expect(text).toContain(base.traits[0]?.id);
    expect(text).toContain(`${RESUME_LABELS.hiddenTraits}: 1`);
    expect(text).toContain('Day 1 of');
    expect(text).toContain('08:00');
  });

  it('says "none" for what the hero has not found yet and marks visited exits', () => {
    const text = buildResumeSummary(newRun());

    expect(text).toContain(`${RESUME_LABELS.traits}: ${RESUME_LABELS.none}.`);
    expect(text).toContain(`- ${RESUME_LABELS.none}`);
    expect(text.split('\n').filter((line) => line === `- ${RESUME_LABELS.none}`)).toHaveLength(2);
  });

  it('marks an exit the hero has already visited', () => {
    const run = newRun();
    const view = buildResumeSummary({ ...run, visitedLocationIds: run.case.locations.map(({ id }) => id) });

    expect(view).toContain(`(${RESUME_LABELS.visited})`);
  });

  it('takes its labels from the caller', () => {
    const text = buildResumeSummary(newRun(), { ...RESUME_LABELS, heading: 'SVODKA' });

    expect(text).toContain('SVODKA');
    expect(text).not.toContain(RESUME_LABELS.heading);
  });

  it('keeps every secret of the case, the hidden traits and the dice out of the text', () => {
    const base = newRun();
    const run = revealTrait(
      findClue(addInsight(base, 'motive-debt'), 'flour-crumbs'),
      base.traits[0]?.id ?? '',
    );
    const text = buildResumeSummary(run);
    const detectiveCase = run.case;

    const secrets = [
      detectiveCase.truth.motive,
      detectiveCase.truth.method,
      ...detectiveCase.suspects.flatMap((suspect) => [
        suspect.secret,
        ...suspect.lies.map((lie) => lie.statement),
      ]),
      ...detectiveCase.clues
        .filter((clue) => !run.foundClueIds.includes(clue.id))
        .map((clue) => clue.description),
      base.traits[1]?.id ?? '',
      run.seed,
      run.caseSeal,
      String(run.rngState),
    ];
    for (const secret of secrets) {
      expect(secret).not.toBe('');
      expect(text).not.toContain(secret);
    }
  });
});
