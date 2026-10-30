// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { PassThrough } from 'node:stream';

/** A JSON-RPC peer over the same line-delimited streams a real host uses. */
export class Peer {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  private buffer = '';
  private readonly waiting = new Map<number, (message: Record<string, unknown>) => void>();
  private nextId = 1;

  constructor() {
    this.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      let newline = this.buffer.indexOf('\n');
      while (newline >= 0) {
        const message = JSON.parse(this.buffer.slice(0, newline)) as Record<string, unknown>;
        this.buffer = this.buffer.slice(newline + 1);
        this.waiting.get(message.id as number)?.(message);
        newline = this.buffer.indexOf('\n');
      }
    });
  }

  request(method: string, params: unknown): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const reply = new Promise<Record<string, unknown>>((resolve) => this.waiting.set(id, resolve));
    this.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return reply;
  }

  notify(method: string): void {
    this.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
  }

  async initialize(): Promise<Record<string, unknown>> {
    const reply = await this.request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.0.0' },
    });
    this.notify('notifications/initialized');
    return reply;
  }
}
