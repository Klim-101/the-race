// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createHttpGet } from './http-get.js';

interface Reply {
  readonly url?: string;
  readonly status?: number;
  readonly headers?: Record<string, string>;
}

function respond(
  body: ConstructorParameters<typeof Response>[0],
  { url = 'https://feeds.test/f.xml', status = 200, headers = {} }: Reply = {},
) {
  const response = new Response(body, { status, headers });
  // A constructed response has no address; a real one reports where the redirects ended.
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

const get = (reply: () => Response, maxBytes = 1000) =>
  createHttpGet({ timeoutMs: 50, maxBytes, fetch: () => Promise.resolve(reply()) });

function bytes(...parts: (string | number[])[]): Uint8Array {
  return Uint8Array.from(
    parts.flatMap((part) => (typeof part === 'string' ? [...Buffer.from(part, 'latin1')] : part)),
  );
}

const PRIVET_1251 = [0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2];

describe('createHttpGet', () => {
  it('asks politely, with a timeout, and returns the text', async () => {
    let seen: RequestInit | undefined;
    const read = createHttpGet({
      timeoutMs: 50,
      maxBytes: 1000,
      fetch: (_url, init) => {
        seen = init;
        return Promise.resolve(respond('<rss/>'));
      },
    });

    expect(await read('https://feeds.test/f.xml')).toBe('<rss/>');
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
    expect((seen?.headers as Record<string, string>)['user-agent']).toContain('the-race');
  });

  it('can be built on the real fetch', () => {
    expect(createHttpGet({ timeoutMs: 50, maxBytes: 1000 })).toBeTypeOf('function');
  });

  it('refuses a feed that ends up off https, answers with an error, or has no body', async () => {
    await expect(get(() => respond('x', { url: 'http://feeds.test/f' }))('u')).rejects.toThrow('https');
    await expect(get(() => respond('x', { status: 503 }))('u')).rejects.toThrow('503');
    await expect(get(() => respond(null))('u')).rejects.toThrow('no body');
  });

  it('refuses a feed over the limit, whether it says so or only turns out so', async () => {
    const declared = respond('x', { headers: { 'content-length': '5000' } });
    await expect(get(() => declared)('u')).rejects.toThrow('larger');
    await expect(get(() => respond('x'.repeat(2000)))('u')).rejects.toThrow('larger');
  });

  it('joins a body that arrives in pieces', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes('<rss>'));
        controller.enqueue(bytes('</rss>'));
        controller.close();
      },
    });
    expect(await get(() => respond(stream))('u')).toBe('<rss></rss>');
  });

  it('reads the encoding from the header, from the XML declaration, or falls back to UTF-8', async () => {
    const header = respond(bytes(PRIVET_1251), {
      headers: { 'content-type': 'text/xml; charset=windows-1251' },
    });
    expect(await get(() => header)('u')).toBe('Привет');

    const declared = respond(bytes('<?xml version="1.0" encoding="windows-1251"?>', PRIVET_1251));
    expect(await get(() => declared)('u')).toBe('<?xml version="1.0" encoding="windows-1251"?>Привет');

    const unknown = respond(bytes('ok'), { headers: { 'content-type': 'text/xml; charset=no-such-9' } });
    expect(await get(() => unknown)('u')).toBe('ok');

    expect(await get(() => respond(new TextEncoder().encode('Привет')))('u')).toBe('Привет');
  });
});
