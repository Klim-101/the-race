// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale } from '../../locale.js';
import { findRealName } from '../../text/real-names.js';
import { isInLocaleScript } from '../../text/script.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';

interface NarrativeText {
  readonly path: string;
  readonly text: string;
}

/**
 * Every narrative text is in the run's language and names nothing from the real world. The truth is
 * checked too: it reaches the player in the final report.
 */
export function checkTexts(
  detectiveCase: DetectiveCase,
  locale: Locale,
  realNames: ReadonlyArray<string>,
): CaseIssue[] {
  const issues: CaseIssue[] = [];
  if (detectiveCase.locale !== locale) {
    issues.push({
      code: 'locale-mismatch',
      path: 'locale',
      message: `The case is in "${detectiveCase.locale}", but the run is in "${locale}".`,
    });
  }
  for (const { path, text } of collectNarrativeTexts(detectiveCase)) {
    const realName = findRealName(text, realNames);
    if (realName !== undefined) {
      issues.push({ code: 'real-name', path, message: `Replace the real-world name "${realName}" with its mirror-world name.` });
    }
    if (!isInLocaleScript(text, locale)) {
      issues.push({ code: 'wrong-script', path, message: `Write this text in "${locale}".` });
    }
  }
  return issues;
}

function collectNarrativeTexts(detectiveCase: DetectiveCase): NarrativeText[] {
  const at = (path: string, text: string): NarrativeText => ({ path, text });
  const { truth } = detectiveCase;
  return [
    at('title', detectiveCase.title),
    at('premise', detectiveCase.premise),
    ...detectiveCase.locations.flatMap((location, index) => [
      at(`locations[${String(index)}].name`, location.name),
      at(`locations[${String(index)}].description`, location.description),
    ]),
    ...detectiveCase.clues.map((clue, index) => at(`clues[${String(index)}].description`, clue.description)),
    ...detectiveCase.suspects.flatMap((suspect, index) => [
      at(`suspects[${String(index)}].name`, suspect.name),
      at(`suspects[${String(index)}].persona`, suspect.persona),
      at(`suspects[${String(index)}].secret`, suspect.secret),
      at(`suspects[${String(index)}].alibi`, suspect.alibi),
      ...suspect.lies.map((lie, lieIndex) =>
        at(`suspects[${String(index)}].lies[${String(lieIndex)}].statement`, lie.statement),
      ),
    ]),
    ...detectiveCase.deductions.map((deduction, index) => at(`deductions[${String(index)}].insight`, deduction.insight)),
    at('truth.motive', truth.motive),
    at('truth.method', truth.method),
    ...truth.timeline.map((entry, index) => at(`truth.timeline[${String(index)}].action`, entry.action)),
    ...detectiveCase.clock.worldEvents.map((event, index) =>
      at(`clock.worldEvents[${String(index)}].description`, event.description),
    ),
  ];
}
