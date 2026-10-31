// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { cleanText } from './clean-text.js';

export interface Headline {
  readonly title: string;
  /** A short gist, when the feed gives one. Never an article. */
  readonly summary?: string | undefined;
}

export const TITLE_LIMIT = 200;
export const SUMMARY_LIMIT = 300;

function firstTag(block: string, names: readonly string[]): string {
  for (const name of names) {
    const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
    if (match?.[1] !== undefined) return match[1];
  }
  return '';
}

/**
 * The headlines of an RSS 2.0, RSS 1.0 (RDF) or Atom document, at most `limit`. Tolerant on purpose: a
 * malformed feed gives fewer headlines, never an error. It reads text only, never links, so nothing in a
 * feed can send the game anywhere.
 */
export function parseFeed(xml: string, limit: number): Headline[] {
  const headlines: Headline[] = [];
  for (const block of xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
    if (headlines.length >= limit) break;
    const body = block.slice(2).join('');
    const title = cleanText(firstTag(body, ['title']), TITLE_LIMIT);
    if (title === '') continue;
    const summary = cleanText(firstTag(body, ['description', 'summary', 'content']), SUMMARY_LIMIT);
    headlines.push(summary === '' || summary === title ? { title } : { title, summary });
  }
  return headlines;
}
