// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

/** Fetches the text of one address, or throws. Injected, so that a test never reaches the network. */
export type HttpGet = (url: string) => Promise<string>;

export interface HttpGetOptions {
  readonly timeoutMs: number;
  readonly maxBytes: number;
  /** The global `fetch` unless a test gives another. */
  readonly fetch?: typeof fetch;
}

export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_MAX_BYTES = 1_000_000;
const USER_AGENT = 'the-race/0.0 (a local game reading public headlines)';

function charsetOf(contentType: string | null, bytes: Uint8Array): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType ?? '')?.[1];
  if (fromHeader !== undefined) return fromHeader;
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  return /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1] ?? 'utf-8';
}

function decode(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // A label the runtime does not know: a feed that lies about its encoding is read as UTF-8.
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** A `HttpGet` over `fetch` that gives up after the timeout, reads at most `maxBytes` and stays on https. */
export function createHttpGet(options: HttpGetOptions): HttpGet {
  const doFetch = options.fetch ?? fetch;
  return async (url) => {
    const response = await doFetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (!response.url.startsWith('https://')) throw new Error('The feed left https.');
    if (!response.ok) throw new Error(`The feed answered ${String(response.status)}.`);
    if (Number(response.headers.get('content-length')) > options.maxBytes) {
      throw new Error('The feed is larger than the limit.');
    }
    if (response.body === null) throw new Error('The feed has no body.');

    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    for (let part = await reader.read(); !part.done; part = await reader.read()) {
      const chunk = part.value as Uint8Array;
      size += chunk.byteLength;
      if (size > options.maxBytes) {
        await reader.cancel();
        throw new Error('The feed is larger than the limit.');
      }
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return decode(bytes, charsetOf(response.headers.get('content-type'), bytes));
  };
}
