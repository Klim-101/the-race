// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Trait } from '../../traits.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';

/**
 * A line a suspect says about a clue is for a clue that bears on them: a reaction to one that is about someone else
 * would be a tell that it was not about them. It names no hidden trait of the hero either; the generator never sees
 * the traits, so a line that does is one that guessed, and the narrator never lets a trait be named before it shows.
 */
export function checkReactions(detectiveCase: DetectiveCase, traits: readonly Trait[]): CaseIssue[] {
  const cluesById = new Map(detectiveCase.clues.map((clue) => [clue.id, clue]));
  return detectiveCase.suspects.flatMap((suspect, suspectIndex) =>
    (suspect.reactions ?? []).flatMap((reaction, reactionIndex) => {
      const path = `suspects[${String(suspectIndex)}].reactions[${String(reactionIndex)}]`;
      const clue = cluesById.get(reaction.clueId);
      const tied = clue !== undefined && [...(clue.about ?? []), ...clue.pointsTo].includes(suspect.id);
      const text = reaction.text.toLowerCase();
      const named = traits.find(({ id }) => text.includes(id.toLowerCase()));
      return [
        ...(tied
          ? []
          : [
              {
                code: 'reaction-not-tied' as const,
                path,
                message: `Clue "${reaction.clueId}" is not about "${suspect.id}", so they have no line for it: list them in the clue's "about", or drop the reaction.`,
              },
            ]),
        ...(named === undefined
          ? []
          : [
              {
                code: 'reaction-names-trait' as const,
                path: `${path}.text`,
                message:
                  'A reaction may not name a trait of the hero; write what the suspect says and nothing about the hero.',
              },
            ]),
      ];
    }),
  );
}
