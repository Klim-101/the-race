// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { extractRealNames, type World } from '@the-race/engine';
import {
  listUntrustedHeadlines,
  loadHeadlines,
  renderUntrustedHeadlines,
  type HeadlineGroup,
  type ListedHeadline,
} from '@the-race/news';
import type { ServerContext } from './context.js';
import { ToolFailure } from './tool-error.js';

/** The languages the game is played in; a feed in another one is kept in the list and not read. */
const READ_LANGUAGES: readonly string[] = ['ru', 'en'];

export interface DayNews {
  readonly day: string;
  /** The fenced block an agent is shown. */
  readonly block: string;
  /** The headlines in that block, with their ids: what a seed may cite. */
  readonly entries: readonly ListedHeadline[];
}

/**
 * Today's headlines as the boundary lets them through. Each feed is fetched at most once a day (see
 * `loadHeadlines`), so asking again costs nothing. Fails when nothing is left, so no agent works on an empty day.
 */
export async function readTodaysNews(context: ServerContext): Promise<DayNews> {
  const day = context.today();
  const feeds = (await context.feeds()).filter(
    ({ enabled, language }) => enabled && READ_LANGUAGES.includes(language),
  );
  const loaded = await loadHeadlines({
    feeds,
    day,
    saveDir: context.saveDir,
    saveFs: context.saveFs,
    get: context.httpGet,
  });
  const groups: HeadlineGroup[] = loaded.map(({ feed, headlines }) => ({ topic: feed.topic, headlines }));
  const { entries } = listUntrustedHeadlines(groups);
  if (entries.length === 0) {
    throw new ToolFailure({
      code: 'no-headlines',
      message: 'There are no headlines today that may be used.',
      remediation: 'Stop. Answer "failed: no headlines today".',
    });
  }
  return { day, block: renderUntrustedHeadlines(groups), entries };
}

/**
 * Every real name the seeds of a day must avoid: the names in the headlines it was given, in both scripts,
 * and every real name of the dictionary of the mirror world.
 */
export function realNamesOfDay(news: DayNews, world: World): string[] {
  const texts = news.entries.flatMap(({ headline }) => [headline.title, headline.summary ?? '']);
  return [...new Set([...extractRealNames(texts), ...world.entries.flatMap(({ real }) => real)])];
}
