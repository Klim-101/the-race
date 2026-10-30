// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { loadRun } from '@the-race/saves';
import { afterEach, describe, expect, it } from 'vitest';
import { serveStdio } from '../src/stdio.js';
import { TOOLS } from '../src/tools/index.js';
import { HERO_CHOICES, gameContext, installCase, sampleCase } from './game.js';
import { Peer } from './peer.js';

// The narrator must never learn the truth by any route before the run is over. This test plays a whole run
// through the real server and looks at every byte that comes back.

const FORBIDDEN_KEYS = new Set([
  'truth',
  'solution',
  'traits',
  'caseSeal',
  'details',
  'lies',
  'culpritId',
  'evidenceChains',
  'motiveDeductionId',
  'rngState',
]);

function scan(value: unknown, strings: string[], keys: string[]): void {
  if (typeof value === 'string') strings.push(value);
  else if (Array.isArray(value)) for (const item of value) scan(item, strings, keys);
  else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      keys.push(key);
      scan(item, strings, keys);
    }
  }
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function connect() {
  const context = gameContext();
  const peer = new Peer();
  const server = await serveStdio(peer, context);
  closers.push(() => server.close());
  await peer.initialize();
  const results: unknown[] = [];
  const call = async (name: string, args: unknown): Promise<Record<string, unknown>> => {
    const reply = await peer.request('tools/call', { name, arguments: args });
    const result = reply.result as { structuredContent: Record<string, unknown>; isError?: boolean };
    results.push(result);
    return result.structuredContent;
  };
  return { context, peer, call, results };
}

describe('the game tools over the server', () => {
  it('lists the eight narrator-facing tools', async () => {
    const { peer } = await connect();
    const reply = await peer.request('tools/list', {});
    const names = (reply.result as { tools: { name: string }[] }).tools.map((tool) => tool.name);
    for (const name of [
      'run_new',
      'hero_create',
      'run_view',
      'act',
      'question',
      'deduce',
      'accuse',
      'run_give_up',
    ]) {
      expect(names).toContain(name);
    }
    expect(TOOLS.length).toBeGreaterThanOrEqual(9);
  });

  it('never returns the truth, a hidden clue, a hidden trait or a suspect card before the end', async () => {
    const { context, call } = await connect();
    const truth = sampleCase().truth;
    const caseClueIds = sampleCase().clues.map(({ id }) => id);

    /** Checks one result against the state the run is in after it. */
    const assertClean = async (result: unknown, mayShowTruth = false): Promise<void> => {
      const loaded = await loadRun(context.saveDir, context.saveFs);
      if (!loaded.ok) throw new Error('The run cannot be loaded.');
      const { run } = loaded;
      const strings: string[] = [];
      const keys: string[] = [];
      scan(result, strings, keys);
      const text = JSON.stringify(result);
      for (const clueId of caseClueIds) {
        if (!run.foundClueIds.includes(clueId)) expect(text).not.toContain(`"${clueId}"`);
      }
      for (const trait of run.traits) {
        if (!run.revealedTraitIds.includes(trait.id)) expect(text).not.toContain(trait.id);
      }
      if (mayShowTruth) return;
      expect(text).not.toContain(truth.motive);
      expect(text).not.toContain(truth.method);
      expect(keys.filter((key) => FORBIDDEN_KEYS.has(key))).toEqual([]);
      for (const suspect of (result as { suspects?: Record<string, unknown>[] }).suspects ?? []) {
        expect(Object.keys(suspect).sort()).toEqual(['id', 'name', 'persona']);
      }
    };

    await call('run_new', { locale: 'en', seed: 'leak' });
    await call('hero_create', HERO_CHOICES);
    await installCase(context);

    let turn = 0;
    let view = await call('run_view', {});
    await assertClean(view);
    const suspects = (view.suspects as { id: string }[]).map(({ id }) => id);

    for (let step = 0; step < 60 && view.status === 'active'; step += 1) {
      const found = (view.clues as { id: string }[]).map(({ id }) => id);
      const exits = (view.location as { exits: { id: string }[] }).exits;
      let result: Record<string, unknown>;
      switch (step % 6) {
        case 0:
          result = await call('act', { turn, intent: { kind: 'look' } });
          break;
        case 1:
          result = await call('act', { turn, intent: { kind: 'search' } });
          break;
        case 2:
          result = await call('question', {
            turn,
            suspectId: suspects[step % suspects.length],
            approach: 'social',
            clueIds: found.slice(0, 3),
          });
          break;
        case 3:
          result = await call('deduce', { turn, clueIds: found.slice(0, 2) });
          break;
        case 4:
          result = await call('act', {
            turn,
            intent: { kind: 'move', locationId: exits[step % exits.length]?.id },
          });
          break;
        default:
          result = await call('act', { turn, intent: { kind: 'search' } });
      }
      await assertClean(result);
      view = await call('run_view', {});
      await assertClean(view);
      turn = view.turn as number;
    }

    // The same call made twice is carried out once: the stale turn is refused and changes nothing.
    if (view.status === 'active') {
      const stale = await call('act', { turn: turn - 1, intent: { kind: 'look' } });
      expect(stale).toMatchObject({ error: { code: 'stale-turn' } });
      await assertClean(stale);
      expect((await call('run_view', {})).turn).toBe(turn);

      const accusation = await call('accuse', {
        turn,
        culpritId: suspects[0],
        motiveInsightId: null,
        evidenceClueIds: (view.clues as { id: string }[]).map(({ id }) => id),
      });
      expect(accusation).toMatchObject({
        outcome: { kind: 'accuse', truth: { culpritId: truth.culpritId } },
      });
      await assertClean(accusation, true);
    }
    expect(turn).toBeGreaterThan(0);
  });
});
