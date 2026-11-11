// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale } from '../../locale.js';
import { findRealName } from '../../text/real-names.js';
import { findViolence } from '../../text/violence.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import { conclusionMarkerIn } from './observations.js';

/** A text of the case that is a trace or litter, with its path and what it is called in a message. */
interface TraceText {
  readonly path: string;
  readonly text: string;
  readonly what: string;
}

function tracesOf(detectiveCase: DetectiveCase): TraceText[] {
  return detectiveCase.locations.flatMap((location, index) => [
    ...(location.litter === undefined
      ? []
      : [
          {
            path: `locations[${String(index)}].litter`,
            text: location.litter,
            what: `The litter of "${location.id}"`,
          },
        ]),
    ...(location.parts ?? []).flatMap((part, partIndex) =>
      part.trace === undefined
        ? []
        : [
            {
              path: `locations[${String(index)}].parts[${String(partIndex)}].trace`,
              text: part.trace,
              what: `The trace of "${part.id}"`,
            },
          ],
    ),
  ]);
}

/** The names the case gives to people, each whole and by each word of three letters or more, so a surname alone is caught. */
function namesOfPeople(detectiveCase: DetectiveCase): string[] {
  const full = [
    ...detectiveCase.suspects.map(({ name }) => name),
    ...(detectiveCase.witnesses ?? []).map(({ name }) => name),
  ];
  return [
    ...new Set(full.flatMap((name) => [name, ...name.split(/\s+/).filter((word) => word.length >= 3)])),
  ];
}

/**
 * The traces and the litter of a case, which are small true things that prove nothing. Every part that holds nothing has a
 * trace (with `required`, for the cases the generator writes: a blank one of a frame counts, since it is the place the text
 * will be written in). What a trace says is judged once it is written (`content`): it says what is seen and never what it
 * means, as a clue does; it names no suspect and no witness, which would point at a person; and it never hurts anyone.
 */
export function checkTraces(
  detectiveCase: DetectiveCase,
  locale: Locale,
  content: boolean,
  required: boolean,
): CaseIssue[] {
  const issues: CaseIssue[] = [];
  if (required) {
    detectiveCase.locations.forEach((location, index) => {
      (location.parts ?? []).forEach((part, partIndex) => {
        if (part.holds === null && part.trace === undefined) {
          issues.push({
            code: 'empty-part-without-trace',
            path: `locations[${String(index)}].parts[${String(partIndex)}]`,
            message: `Part "${part.id}" holds nothing, so give it a "trace": a small true thing a search of it shows, which proves nothing.`,
          });
        }
      });
    });
  }
  if (!content) return issues;
  const people = namesOfPeople(detectiveCase);
  for (const { path, text, what } of tracesOf(detectiveCase)) {
    const marker = conclusionMarkerIn(text, locale);
    if (marker !== undefined) {
      issues.push({
        code: 'trace-draws-conclusion',
        path,
        message: `${what} says what it means ("${marker}"): describe only what is seen, and let the hero conclude.`,
      });
    }
    const person = findRealName(text, people);
    if (person !== undefined) {
      issues.push({
        code: 'trace-names-someone',
        path,
        message: `${what} names "${person}": a trace points at no one, so leave the person out.`,
      });
    }
    const violence = findViolence(text, locale);
    if (violence !== undefined) {
      issues.push({
        code: 'trace-violence',
        path,
        message: `${what} never hurts anyone; rewrite it without "${violence}".`,
      });
    }
  }
  return issues;
}
