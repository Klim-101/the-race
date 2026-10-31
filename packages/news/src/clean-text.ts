// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    }
    // An entity the feed defined itself is never expanded: that is how a feed would bomb a parser.
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Plain, single-line text from the text of a feed. A feed is untrusted: its markup is dropped rather than
 * kept, control characters go, and the result is cut at `limit` characters.
 */
export function cleanText(raw: string, limit: number): string {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Entities are decoded once before the tags go, since many feeds carry HTML escaped inside XML.
  const withoutTags = decodeEntities(unwrapped).replace(/<[^>]*>/g, ' ');
  const plain = decodeEntities(withoutTags)
    // Control and format characters: line breaks, zero-width and bidirectional marks, the byte-order mark.
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const characters = Array.from(plain);
  return characters.length <= limit
    ? plain
    : `${characters
        .slice(0, limit - 1)
        .join('')
        .trimEnd()}…`;
}
