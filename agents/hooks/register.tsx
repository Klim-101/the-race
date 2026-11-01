// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { atom, read, update } from 'claude-code';
import type { Register } from 'claude-code';
import { LABELS, applyResult, clockText, dayBar, localeOf, mapRows, parseResult } from './hud-model';

// The HUD of the RACE: a line above the prompt with the day, the hour, the place and the clues, and a pane
// (/race-hud) with the known map. It listens to the game's own tools, so the narrator passes it nothing and it
// costs no turn, and it reads only what those tools answer, which is the public view of the run.

const PANE = 'the-race';
const TOOLS = 'mcp__plugin_the-race_the-race__';
// Change a tag when the fields of its value change: the engine declines what an earlier version stored.
const hud = atom({ plugin: 'the-race', key: 'hud' } as const, null, { shape: 'hud-2' });
const language = atom({ plugin: 'the-race', key: 'locale' } as const, 'en', { shape: 'locale-1' });

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'race-hud', description: 'Show the map of the RACE in a pane' });
    return next(e);
  });

  on('command.run', { command: 'race-hud' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'the RACE' });
    return { text: LABELS[await read($, language)].open };
  });

  // The answer of a game tool is the public view, so it holds no secret. A refusal, an error or a text that is
  // not a view leaves the HUD as it was; a new run, a given-up run and a verdict close it.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e);
    if (!e.tool.startsWith(TOOLS) || ran.deny !== undefined || ran.isError === true) return ran;
    const data = parseResult(ran.text);
    if (data === undefined) return ran;
    const locale = localeOf(data);
    if (locale !== undefined) await update($, language, () => locale);
    if (e.tool === `${TOOLS}run_new` || e.tool === `${TOOLS}run_give_up`) {
      await update($, hud, () => null);
      return ran;
    }
    await update($, hud, (current) => applyResult(current, data));
    return ran;
  });

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, hud);
    if (state === null || e.props.hasSurvey) return next(e);
    const { Box, Text } = $.ui.resolve(e);
    const text = LABELS[state.locale];
    const place = state.places.find(({ id }) => id === state.locationId)?.name ?? '';
    return (
      <Box>
        <Text color="yellow">
          {text.day} {state.day}/{state.totalDays} {dayBar(state)} {clockText(state)}
        </Text>
        <Text> · {place}</Text>
        <Text dimColor>
          {' '}
          · {text.clues} {state.clueCount} · {text.hiddenTraits} {state.hiddenTraits}
        </Text>
        <Text
          color={state.composure === 'steady' ? undefined : 'yellow'}
          dimColor={state.composure === 'steady'}
        >
          {' '}
          · {text.nerves[state.composure]}
        </Text>
      </Box>
    );
  });

  // What a game tool answers is JSON for the narrator, not something for the player to read: the story, the
  // poll and the board are what the player is given. Its row in the transcript keeps its name but draws no
  // result, except when the call failed (the error is worth reading) and in the full view (ctrl+o, --verbose),
  // so nothing is lost to anyone who wants it.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const { tool, isErrored, isExpanded } = e.props;
    if (!tool.startsWith(TOOLS) || isErrored || isExpanded === true) return next(e);
    const { Box } = $.ui.resolve(e);
    return <Box />;
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const state = await read($, hud);
    const { Box, Text } = $.ui.resolve(e);
    if (state === null) return <Text dimColor>{LABELS[await read($, language)].none}</Text>;
    const text = LABELS[state.locale];
    return (
      <Box flexDirection="column">
        <Text weight="bold">{state.title}</Text>
        <Text color="yellow">
          {text.day} {state.day}/{state.totalDays} {dayBar(state)} {clockText(state)}
        </Text>
        <Text dimColor>
          {text.clues} {state.clueCount} · {text.hiddenTraits} {state.hiddenTraits}
        </Text>
        <Text dimColor>{text.nerves[state.composure]}</Text>
        <Text> </Text>
        <Text dimColor>{text.map}</Text>
        {mapRows(state).map(({ prefix, place, here }) => {
          const mark = here ? '◆' : place.blocked !== null ? '✖' : place.visited ? '●' : '○';
          const note = here
            ? text.here
            : place.blocked !== null
              ? text[place.blocked]
              : place.visited
                ? ''
                : text.unvisited;
          return (
            <Text
              color={here ? 'green' : place.blocked !== null ? 'red' : undefined}
              dimColor={!here && !place.visited}
            >
              {prefix}
              {mark} {place.name}
              {note === '' ? '' : `  (${note})`}
            </Text>
          );
        })}
      </Box>
    );
  });
};
