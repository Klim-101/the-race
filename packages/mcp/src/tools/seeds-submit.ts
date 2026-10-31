// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { NewsSeedsSchema, validateSeeds } from '@the-race/engine';
import { loadSeeds, saveSeedsForDay } from '@the-race/saves';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { readTodaysNews, realNamesOfDay } from '../news.js';
import { ToolFailure } from '../tool-error.js';
import { requireWorld } from '../world.js';
import { NEWS_ERROR_CODES } from './news-brief.js';

/** Seeds are saved one submission at a time: two at once would both see an empty day. */
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

export const seedsSubmit = defineTool({
  name: 'seeds_submit',
  description:
    'For the seed extractor only. Submits the seeds of today. The engine checks that every seed cites only ' +
    'headlines from `news_brief`, by id, and that no premise names a real person, place or organisation, in ' +
    'either script. The result is {"accepted":true,"count":...} and the seeds are then kept for the day and ' +
    'shared by every run, or {"accepted":false,"issues":[...]} with what to change: fix exactly those and ' +
    'submit again, at most three times in all. It refuses once the seeds of today are kept.',
  inputSchema: z.object({ seeds: NewsSeedsSchema }),
  outputSchema: z.object({
    accepted: z.boolean(),
    count: z.int().optional(),
    issues: z.array(z.object({ code: z.string(), seedId: z.string(), message: z.string() })).optional(),
  }),
  handler: ({ seeds }, context) =>
    serialized(async () => {
      if ((await loadSeeds(context.saveDir, context.saveFs))[context.today()] !== undefined) {
        throw new ToolFailure({
          code: NEWS_ERROR_CODES.alreadyExtracted,
          message: 'The seeds of today are already kept, and they cannot be replaced.',
          remediation: 'Stop. Answer "ready".',
        });
      }
      const news = await readTodaysNews(context);
      const world = await requireWorld(context);
      const issues = validateSeeds(seeds, {
        headlineIds: news.entries.map(({ id }) => id),
        realNames: realNamesOfDay(news, world),
      });
      if (issues.length > 0) return { accepted: false, issues };
      await saveSeedsForDay(context.saveDir, news.day, seeds, context.saveFs);
      return { accepted: true, count: seeds.length };
    }),
});
