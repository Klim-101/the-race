// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REMINDERS, localeOfCall, reminderFor } from '../../agents/hooks/language-reminder.mjs';

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'agents',
  'hooks',
  'language-reminder.mjs',
);
const TOOL = 'mcp__plugin_the-race_the-race__act';

const run = (stdin) => spawnSync(process.execPath, [SCRIPT], { input: stdin, encoding: 'utf8' });

describe('the language reminder', () => {
  it('names the language of the run, in that language, after a turn', () => {
    const response = { structuredContent: { view: { locale: 'ru', turn: 3 } } };

    expect(reminderFor({ tool_name: TOOL, tool_response: response })).toBe(REMINDERS.ru);
    expect(REMINDERS.ru).toMatch(/по-русски/);
    expect(REMINDERS.en).toMatch(/English/);
  });

  it('reads the language from the text of a result, with the quotes escaped or not', () => {
    const text = (body) => ({ content: [{ type: 'text', text: JSON.stringify(body) }] });

    expect(localeOfCall({ tool_response: text({ view: { locale: 'en' } }) })).toBe('en');
    expect(localeOfCall({ tool_response: '{"locale": "ru"}' })).toBe('ru');
  });

  it('takes the language a run was asked for', () => {
    expect(localeOfCall({ tool_input: { locale: 'ru' }, tool_response: {} })).toBe('ru');
    expect(localeOfCall({ tool_input: { locale: 'de' }, tool_response: { locale: 'en' } })).toBe('en');
  });

  it('says nothing for a result with no language, and for a tool that is not the game', () => {
    expect(reminderFor({ tool_name: TOOL, tool_response: { view: { turn: 1 } } })).toBeUndefined();
    expect(reminderFor({ tool_name: TOOL })).toBeUndefined();
    expect(reminderFor({ tool_name: 'Bash', tool_response: { locale: 'ru' } })).toBeUndefined();
    expect(reminderFor({ tool_response: { locale: 'ru' } })).toBeUndefined();
  });

  it('prints the reminder as context of the tool result, and nothing else', () => {
    const result = run(JSON.stringify({ tool_name: TOOL, tool_response: { view: { locale: 'ru' } } }));

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: REMINDERS.ru },
    });
  });

  it('fails open on input it cannot read, and prints nothing', () => {
    for (const stdin of ['', 'not json', 'null', '[]']) {
      const result = run(stdin);

      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
    }
  });
});
