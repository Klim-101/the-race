// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// PostToolUse hook: after every call of a game tool it reminds the narrator, in the language of the run, to
// write the next line in that language. The rule is in the skill, but the short line between a tool result and
// the poll slipped into the language of the tool texts anyway; a reminder that arrives with the result, in the
// language itself, is read when the line is written. It reads only the `locale` the game tool already showed
// the player, and prints fixed text.
//
// It ships inside the plugin, so it imports nothing from this repository. It fails open on input it cannot
// parse: a hook must never break the player's tool calls.
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const REMINDERS = {
  ru: 'Язык забега: русский. Каждую следующую реплику, в том числе короткую строку между результатом инструмента и опросом, и сам опрос пиши по-русски, даже если тексты инструментов и примеры на английском.',
  en: 'The language of the run is English. Write every next line, including the short line between a tool result and the poll, and the poll itself, in English, even if the player writes in another language.',
};

// The result of an MCP tool arrives as text or as parsed content, and the JSON inside may carry escaped quotes.
const LOCALE_FIELD = /\\*"locale\\*"\s*:\s*\\*"(ru|en)\\*"/;

/** The language a game tool answered in, or asked for, when it said one. */
export function localeOfCall(input) {
  const asked = input.tool_input?.locale;
  if (asked === 'ru' || asked === 'en') return asked;
  const answered = LOCALE_FIELD.exec(JSON.stringify(input.tool_response ?? null));
  return answered === null ? undefined : answered[1];
}

/** The reminder for a call of a game tool, or undefined for any other call and for a result with no language. */
export function reminderFor(input) {
  if (typeof input.tool_name !== 'string' || !input.tool_name.startsWith('mcp__plugin_the-race_the-race__')) {
    return undefined;
  }
  const locale = localeOfCall(input);
  return locale === undefined ? undefined : REMINDERS[locale];
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

async function main() {
  try {
    const input = JSON.parse(await readStdin());
    if (input === null || typeof input !== 'object') return;
    const reminder = reminderFor(input);
    if (reminder === undefined) return;
    process.stdout.write(
      `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reminder } })}\n`,
    );
  } catch {
    // Fail open, and say nothing: the input is the player's own run.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
