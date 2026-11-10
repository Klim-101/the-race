// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadStory, runBoardFile } from '@the-race/saves';
import { describe, expect, it } from 'vitest';
import { call, gameContext, installCase, newestRunId, prepareHero } from '../../test/game.js';
import { evidenceBoard } from './evidence-board.js';
import { runGiveUp } from './run-give-up.js';
import { runStory } from './run-story.js';

async function activeRun() {
  const context = gameContext();
  await prepareHero(context);
  await installCase(context);
  return context;
}

const STORY = {
  title: 'The goose and the ledger',
  paragraphs: ['It began with a <b>goose</b>.', 'The ledger said otherwise.', 'The hero closed the folder.'],
};

const errorCode = (result: { body: Record<string, unknown> }): unknown =>
  (result.body.error as { code: string }).code;

describe('run_story', () => {
  it('is refused while the run is on, and keeps nothing', async () => {
    const context = await activeRun();

    const result = await call(runStory, STORY, context);

    expect(errorCode(result)).toBe('run-active');
    const runId = await newestRunId(context.saveDir, context.fs);
    expect(await loadStory(context.saveDir, runId, context.fs)).toBeUndefined();
  });

  it('keeps the story of a finished run and shows it as a tab of the board, escaped', async () => {
    const context = await activeRun();
    await call(runGiveUp, { turn: 0 }, context);

    const result = await call(runStory, STORY, context);

    const runId = await newestRunId(context.saveDir, context.fs);
    const path = runBoardFile(context.saveDir, runId);
    expect(result.body).toEqual({ kept: true, board: { path, link: pathToFileURL(path).href } });
    expect((await loadStory(context.saveDir, runId, context.fs))?.title).toBe(STORY.title);
    const page = context.fs.files.get(path) ?? '';
    expect(page).toContain('<a href="#story">Story</a>');
    expect(page).toContain('<h2>The goose and the ledger</h2>');
    expect(page).toContain('It began with a &lt;b&gt;goose&lt;/b&gt;.');
    expect(page).not.toContain('<b>goose</b>');
  });

  it('keeps the tab when the board is written again, and replaces the story when told again', async () => {
    const context = await activeRun();
    await call(runGiveUp, { turn: 0 }, context);
    await call(runStory, STORY, context);
    const runId = await newestRunId(context.saveDir, context.fs);
    const path = runBoardFile(context.saveDir, runId);

    await call(evidenceBoard, {}, context);
    expect(context.fs.files.get(path)).toContain('id="story"');

    await call(runStory, { ...STORY, title: 'A second telling' }, context);
    expect(context.fs.files.get(path)).toContain('<h2>A second telling</h2>');
    expect(context.fs.files.get(path)).not.toContain('The goose and the ledger');
  });

  it('has no story tab on a board that has no story', async () => {
    const context = await activeRun();
    await call(runGiveUp, { turn: 0 }, context);
    await call(evidenceBoard, {}, context);

    const runId = await newestRunId(context.saveDir, context.fs);
    expect(context.fs.files.get(runBoardFile(context.saveDir, runId))).not.toContain('id="story"');
  });

  it('names the part to fix when the story is in the wrong language, and keeps nothing', async () => {
    const context = await activeRun();
    await call(runGiveUp, { turn: 0 }, context);

    const result = await call(
      runStory,
      { title: STORY.title, paragraphs: ['One.', 'Это было ночью, в тишине.', 'Three.'] },
      context,
    );

    expect(errorCode(result)).toBe('story-rejected');
    expect(JSON.stringify(result.body)).toContain('paragraphs/1');
    const runId = await newestRunId(context.saveDir, context.fs);
    expect(await loadStory(context.saveDir, runId, context.fs)).toBeUndefined();
  });

  it('keeps the story even when the board cannot be written', async () => {
    const context = await activeRun();
    await call(runGiveUp, { turn: 0 }, context);
    const runId = await newestRunId(context.saveDir, context.fs);
    const board = runBoardFile(context.saveDir, runId);
    const broken = {
      ...context,
      saveFs: {
        ...context.saveFs,
        mkdir: (directory: string) =>
          directory === dirname(board)
            ? Promise.reject(new Error('EACCES'))
            : context.saveFs.mkdir(directory),
      },
    };

    const result = await call(runStory, STORY, broken);

    expect(result.body).toEqual({ kept: true });
    expect((await loadStory(context.saveDir, runId, context.fs))?.title).toBe(STORY.title);
  });
});
