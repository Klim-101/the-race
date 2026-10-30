// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from '../../assert-never.js';
import { passChanceWithoutLuck } from '../../dice.js';
import { collectModifier } from '../../modifiers.js';
import type { Trait, TraitTrigger } from '../../traits.js';
import type { DetectiveHero } from '../archetype.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase, LocationAccess, SkillCheck } from '../case-schema.js';
import { buildNeighbors, closedSources, type Obtainable } from '../obtainability.js';

/**
 * How many times the model lets the hero try one check. A failed search costs 45 minutes and the case runs
 * for days, so a few retries are real; three is still modest, and the validator takes no luck from a natural 20.
 */
export const CHECK_ATTEMPTS = 3;

/**
 * The least chance the hero's best evidence chain and the motive may have. A chain is five or six checks
 * in a row, so even a fair case multiplies down: with `CHECK_ATTEMPTS` tries each, the weakest starting
 * hero on the shipped cases sits a little above one in three. Below 0.3 the hero loses more often than
 * not however well they play.
 */
export const MIN_SOLVE_CHANCE = 0.3;

/** The chance of one check for this hero, with the luck of a natural 20 left out (as the validator does everywhere). */
function checkChance(
  hero: DetectiveHero,
  traits: readonly Trait[],
  check: SkillCheck,
  situations: readonly TraitTrigger[],
): number {
  const modifier = collectModifier({ traits }, check.skill, situations);
  return (
    1 - (1 - passChanceWithoutLuck(hero.skills[check.skill], modifier, check.difficulty)) ** CHECK_ATTEMPTS
  );
}

/** Keeps the larger of two chances for an id; says whether it changed anything. */
function raise(chances: Map<string, number>, id: string, value: number): boolean {
  if (value <= (chances.get(id) ?? 0)) return false;
  chances.set(id, value);
  return true;
}

/**
 * For every clue, the best chance of obtaining it: the product of the checks on the most likely route to it,
 * which are the skill-gated doors it has to pass and its own discovery check. A clue found by simply looking
 * counts as 1 and a clue from a closed source as 0. Each check gets `CHECK_ATTEMPTS` tries, no more, and
 * the luck of a natural 20 is left out, which keeps the estimate conservative. Independent checks multiply; a door shared by two clues is counted
 * once for each, which is conservative again. A door that opens with a clue is as likely as that clue.
 */
export function clueChances(
  detectiveCase: DetectiveCase,
  hero: DetectiveHero,
  traits: readonly Trait[],
): ReadonlyMap<string, number> {
  const neighborsById = buildNeighbors(detectiveCase.locations);
  const closed = closedSources(traits);
  const places = new Map<string, number>([[detectiveCase.startLocationId, 1]]);
  const clues = new Map<string, number>();
  const gate = (access: LocationAccess, situations: readonly TraitTrigger[]): number => {
    switch (access.kind) {
      case 'open':
        return 1;
      case 'skill':
        return checkChance(hero, traits, access.check, situations);
      case 'clue':
        return clues.get(access.clueId) ?? 0;
      /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
      default:
        return assertNever(access);
    }
  };

  // Chances only grow and never pass 1, and a best route has no loops, so this settles within one round per
  // entity; the bound just guarantees that the loop ends.
  const rounds = detectiveCase.locations.length + detectiveCase.clues.length + 1;
  for (let round = 0; round < rounds; round += 1) {
    let hasChanged = false;
    for (const location of detectiveCase.locations) {
      const best = Math.max(
        0,
        ...[...(neighborsById.get(location.id) ?? [])].map((id) => places.get(id) ?? 0),
      );
      hasChanged =
        raise(places, location.id, best * gate(location.access, location.situations)) || hasChanged;
    }
    for (const location of detectiveCase.locations) {
      for (const clue of detectiveCase.clues) {
        if (clue.locationId !== location.id) continue;
        if (clue.source !== null && closed.has(clue.source)) continue;
        const discovery =
          clue.discovery === null
            ? 1
            : checkChance(hero, traits, clue.discovery, [...location.situations, ...clue.situations]);
        hasChanged = raise(clues, clue.id, (places.get(location.id) ?? 0) * discovery) || hasChanged;
      }
    }
    if (!hasChanged) break;
  }
  return clues;
}

/** The chance of the best evidence chain together with the motive: all their clues, each found once. */
export function bestSolveChance(
  detectiveCase: DetectiveCase,
  hero: DetectiveHero,
  traits: readonly Trait[],
): number {
  const chances = clueChances(detectiveCase, hero, traits);
  const { evidenceChains, motiveDeductionId } = detectiveCase.solution;
  const motiveClueIds = detectiveCase.deductions
    .filter(({ id }) => id === motiveDeductionId)
    .flatMap(({ clueIds }) => clueIds);
  return Math.max(
    0,
    ...evidenceChains.map((chain) =>
      [...new Set([...chain, ...motiveClueIds])].reduce((product, id) => product * (chances.get(id) ?? 0), 1),
    ),
  );
}

/**
 * The case must give this hero a fair chance, not only a possible one, of proving it by some chain. A case
 * with no possible chain at all is rejected by the solution check already, so it is not reported twice.
 */
export function checkSolveChance(
  detectiveCase: DetectiveCase,
  hero: DetectiveHero,
  traits: readonly Trait[],
  obtainable: Obtainable,
): CaseIssue[] {
  const { evidenceChains, motiveDeductionId } = detectiveCase.solution;
  const isFound = (id: string): boolean => obtainable.clueIds.has(id);
  const motiveIsPossible = detectiveCase.deductions
    .filter(({ id }) => id === motiveDeductionId)
    .every(({ clueIds }) => clueIds.every(isFound));
  if (!motiveIsPossible || !evidenceChains.some((chain) => chain.every(isFound))) return [];
  const chance = bestSolveChance(detectiveCase, hero, traits);
  if (chance >= MIN_SOLVE_CHANCE) return [];
  return [
    {
      code: 'unlikely-solution',
      path: 'solution.evidenceChains',
      message: `The best evidence chain and the motive can be gathered with a chance of only ${String(
        Math.round(chance * 100),
      )}%, and at least ${String(Math.round(MIN_SOLVE_CHANCE * 100))}% is needed; lower the difficulty of the checks on the way to them.`,
    },
  ];
}
