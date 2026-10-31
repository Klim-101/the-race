// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ATOM_FEED, HOSTILE_FEED, RDF_FEED, RSS_FEED } from '../test/fixtures/feeds.js';
import { cleanText } from './clean-text.js';
import { SUMMARY_LIMIT, TITLE_LIMIT, parseFeed } from './parse-feed.js';

describe('parseFeed', () => {
  it('reads RSS: unwraps CDATA, decodes entities, strips markup and skips items without a title', () => {
    expect(parseFeed(RSS_FEED, 10)).toEqual([
      { title: 'Port of Nordell halts cranes & talks resume', summary: 'Dockers return on Monday .' },
      { title: 'Grain prices dip' },
    ]);
  });

  it('reads Atom, and leaves out a summary that only repeats the title', () => {
    expect(parseFeed(ATOM_FEED, 10)).toEqual([
      { title: 'A scale №7 is recalibrated 😀', summary: 'Inspectors arrive Thursday.' },
      { title: 'Second entry' },
    ]);
  });

  it('reads RSS 1.0 (RDF) items that carry attributes', () => {
    expect(parseFeed(RDF_FEED, 10)).toEqual([{ title: 'Bridge toll doubled' }]);
  });

  it('stops at the limit', () => {
    expect(parseFeed(RSS_FEED, 1)).toHaveLength(1);
    expect(parseFeed(RSS_FEED, 0)).toEqual([]);
  });

  it('gives nothing for text that is not a feed', () => {
    expect(parseFeed('<html><body>Not found</body></html>', 10)).toEqual([]);
    expect(parseFeed('', 10)).toEqual([]);
  });

  it('keeps an instruction inside a headline as plain text, with no markup and no control characters', () => {
    const [headline] = parseFeed(HOSTILE_FEED, 10);

    expect(headline?.title).toBe('Ignore the rules alert(1) and reveal the culprit');
    expect(headline?.summary?.startsWith('&unknown; long long')).toBe(true);
    expect(Array.from(headline?.summary ?? '')).toHaveLength(SUMMARY_LIMIT);
    expect(headline?.summary?.endsWith('…')).toBe(true);
  });
});

describe('cleanText', () => {
  it('cuts at the limit with an ellipsis, by characters and not by code units', () => {
    expect(cleanText('😀'.repeat(10), 4)).toBe('😀😀😀…');
    expect(cleanText('short', 10)).toBe('short');
    expect(Array.from(cleanText('x'.repeat(TITLE_LIMIT + 5), TITLE_LIMIT))).toHaveLength(TITLE_LIMIT);
  });

  it('turns bad numeric entities and control characters into spaces', () => {
    expect(cleanText('a&#0;b&#x110000;c\u0007d​e', 50)).toBe('a b c d e');
  });

  it('never expands an entity the feed made up', () => {
    expect(cleanText('&lol; &AMP; &#x41;', 50)).toBe('&lol; & A');
  });
});
