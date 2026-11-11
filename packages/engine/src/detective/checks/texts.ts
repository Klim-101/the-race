// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale } from '../../locale.js';
import { checkLocale, checkNarrativeTexts, type NarrativeText } from '../../text/check-texts.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';

export type { NarrativeText };

/**
 * The case is in the run's language, and (with `content`) every narrative text is in it and names nothing from the
 * real world. The truth is checked too: it reaches the player in the final report. The language of the case is a
 * fact about its frame; what the texts say is judged only once they are written, so a frame is checked with
 * `content` off.
 */
export function checkTexts(
  detectiveCase: DetectiveCase,
  locale: Locale,
  realNames: readonly string[],
  content: boolean,
): CaseIssue[] {
  return [
    ...checkLocale(detectiveCase.locale, locale),
    ...(content ? checkNarrativeTexts(collectNarrativeTexts(detectiveCase), locale, realNames) : []),
  ];
}

/** Every narrative text of a case with its path: the places a frame leaves blank and a text patch fills. */
export function collectNarrativeTexts(detectiveCase: DetectiveCase): NarrativeText[] {
  const at = (path: string, text: string): NarrativeText => ({ path, text });
  const { truth } = detectiveCase;
  return [
    at('title', detectiveCase.title),
    at('premise', detectiveCase.premise),
    ...detectiveCase.locations.flatMap((location, index) => [
      at(`locations[${String(index)}].name`, location.name),
      at(`locations[${String(index)}].description`, location.description),
      ...(location.litter === undefined ? [] : [at(`locations[${String(index)}].litter`, location.litter)]),
      ...(location.parts ?? []).flatMap((part, partIndex) => [
        at(`locations[${String(index)}].parts[${String(partIndex)}].name`, part.name),
        ...(part.trace === undefined
          ? []
          : [at(`locations[${String(index)}].parts[${String(partIndex)}].trace`, part.trace)]),
      ]),
    ]),
    ...(detectiveCase.leads ?? []).map((lead, index) => at(`leads[${String(index)}].reason`, lead.reason)),
    ...(detectiveCase.witnesses ?? []).flatMap((witness, index) => [
      at(`witnesses[${String(index)}].name`, witness.name),
      at(`witnesses[${String(index)}].persona`, witness.persona),
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
      ...(suspect.claims ?? []).map((claim, claimIndex) =>
        at(`suspects[${String(index)}].claims[${String(claimIndex)}]`, claim),
      ),
      ...(suspect.reactions ?? []).map((reaction, reactionIndex) =>
        at(`suspects[${String(index)}].reactions[${String(reactionIndex)}].text`, reaction.text),
      ),
      ...suspect.lies.flatMap((lie, lieIndex) =>
        lie.admission === undefined
          ? []
          : [at(`suspects[${String(index)}].lies[${String(lieIndex)}].admission`, lie.admission)],
      ),
    ]),
    ...detectiveCase.deductions.map((deduction, index) =>
      at(`deductions[${String(index)}].insight`, deduction.insight),
    ),
    at('truth.motive', truth.motive),
    at('truth.method', truth.method),
    ...truth.timeline.map((entry, index) => at(`truth.timeline[${String(index)}].action`, entry.action)),
    ...detectiveCase.clock.worldEvents.map((event, index) =>
      at(`clock.worldEvents[${String(index)}].description`, event.description),
    ),
    ...(detectiveCase.randomEvents ?? []).map((event, index) =>
      at(`randomEvents[${String(index)}].description`, event.description),
    ),
  ];
}
