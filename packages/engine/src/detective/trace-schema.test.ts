// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPatch } from '../json-patch.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { collectNarrativeTexts } from './checks/texts.js';
import { readCaseOrFrame } from './frame.js';

type Raw = { locations: { id: string; parts?: Record<string, unknown>[]; litter?: string }[] } & Record<
  string,
  unknown
>;

const sample = (): Raw =>
  JSON.parse(
    readFileSync(new URL('../../../../content/cases/goose-of-elmwick.en.json', import.meta.url), 'utf8'),
  ) as Raw;

const EMPTY_PART = {
  id: 'empty-drawer',
  name: 'The bottom drawer',
  obstacle: null,
  holds: null,
  inQuickLook: true,
  requiresLead: null,
  fallback: null,
};

/** The sample with an empty part in its first place that has parts, and the place's index. */
function withEmptyPart(extra: Record<string, unknown>): { raw: Raw; place: number; part: number } {
  const raw = sample();
  const place = raw.locations.findIndex((location) => (location.parts ?? []).length > 0);
  const parts = raw.locations[place]?.parts ?? [];
  parts.push({ ...EMPTY_PART, ...extra });
  return { raw, place, part: parts.length - 1 };
}

describe('a trace and litter in the case', () => {
  it('are optional, and a case that has none is as it was, with nothing added to it', () => {
    const parsed = DetectiveCaseSchema.parse(sample());

    expect(JSON.stringify(parsed)).not.toContain('"trace"');
    expect(JSON.stringify(parsed)).not.toContain('"litter"');
  });

  it('are kept on an empty part and on a place', () => {
    const { raw, place, part } = withEmptyPart({ trace: 'A torn flyer, creased small.' });
    if (raw.locations[place] !== undefined) raw.locations[place].litter = 'A cigarette end by the wall.';

    const parsed = DetectiveCaseSchema.parse(raw);

    expect(parsed.locations[place]?.parts?.[part]?.trace).toBe('A torn flyer, creased small.');
    expect(parsed.locations[place]?.litter).toBe('A cigarette end by the wall.');
  });

  it('are refused for a part that holds a clue, which is what its search shows', () => {
    const raw = sample();
    const place = raw.locations.findIndex((location) =>
      (location.parts ?? []).some((candidate) => candidate.holds !== null),
    );
    const parts = raw.locations[place]?.parts ?? [];
    const held = parts.findIndex((candidate) => candidate.holds !== null);
    Object.assign(parts[held] ?? {}, { trace: 'A torn flyer.' });

    const result = DetectiveCaseSchema.safeParse(raw);

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues.map(({ path }) => path.join('.'))).toContain(
      `locations.${String(place)}.parts.${String(held)}.trace`,
    );
  });

  it('are narrative texts, so the text stage fills them and the checks of the texts read them', () => {
    const { raw, place, part } = withEmptyPart({ trace: 'A torn flyer, creased small.' });
    if (raw.locations[place] !== undefined) raw.locations[place].litter = 'A cigarette end by the wall.';
    const parsed = DetectiveCaseSchema.parse(raw);

    const paths = collectNarrativeTexts(parsed).map(({ path }) => path);

    expect(paths).toContain(`locations[${String(place)}].litter`);
    expect(paths).toContain(`locations[${String(place)}].parts[${String(part)}].trace`);
  });

  it('are blank in a frame, are told as blanks, and are filled by a patch of the text stage', () => {
    const { raw, place, part } = withEmptyPart({ trace: '' });
    if (raw.locations[place] !== undefined) raw.locations[place].litter = '';
    const reading = readCaseOrFrame(raw);

    // The rest of the sample is written, so the frame's blanks are exactly the two new texts.
    expect(reading.kind).toBe('frame');
    const pointers = reading.kind === 'frame' ? reading.blanks : [];
    expect(pointers).toEqual([
      `/locations/${String(place)}/parts/${String(part)}/trace`,
      `/locations/${String(place)}/litter`,
    ]);
    const filled = applyPatch(raw, [
      { op: 'replace', path: pointers[0] ?? '', value: 'A torn flyer, creased small.' },
      { op: 'replace', path: pointers[1] ?? '', value: 'A cigarette end by the wall.' },
    ]);
    expect(filled.ok && readCaseOrFrame(filled.document).kind).toBe('whole');
  });
});
