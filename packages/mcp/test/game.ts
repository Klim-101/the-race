// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { DetectiveCaseSchema, createDetectiveRun, type DetectiveCase } from '@the-race/engine';
import { saveRun } from '@the-race/saves';
import type { Tool } from '../src/define-tool.js';
import type { ServerContext } from '../src/context.js';
import { clearPending, loadPending } from '../src/pending-run.js';
import { heroCreate } from '../src/tools/hero-create.js';
import { runNew } from '../src/tools/run-new.js';
import { memoryFs, type MemoryFs } from '../../saves/test/memory-fs.js';

export interface GameContext extends ServerContext {
  readonly fs: MemoryFs;
}

/** A context on an in-memory disk with seeds that count up. */
export function gameContext(): GameContext {
  const fs = memoryFs();
  let counter = 0;
  return { saveDir: 'game-save', saveFs: fs, fs, newSeed: () => `game-seed-${String(++counter)}` };
}

export function sampleCase(): DetectiveCase {
  const url = new URL('../../../content/cases/goose-of-elmwick.en.json', import.meta.url);
  return DetectiveCaseSchema.parse(JSON.parse(readFileSync(url, 'utf8')));
}

/** The structured content of a call, and whether it failed. */
export async function call(
  tool: Tool,
  args: unknown,
  context: ServerContext,
): Promise<{ isError: boolean; body: Record<string, unknown> }> {
  const result = await tool.run(args, context);
  return { isError: result.isError === true, body: result.structuredContent ?? {} };
}

export const HERO_CHOICES = {
  name: 'Mira Kos',
  gender: 'female',
  background: 'police',
  signalId: 'in-love',
  skills: { perception: 4, reasoning: 3, social: 3, pressure: 0, tech: 0, contacts: 0 },
} as const;

/** run_new and hero_create, as the narrator would. */
export async function prepareHero(context: ServerContext): Promise<void> {
  await call(runNew, { locale: 'en', seed: 'sample-seed' }, context);
  const made = await call(heroCreate, HERO_CHOICES, context);
  if (made.isError) throw new Error('The test hero was refused.');
}

/** What `scenario_submit` does later, written for a test: the pending hero and the case become a saved run. */
export async function installCase(context: ServerContext): Promise<void> {
  const pending = await loadPending(context.saveDir, context.saveFs);
  if (pending?.hero == null) throw new Error('No pending hero.');
  await saveRun(
    context.saveDir,
    createDetectiveRun({
      hero: pending.hero,
      traits: pending.traits,
      case: sampleCase(),
      seed: pending.seed,
      rngState: pending.rngState,
      locale: pending.locale,
    }),
    context.saveFs,
  );
  await clearPending(context.saveDir, context.saveFs);
}
