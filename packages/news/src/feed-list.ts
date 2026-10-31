// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

/** What a feed is written in. Wider than the languages of a run: a feed in German is kept, not yet used. */
export const FEED_LANGUAGES = ['ru', 'en', 'de', 'es'] as const;
export const FeedLanguageSchema = z.enum(FEED_LANGUAGES);

/** `humor` feeds are satire and jokes: atmosphere for a case, never a source of its world events. */
export const FEED_TOPICS = ['world', 'economy', 'tech', 'humor'] as const;
export const FeedTopicSchema = z.enum(FEED_TOPICS);
export type FeedTopic = z.infer<typeof FeedTopicSchema>;

export const FeedSchema = z.object({
  /** Names the feed's cache file, so it is `kebab-case` and never a path. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  language: FeedLanguageSchema,
  topic: FeedTopicSchema,
  url: z.url({ protocol: /^https$/ }),
  enabled: z.boolean(),
});
export type Feed = z.infer<typeof FeedSchema>;

export const FeedListSchema = z
  .array(FeedSchema)
  .min(1)
  .refine((feeds) => new Set(feeds.map(({ id }) => id)).size === feeds.length, {
    message: 'Feed ids must be unique.',
  });
export type FeedList = z.infer<typeof FeedListSchema>;
