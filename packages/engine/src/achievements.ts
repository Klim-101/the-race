// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from './assert-never.js';
import { computeProfileStats, type ProfileRecord } from './profile.js';

// Achievements are cosmetic: a catalogue of ids and rules, evaluated over the records of the profile and nothing else,
// so like every number of the profile they are computed and never stored, and a new one needs no migration. The words
// live in the locale files; the code holds only ids. Three things are held by the shape of the rules, and a test:
// every rule counts wins, so nothing is earned by losing, giving up or failing on purpose; no rule reads more than the
// public record of a run, so none can reveal a truth; and none names a place, a person or an event of the real world.

export const ACHIEVEMENT_KINDS = ['mastery', 'challenge', 'collection', 'secret', 'legacy'] as const;
export type AchievementKind = (typeof ACHIEVEMENT_KINDS)[number];

/** What one won run must show; every field that is set must hold. */
export interface RunCondition {
  readonly maxDays?: number;
  readonly minDays?: number;
  readonly maxTurns?: number;
  /** Every trait the hero had showed itself in the run, and the hero had some. */
  readonly allTraitsRevealed?: true;
}

export type AchievementRule =
  /** At least `atLeast` runs were won. */
  | { readonly type: 'wins'; readonly atLeast: number }
  /** At least `atLeast` runs in a row were won. */
  | { readonly type: 'streak'; readonly atLeast: number }
  /** One won run holds the condition. */
  | { readonly type: 'win'; readonly where: RunCondition }
  /** The won runs have at least `atLeast` different values of the field: trades, cases or countries. */
  | {
      readonly type: 'distinct';
      readonly field: 'background' | 'theme' | 'setting';
      readonly atLeast: number;
    };

export interface AchievementDefinition {
  readonly id: string;
  readonly kind: AchievementKind;
  readonly rule: AchievementRule;
}

/**
 * The catalogue. A secret one is told by its name and its words only once it is earned. The number for every crime
 * theme in `full-house` is the count of `GENERAL_CRIME_TYPES`, the violent themes being beyond it; a test keeps it in step.
 */
export const ACHIEVEMENTS = [
  { id: 'first-case', kind: 'mastery', rule: { type: 'wins', atLeast: 1 } },
  { id: 'swift-hand', kind: 'mastery', rule: { type: 'win', where: { maxDays: 1 } } },
  { id: 'few-words', kind: 'mastery', rule: { type: 'win', where: { maxTurns: 20 } } },
  { id: 'know-thyself', kind: 'mastery', rule: { type: 'win', where: { allTraitsRevealed: true } } },
  { id: 'long-haul', kind: 'challenge', rule: { type: 'win', where: { minDays: 5 } } },
  { id: 'three-in-a-row', kind: 'challenge', rule: { type: 'streak', atLeast: 3 } },
  { id: 'five-in-a-row', kind: 'challenge', rule: { type: 'streak', atLeast: 5 } },
  { id: 'many-trades', kind: 'collection', rule: { type: 'distinct', field: 'background', atLeast: 4 } },
  { id: 'many-lands', kind: 'collection', rule: { type: 'distinct', field: 'setting', atLeast: 3 } },
  { id: 'many-crimes', kind: 'collection', rule: { type: 'distinct', field: 'theme', atLeast: 4 } },
  { id: 'by-the-book', kind: 'secret', rule: { type: 'win', where: { maxTurns: 10 } } },
  { id: 'full-house', kind: 'secret', rule: { type: 'distinct', field: 'theme', atLeast: 7 } },
  { id: 'old-hand', kind: 'legacy', rule: { type: 'wins', atLeast: 10 } },
  { id: 'living-legend', kind: 'legacy', rule: { type: 'wins', atLeast: 25 } },
] as const satisfies readonly AchievementDefinition[];

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id'];

const holds = (record: ProfileRecord, where: RunCondition): boolean =>
  (where.maxDays === undefined || record.days <= where.maxDays) &&
  (where.minDays === undefined || record.days >= where.minDays) &&
  (where.maxTurns === undefined || record.turns <= where.maxTurns) &&
  (where.allTraitsRevealed === undefined ||
    (record.traitsTotal > 0 && record.traitsRevealed === record.traitsTotal));

const valueOf = (record: ProfileRecord, field: 'background' | 'theme' | 'setting'): string | undefined => {
  switch (field) {
    case 'background':
      return record.hero.background;
    case 'theme':
      return record.theme;
    case 'setting':
      return record.setting?.id;
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(field);
  }
};

/** Whether the records of a profile satisfy a rule. Only won runs count, whatever the rule. */
export function ruleHolds(rule: AchievementRule, records: readonly ProfileRecord[]): boolean {
  const wins = records.filter(({ won }) => won);
  switch (rule.type) {
    case 'wins':
      return wins.length >= rule.atLeast;
    case 'streak':
      return computeProfileStats(records).bestStreak >= rule.atLeast;
    case 'win':
      return wins.some((record) => holds(record, rule.where));
    case 'distinct':
      return new Set(wins.flatMap((record) => valueOf(record, rule.field) ?? [])).size >= rule.atLeast;
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(rule);
  }
}

/** The ids of the achievements the records earn, in the order of the catalogue. */
export function earnedAchievements(records: readonly ProfileRecord[]): AchievementId[] {
  return ACHIEVEMENTS.filter(({ rule }) => ruleHolds(rule, records)).map(({ id }) => id);
}

/** What the run that has just ended earned that the runs before it had not. */
export function newlyEarned(
  before: readonly ProfileRecord[],
  after: readonly ProfileRecord[],
): AchievementId[] {
  const had = new Set<string>(earnedAchievements(before));
  return earnedAchievements(after).filter((id) => !had.has(id));
}
