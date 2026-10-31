// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from 'claude-code/testing';

// The surfaces of the HUD, run under `claude plugin test`: the line above the prompt and the pane, on every
// surface that draws them, in both languages, driven by the answers of the game's own tools.

const TOOLS = 'mcp__plugin_the-race_the-race__';
const PLUGIN = 'the-race';

const MAP = {
  current: 'lobby',
  places: [
    { id: 'lobby', name: 'Lobby', visited: true, blocked: null },
    { id: 'archive', name: 'Archive', visited: false, blocked: null },
    { id: 'office', name: 'Office', visited: false, blocked: 'locked' },
    { id: 'chapel', name: 'Chapel', visited: false, blocked: 'closed' },
  ],
  links: [
    { from: 'lobby', to: 'archive' },
    { from: 'lobby', to: 'office' },
    { from: 'archive', to: 'chapel' },
  ],
};
const VIEW = {
  status: 'active',
  title: 'The Goose',
  locale: 'en',
  turn: 3,
  clock: { day: 2, minute: 14 * 60 + 20, totalDays: 7 },
  clues: [{}, {}],
  map: MAP,
};

const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const;

const PANE = {
  plugin: PLUGIN,
  component: 'Pane',
  requestId: PLUGIN,
  props: {
    title: 'the RACE',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const;

type Reply =
  { result: object; text: string } | { result: string; isError: true; text: string } | { deny: string };
const answered = (data: unknown): Reply => ({ result: {}, text: JSON.stringify(data) });

test('the line above the prompt follows the game on every surface, in both languages', async ($, on) => {
  let reply: Reply = answered(VIEW);
  on('tool.call', () => reply);

  for (const [locale, words] of [
    ['en', /Day 2\/7 .* 14:20 · Lobby · clues 2/],
    ['ru', /День 2\/7 .* 14:20 · Lobby · улик 2/],
  ] as const) {
    reply = answered({ ...VIEW, locale });
    await $.tool.call({ tool: `${TOOLS}run_view` } as never);

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface });
      expect((await ui.find({ type: 'Text', text: /Day|День/ }))?.text).toMatch(/\d\/7/);
      const line = (await ui.find({ type: 'Box' }))?.text ?? '';
      expect(line).toMatch(words);
      await ui.unmount();
    }
  }
});

test('a turn tool moves the line with its short view and its map, with no run_view between', async ($, on) => {
  let reply: Reply = answered(VIEW);
  on('tool.call', () => reply);
  await $.tool.call({ tool: `${TOOLS}run_view` } as never);

  reply = answered({
    outcome: { kind: 'move' },
    view: {
      status: 'active',
      title: 'The Goose',
      locale: 'en',
      turn: 4,
      clock: { day: 2, minute: 14 * 60 + 35, totalDays: 7 },
      clueCount: 3,
      hiddenTraitCount: 1,
      map: { ...MAP, current: 'archive' },
    },
  });
  await $.tool.call({ tool: `${TOOLS}act` } as never);

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' });
  expect((await ui.find({ type: 'Box' }))?.text).toMatch(/14:35 · Archive · clues 3 · hidden traits 1/);
  await ui.unmount();
});

test('a survey keeps the band, and with no run there is no line', async ($, on) => {
  on('tool.call', () => answered(VIEW));
  // Where the HUD yields, the engine's own drawing stands in beneath it.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>engine</Text>;
  });

  const none = await $.ui.mount({ ...BAND, surface: 'terminal' });
  expect(await none.find({ type: 'Text', text: /Day/ })).toBeUndefined();
  await none.unmount();

  await $.tool.call({ tool: `${TOOLS}run_view` } as never);
  const surveyed = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, hasSurvey: true },
    surface: 'terminal',
  });
  expect(await surveyed.find({ type: 'Text', text: /Day/ })).toBeUndefined();
  await surveyed.unmount();
});

test('the pane draws the known map from the game, marks the hero, and speaks the language of the run', async ($, on) => {
  on('tool.call', () => answered({ ...VIEW, locale: 'ru' }));
  await $.tool.call({ tool: `${TOOLS}run_view` } as never);

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface });

    expect((await ui.find({ type: 'Text', text: /The Goose/ }))?.text).toBe('The Goose');
    expect((await ui.find({ type: 'Text', text: /Lobby/ }))?.text).toContain('◆ Lobby  (вы здесь)');
    expect((await ui.find({ type: 'Text', text: /Archive/ }))?.text).toContain('○ Archive  (не посещено)');
    expect((await ui.find({ type: 'Text', text: /Office/ }))?.text).toContain('✖ Office  (заперто)');
    expect((await ui.find({ type: 'Text', text: /Chapel/ }))?.text).toContain('✖ Chapel  (закрыто)');
    expect((await ui.find({ type: 'Text', text: /скрытых черт/ }))?.text).toMatch(/скрытых черт d+/);
    await ui.unmount();
  }
});

test('the pane says there is no run until there is one', async ($, on) => {
  on('tool.call', () => answered({ status: 'no-run' }));
  await $.tool.call({ tool: `${TOOLS}run_view` } as never);

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  expect((await ui.find({ type: 'Text' }))?.text).toBe('No run yet.');
  await ui.unmount();
});

test('an error, a refusal and an answer that is not a view leave the HUD as it was', async ($, on) => {
  let reply: Reply = answered(VIEW);
  on('tool.call', () => reply);
  await $.tool.call({ tool: `${TOOLS}run_view` } as never);

  for (const next of [
    { result: 'stale-turn', isError: true, text: '{"error":{"code":"stale-turn"}}' },
    { deny: 'Refused.' },
    { result: {}, text: 'The save is damaged.' },
    answered({ status: 'active' }),
  ] as Reply[]) {
    reply = next;
    await $.tool.call({ tool: `${TOOLS}act` } as never);

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' });
    expect((await ui.find({ type: 'Box' }))?.text).toMatch(/Day 2\/7 .* 14:20 · Lobby · clues 2/);
    await ui.unmount();
  }
});

test('a tool of another server is not the game: it changes nothing', async ($, on) => {
  let reply: Reply = answered(VIEW);
  on('tool.call', () => reply);
  await $.tool.call({ tool: `${TOOLS}run_view` } as never);

  reply = answered({ ...VIEW, clock: { day: 6, minute: 0, totalDays: 7 } });
  await $.tool.call({ tool: 'mcp__other__run_view' } as never);

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' });
  expect((await ui.find({ type: 'Box' }))?.text).toContain('Day 2/7');
  await ui.unmount();
});

test('a new run, a given-up run and a verdict close the HUD, and a new case starts with an empty map', async ($, on) => {
  let reply: Reply = answered(VIEW);
  on('tool.call', () => reply);
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>engine</Text>;
  });

  const closing = [
    ['run_new', { status: 'awaiting-hero', locale: 'en' }],
    ['run_give_up', { view: { ...VIEW, status: 'gave-up' } }],
    ['accuse', { outcome: { kind: 'accuse' }, view: { ...VIEW, status: 'won' } }],
    ['accuse', { outcome: { kind: 'accuse' }, view: { ...VIEW, status: 'lost' } }],
  ] as const;
  for (const [tool, data] of closing) {
    reply = answered(VIEW);
    await $.tool.call({ tool: `${TOOLS}run_view` } as never);
    reply = answered(data);
    await $.tool.call({ tool: `${TOOLS}${tool}` } as never);

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' });
    expect(await ui.find({ type: 'Text', text: /Day/ }), tool).toBeUndefined();
    await ui.unmount();
  }

  // The next case has its own map: nothing of the old one is left in the pane.
  reply = answered({
    ...VIEW,
    title: 'The Next',
    map: { current: 'hall', places: [{ id: 'hall', name: 'Hall', visited: true, blocked: null }], links: [] },
  });
  await $.tool.call({ tool: `${TOOLS}run_view` } as never);
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' });
  expect((await pane.find({ type: 'Text', text: /Hall/ }))?.text).toContain('◆ Hall');
  expect(await pane.find({ type: 'Text', text: /Archive|Office|Chapel/ })).toBeUndefined();
  await pane.unmount();
});

test('the command opens the pane and answers in the language of the last run', async ($, on) => {
  on('command.register', () => ({ value: { command: 'race-hud' } }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  on('session.start', (_, e) => ({ cwd: e.cwd }));
  on('tool.call', () => answered({ ...VIEW, locale: 'ru' }));

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true });
  await $.tool.call({ tool: `${TOOLS}run_view` } as never);

  const result = await $.command.run({ command: 'race-hud', args: '' } as never);
  expect(JSON.stringify(result)).toContain('RACE');
});
