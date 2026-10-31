// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { EntityIdSchema } from '../detective/case-schema.js';
import { LOCALES, type Locale } from '../locale.js';
import type { RunMigrationRegistry } from '../migrations.js';
import { findRealName, replaceRealName } from '../text/real-names.js';
import { ClimateProfileSchema } from './climate.js';
import { isInLocaleScript } from '../text/script.js';
import { transliterate } from '../text/transliterate.js';

/** Bumped, with a step in the migrations, whenever the shape of the dictionary changes. */
export const WORLD_SCHEMA_VERSION = 1;

/** `fromVersion -> step`, as for a run: empty until the first change of shape. */
export const WORLD_MIGRATIONS: RunMigrationRegistry = {};

/** The world itself has one fixed name per language. It is never generated and is not an entry. */
export const WORLD_NAMES: Readonly<Record<Locale, string>> = { ru: 'Черновик', en: 'The Draft' };

export const ENTITY_KINDS = ['country', 'organisation', 'role'] as const;
export const EntityKindSchema = z.enum(ENTITY_KINDS);
export type EntityKind = z.infer<typeof EntityKindSchema>;

const MirrorNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^\p{L}[\p{L}\p{M}' -]*$/u, 'Use letters, spaces, hyphens and apostrophes only.');

/** One form of the mirror name for every language: Вальдмарк and Valdmark are one place. */
export const MirrorFormsSchema = z.strictObject({ ru: MirrorNameSchema, en: MirrorNameSchema });
export type MirrorForms = z.infer<typeof MirrorFormsSchema>;

/** What an agent proposes: the real side is every way the headlines may write the entity. */
export const WorldProposalSchema = z.strictObject({
  kind: EntityKindSchema,
  real: z.array(z.string().trim().min(2).max(60)).min(1).max(12),
  mirror: MirrorFormsSchema,
  /** A country keeps the climate of the real one; stored with the entry, so it never changes. */
  climate: ClimateProfileSchema.optional(),
});
export type WorldProposal = z.infer<typeof WorldProposalSchema>;

export const WorldEntrySchema = WorldProposalSchema.extend({ id: EntityIdSchema });
export type WorldEntry = z.infer<typeof WorldEntrySchema>;

const fold = (name: string): string => name.normalize('NFKC').toLowerCase().replaceAll('ё', 'е');

function repeated(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

/** The dictionary as stored. Entries are only ever appended: nothing here is edited or removed. */
export const WorldSchema = z
  .strictObject({ schemaVersion: z.literal(WORLD_SCHEMA_VERSION), entries: z.array(WorldEntrySchema) })
  .refine(({ entries }) => !repeated(entries.map(({ id }) => id)), { message: 'Two entries share an id.' })
  .refine(
    ({ entries }) => LOCALES.every((locale) => !repeated(entries.map(({ mirror }) => fold(mirror[locale])))),
    { message: 'Two entries share a mirror name.' },
  )
  .refine(({ entries }) => !repeated(entries.flatMap(({ real }) => real.map(fold))), {
    message: 'Two entries share a real name.',
  });
export type World = z.infer<typeof WorldSchema>;

export const EMPTY_WORLD: World = { schemaVersion: WORLD_SCHEMA_VERSION, entries: [] };

export const WORLD_ISSUE_CODES = [
  'duplicate-alias',
  'alias-taken',
  'wrong-script',
  'mirror-is-real',
  'mirror-taken',
  'bad-mirror',
] as const;
export interface WorldIssue {
  readonly code: (typeof WORLD_ISSUE_CODES)[number];
  readonly message: string;
}

export type ProposeResult =
  | { readonly ok: true; readonly world: World; readonly entry: WorldEntry }
  | { readonly ok: false; readonly issues: readonly WorldIssue[] };

/** The names and their likely spellings in the other script. */
const withSpellings = (names: readonly string[]): string[] => [
  ...names,
  ...names.flatMap((name) => transliterate(name)),
];

function slugOf(english: string): string {
  return english
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Whether two names are one name, up to case and ending ("Россия", "России"). A name that merely contains
 * another is a different one: "Банк России" is not Russia.
 */
const touches = (a: string, b: string): boolean =>
  replaceRealName(a, b, '').trim() === '' || replaceRealName(b, a, '').trim() === '';

/**
 * Adds an entity to the dictionary, or says why not. Pure: the world that comes back is a new one, and the
 * one passed in is untouched. A real entity has one entry only; a mirror name belongs to one entity only and
 * is never, in either language or script, a real name: not one of the entity's own, not one in the
 * dictionary, not one of `knownRealNames` (taken from the headlines of the day).
 */
export function proposeEntry(
  world: World,
  proposal: WorldProposal,
  knownRealNames: readonly string[] = [],
): ProposeResult {
  const issues: WorldIssue[] = [];
  if (repeated(proposal.real.map(fold))) {
    issues.push({ code: 'duplicate-alias', message: 'The same real name is listed twice.' });
  }
  const taken = world.entries.flatMap(({ real }) => real);
  for (const alias of proposal.real) {
    if (taken.some((existing) => touches(alias, existing))) {
      issues.push({ code: 'alias-taken', message: `"${alias}" already belongs to an entry.` });
    }
  }

  const realNames = withSpellings([...taken, ...proposal.real, ...knownRealNames]);
  let englishTaken = false;
  for (const locale of LOCALES) {
    const form = proposal.mirror[locale];
    if (!isInLocaleScript(form, locale)) {
      issues.push({ code: 'wrong-script', message: `The ${locale} form must be written in its own script.` });
    }
    if (findRealName(form, realNames) !== undefined) {
      issues.push({ code: 'mirror-is-real', message: `The ${locale} form "${form}" is a real name.` });
    }
    if (world.entries.some(({ mirror }) => touches(form, mirror[locale]))) {
      issues.push({ code: 'mirror-taken', message: `The ${locale} form "${form}" is already in use.` });
      if (locale === 'en') englishTaken = true;
    }
  }

  const id = slugOf(proposal.mirror.en);
  if (!EntityIdSchema.safeParse(id).success) {
    issues.push({ code: 'bad-mirror', message: 'The en form needs Latin letters to name the entry.' });
  } else if (!englishTaken && world.entries.some((entry) => entry.id === id)) {
    issues.push({ code: 'mirror-taken', message: `The en form "${proposal.mirror.en}" is already in use.` });
  }
  if (issues.length > 0) return { ok: false, issues };

  const entry: WorldEntry = { id, ...proposal };
  return { ok: true, world: { ...world, entries: [...world.entries, entry] }, entry };
}

/** Every real name of the dictionary, with its likely spellings in the other script: what a case must not contain. */
export const worldRealNames = (world: World): string[] =>
  withSpellings(world.entries.flatMap(({ real }) => real));

/** The entries whose real name stands in the text. */
export function entriesIn(world: World, text: string): WorldEntry[] {
  return world.entries.filter(({ real }) => findRealName(text, real) !== undefined);
}

/**
 * The text with every real name of the dictionary swapped for its mirror name in the language. Longer real
 * names go first, so "Банк России" is one swap and not two. The text comes back folded to NFKC.
 */
export function mirrorText(world: World, text: string, locale: Locale): string {
  const swaps = world.entries
    .flatMap(({ real, mirror }) => real.map((name) => ({ name, to: mirror[locale] })))
    .sort((a, b) => b.name.length - a.name.length);
  return swaps.reduce((current, { name, to }) => replaceRealName(current, name, to), text.normalize('NFKC'));
}

export interface WorldView {
  readonly name: string;
  readonly entries: readonly { readonly id: string; readonly kind: EntityKind; readonly name: string }[];
}

/** What the narrator and the player may see: the mirror side only, never a real name. */
export function viewWorld(world: World, locale: Locale): WorldView {
  return {
    name: WORLD_NAMES[locale],
    entries: world.entries.map(({ id, kind, mirror }) => ({ id, kind, name: mirror[locale] })),
  };
}
