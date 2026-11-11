// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase } from '../../../test/fixtures/cheese-case.js';
import type { CaseIssue } from '../case-issue.js';
import { DetectiveCaseSchema, type DetectiveCase } from '../case-schema.js';
import { checkTraces } from './traces.js';

interface Texts {
  readonly trace?: string;
  readonly litter?: string;
}

/** The cheese case with a bare room added: an empty part (with the trace given, if any) and the litter given, if any. */
function withBareRoom({ trace, litter }: Texts, witness?: string): DetectiveCase {
  const raw = buildCheeseCase();
  raw.locations.push({
    id: 'bare-room',
    name: 'A bare room',
    description: 'A room with a shelf and nothing on it.',
    connections: ['market-square'],
    access: { kind: 'open' },
    ...(litter === undefined ? {} : { litter }),
    parts: [
      {
        id: 'bare-shelf',
        name: 'A bare shelf',
        obstacle: null,
        holds: null,
        inQuickLook: true,
        requiresLead: null,
        fallback: null,
        ...(trace === undefined ? {} : { trace }),
      },
    ],
  });
  if (witness !== undefined) {
    Object.assign(raw, {
      witnesses: [
        {
          id: 'old-porter',
          locationId: 'market-square',
          name: witness,
          persona: 'A porter who sees everything and says little.',
          hours: { fromMinute: 480, untilMinute: 1200 },
        },
      ],
    });
  }
  return DetectiveCaseSchema.parse(raw);
}

const issues = (detectiveCase: DetectiveCase, content = true, required = true, locale: 'en' | 'ru' = 'en') =>
  checkTraces(detectiveCase, locale, content, required);
const codes = (list: CaseIssue[]): string[] => list.map(({ code }) => code);

describe('a part that holds nothing', () => {
  it('is told to have a trace, in a case the generator writes', () => {
    const list = issues(withBareRoom({}));

    expect(list).toEqual([
      expect.objectContaining({
        code: 'empty-part-without-trace',
        path: expect.stringMatching(/^locations\[\d+\]\.parts\[0\]$/) as unknown,
      }),
    ]);
  });

  it('is told so in a frame too, where the trace is a blank that the text stage will fill', () => {
    expect(codes(issues(withBareRoom({}), false))).toEqual(['empty-part-without-trace']);
  });

  it('is left alone when it has its trace, when the rule is off, and when it holds a clue', () => {
    expect(issues(withBareRoom({ trace: 'A torn flyer lies under the shelf.' }))).toEqual([]);
    expect(issues(withBareRoom({}), true, false)).toEqual([]);
    expect(issues(DetectiveCaseSchema.parse(buildCheeseCase()))).toEqual([]);
  });
});

describe('the words of a trace and of litter', () => {
  it('may say what is seen, and name no one', () => {
    const detectiveCase = withBareRoom({
      trace: 'A torn flyer, creased small, lies under the shelf.',
      litter: 'A cigarette end and a bus ticket lie by the wall.',
    });

    expect(issues(detectiveCase)).toEqual([]);
  });

  it('may not say what it means', () => {
    const list = issues(withBareRoom({ trace: 'Clearly a flyer that somebody dropped on purpose.' }));

    expect(list).toEqual([expect.objectContaining({ code: 'trace-draws-conclusion' })]);
    expect(list[0]?.message).toContain('clearly');
    expect(
      codes(
        issues(
          withBareRoom({ litter: 'Похоже, здесь кто-то ждал.', trace: 'Обрывок листовки.' }),
          true,
          true,
          'ru',
        ),
      ),
    ).toEqual(['trace-draws-conclusion']);
  });

  it('may not name a suspect, by the whole name or by a word of it, or a witness', () => {
    const byName = issues(withBareRoom({ trace: 'A receipt made out to Gustav Holm lies on the shelf.' }));
    const bySurname = issues(
      withBareRoom({ trace: 'A glove with the initials of Brenn lies on the shelf.' }),
    );
    const byWitness = issues(
      withBareRoom({ trace: 'A pipe that smells of Tobias Wren lies on the shelf.' }, 'Tobias Wren'),
    );

    for (const list of [byName, bySurname, byWitness]) {
      expect(codes(list)).toEqual(['trace-names-someone']);
    }
    expect(bySurname[0]?.message).toContain('Brenn');
  });

  it('may not hurt anyone', () => {
    const list = issues(withBareRoom({ litter: 'A smear of blood on the wall.', trace: 'A torn flyer.' }));

    expect(list).toEqual([
      expect.objectContaining({
        code: 'trace-violence',
        path: expect.stringMatching(/\.litter$/) as unknown,
      }),
    ]);
  });

  it('is judged only once it is written, so a frame is not refused for a word it has not yet got', () => {
    expect(issues(withBareRoom({ trace: 'Clearly a flyer, with the blood of Gustav Holm.' }), false)).toEqual(
      [],
    );
  });

  it('is judged for each text, one issue for each rule it breaks', () => {
    const list = issues(
      withBareRoom({
        trace: 'Clearly a flyer from Orla Brenn.',
        litter: 'It must be blood by the wall.',
      }),
    );

    expect(codes(list).toSorted()).toEqual(
      [
        'trace-draws-conclusion',
        'trace-names-someone',
        'trace-draws-conclusion',
        'trace-violence',
      ].toSorted(),
    );
  });
});
