// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { EntityIdSchema, ToneSchema } from '../detective/case-schema.js';
import { findRealName } from '../text/real-names.js';

/** `h` and eight hex digits: a digest of the headline's title, so the same story has the same id every day. */
export const HeadlineIdSchema = z.string().regex(/^h[0-9a-f]{8}$/, 'Use a headline id such as h3f2a9c1d.');

/**
 * The kinds of tension a seed can be about. They name a pattern, never an event: a shortage, a scandal, an
 * outage. Armed conflict is not here by design, since a conflict reaches the models as one fixed line and no
 * headline (see the tragedy filter).
 */
export const SEED_KINDS = [
  'shortage',
  'scandal',
  'outage',
  'leak',
  'market-shock',
  'dispute',
  'reform',
  'curiosity',
] as const;
export const SeedKindSchema = z.enum(SEED_KINDS);
export type SeedKind = z.infer<typeof SeedKindSchema>;

export const MAX_SEED_HEADLINES = 3;
export const MAX_SEEDS = 12;

/**
 * An abstract seed of the day: the kind of tension and its tone, tied to the headlines it grew from by id and
 * never by text. The `premise` is invented, a sentence about the pattern with no place, side or name in it.
 */
export const NewsSeedSchema = z.strictObject({
  id: EntityIdSchema,
  headlineIds: z.array(HeadlineIdSchema).min(1).max(MAX_SEED_HEADLINES),
  kind: SeedKindSchema,
  tone: ToneSchema,
  premise: z.string().trim().min(20).max(240),
});
export type NewsSeed = z.infer<typeof NewsSeedSchema>;

export const NewsSeedsSchema = z
  .array(NewsSeedSchema)
  .min(1)
  .max(MAX_SEEDS)
  .refine((seeds) => new Set(seeds.map(({ id }) => id)).size === seeds.length, {
    message: 'Two seeds share an id.',
  });

export type SeedIssueCode = 'unknown-headline' | 'real-name';

export interface SeedIssue {
  readonly code: SeedIssueCode;
  readonly seedId: string;
  readonly message: string;
}

export interface SeedValidationContext {
  /** The ids of the headlines the seeds may refer to: the ones the extractor was given. */
  readonly headlineIds: readonly string[];
  /** Every real name of the day's headlines and of the dictionary, as the case validator gets them. */
  readonly realNames: readonly string[];
}

/**
 * What is wrong with a list of seeds that already fits the schema. A seed must refer only to headlines it was
 * given, and its premise must not carry a real name. The message says which seed and which field, never the
 * name itself, so a refusal does not repeat the name.
 */
export function validateSeeds(seeds: readonly NewsSeed[], context: SeedValidationContext): SeedIssue[] {
  const known = new Set(context.headlineIds);
  return seeds.flatMap((seed): SeedIssue[] => {
    const issues: SeedIssue[] = [];
    const unknown = seed.headlineIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      issues.push({
        code: 'unknown-headline',
        seedId: seed.id,
        message: `Seed "${seed.id}" refers to ${unknown.join(', ')}, which you were not given.`,
      });
    }
    if (findRealName(seed.premise, context.realNames) !== undefined) {
      issues.push({
        code: 'real-name',
        seedId: seed.id,
        message: `The premise of seed "${seed.id}" names a real person, place or organisation. Say the pattern without a name.`,
      });
    }
    return issues;
  });
}
