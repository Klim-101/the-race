// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveSaveDir as savesResolveSaveDir } from '../../packages/saves/src/save-dir.js';
import { DENY_REASON, resolveSaveDir, shouldDeny } from '../../agents/hooks/spoiler-guard.mjs';

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'agents',
  'hooks',
  'spoiler-guard.mjs',
);

const WIN = {
  platform: 'win32',
  home: 'C:\\Users\\ann',
  env: { LOCALAPPDATA: 'C:\\Users\\ann\\AppData\\Local' },
  cwd: 'C:\\Work\\game',
};
const MAC = { platform: 'darwin', home: '/Users/ann', env: {}, cwd: '/Users/ann/game' };
const LINUX = { platform: 'linux', home: '/home/ann', env: {}, cwd: '/home/ann/game' };

const SAVE = {
  win: 'C:\\Users\\ann\\AppData\\Local\\the-race',
  mac: '/Users/ann/Library/Application Support/the-race',
  linux: '/home/ann/.local/state/the-race',
};

const call = (tool_name, tool_input, extra = {}) => ({ tool_name, tool_input, ...extra });
const denied = (input, options) => shouldDeny(input, options);

// The hook cannot import the saves package, so it carries its own copy of the rules; this keeps the copy
// honest by comparing it with `resolveSaveDir` from packages/saves over a table of environments.
describe('resolveSaveDir agrees with packages/saves', () => {
  it.each([
    ['RACE_HOME wins', { platform: 'linux', home: '/h', env: { RACE_HOME: '/data/race' } }, '/data/race'],
    [
      'an empty RACE_HOME is ignored',
      { platform: 'linux', home: '/h', env: { RACE_HOME: '' } },
      '/h/.local/state/the-race',
    ],
    [
      'windows LOCALAPPDATA',
      { platform: 'win32', home: 'C:\\Users\\a', env: { LOCALAPPDATA: 'D:\\Local' } },
      'D:\\Local\\the-race',
    ],
    [
      'windows fallback',
      { platform: 'win32', home: 'C:\\Users\\a', env: {} },
      'C:\\Users\\a\\AppData\\Local\\the-race',
    ],
    [
      'windows LOCALAPPDATA is taken as it is',
      { platform: 'win32', home: 'C:\\Users\\a', env: { LOCALAPPDATA: 'rel' } },
      'rel\\the-race',
    ],
    [
      'macOS',
      { platform: 'darwin', home: '/Users/a', env: {} },
      '/Users/a/Library/Application Support/the-race',
    ],
    [
      'XDG_STATE_HOME when absolute',
      { platform: 'linux', home: '/h', env: { XDG_STATE_HOME: '/x/state' } },
      '/x/state/the-race',
    ],
    [
      'XDG_STATE_HOME when relative',
      { platform: 'linux', home: '/h', env: { XDG_STATE_HOME: 'state' } },
      '/h/.local/state/the-race',
    ],
    ['linux default', { platform: 'linux', home: '/h', env: {} }, '/h/.local/state/the-race'],
  ])('%s', (_name, input, expected) => {
    expect(resolveSaveDir(input)).toBe(expected);
    // `resolve` only makes a RACE_HOME absolute, which the saves package does and the hook leaves to its cwd.
    const { home, ...rest } = input;
    expect(resolve(resolveSaveDir(input))).toBe(resolve(savesResolveSaveDir({ ...rest, homedir: home })));
  });
});

describe('allowed', () => {
  it.each([
    ['Read of a project file', call('Read', { file_path: 'C:\\Work\\game\\src\\index.ts' }), WIN],
    ['Read of a project file (posix)', call('Read', { file_path: '/home/ann/game/README.md' }), LINUX],
    [
      'Read of the repository folder named the-race',
      call('Read', { file_path: '/home/ann/the-race/README.md' }),
      LINUX,
    ],
    [
      'Read of the skill reference',
      call('Read', {
        file_path: '/home/ann/.claude/plugins/the-race/skills/play-the-race/reference/tone.md',
      }),
      LINUX,
    ],
    // The evidence board is written to the player's Documents, outside the closed directory (see
    // resolveBoardDir in packages/saves); the page holds only what run_view shows.
    [
      'Read of the evidence board (win)',
      call('Read', { file_path: 'C:\\Users\\ann\\Documents\\the-race\\evidence.html' }),
      WIN,
    ],
    [
      'Read of the evidence board (mac)',
      call('Read', { file_path: '/Users/ann/Documents/the-race/evidence.html' }),
      MAC,
    ],
    [
      'Read of the evidence board (linux)',
      call('Read', { file_path: '/home/ann/Documents/the-race/evidence.html' }),
      LINUX,
    ],
    [
      'Read of the evidence board in a folder RACE_BOARD_DIR names',
      call('Read', { file_path: '/data/boards/evidence.html' }),
      { ...LINUX, env: { RACE_BOARD_DIR: '/data/boards' } },
    ],
    ['Grep for unrelated text', call('Grep', { pattern: 'the-race', path: 'src' }), LINUX],
    ['Glob inside the project', call('Glob', { pattern: '**/*.ts' }), LINUX],
    [
      'Glob without recursion at the home folder',
      call('Glob', { pattern: '*.md', path: '/home/ann' }),
      LINUX,
    ],
    ['Bash in the project', call('Bash', { command: 'npm test && git status' }), LINUX],
    ['Bash listing the parent of the saves', call('Bash', { command: 'ls ~/.local/state' }), LINUX],
    // A recursive tool counts when it is run, not when its name stands in prose or in a file being written.
    [
      'Bash writing a hooks module under a mods folder, with prose about a tree and a dir in it',
      call('Bash', {
        command:
          "cat > ~/.claude/dev-mods/abc/race-hud/hooks/hud-model.ts <<'EOF'\n// Find the dir / the tree of places.\nfind the nearest dir / x\nEOF",
      }),
      LINUX,
    ],
    [
      'Bash with a recursive word in an echoed sentence',
      call('Bash', { command: 'echo "find the place . / x"' }),
      LINUX,
    ],
    [
      'Bash running a script that mentions a tree in a comment',
      call('Bash', { command: "node - <<'EOF'\n// the whole tree / the dir\nconsole.log(1)\nEOF" }),
      LINUX,
    ],
    [
      'PowerShell writing a file from a here-string with prose in it',
      call('PowerShell', { command: "Set-Content -Path x.md -Value @'\nfind the dir / x\n'@" }),
      WIN,
    ],
    [
      'Bash listing a mods folder',
      call('Bash', { command: 'ls ~/.claude/dev-mods/abc/race-hud/hooks' }),
      LINUX,
    ],
    ['PowerShell listing the parent', call('Bash', { command: 'Get-ChildItem $env:LOCALAPPDATA' }), WIN],
    [
      'Write of a doc that mentions the folder',
      call('Write', {
        file_path: '/home/ann/game/notes.md',
        content: 'saves live in ~/.local/state/the-race/run',
      }),
      LINUX,
    ],
    [
      'Edit of a project file',
      call('Edit', { file_path: 'src/a.ts', old_string: 'a', new_string: 'b' }),
      LINUX,
    ],
    ['the game tool', call('mcp__plugin_the-race_the-race__run_view', {}), LINUX],
    ['another MCP tool', call('mcp__other__search', { query: 'weather', limit: 3 }), LINUX],
    ['a tool without input', call('TodoWrite', undefined), LINUX],
    [
      'a sibling folder with a similar name',
      call('Read', { file_path: '/home/ann/.local/state/the-race-notes/a.json' }),
      LINUX,
    ],
  ])('%s', (_name, input, options) => {
    expect(denied(input, options)).toBe(false);
  });
});

describe('denied', () => {
  it.each([
    ['Read of state.json (win)', call('Read', { file_path: `${SAVE.win}\\run\\state.json` }), WIN],
    [
      'Read with forward slashes and other case (win)',
      call('Read', { file_path: 'c:/users/ANN/appdata/local/THE-RACE/run/state.json' }),
      WIN,
    ],
    ['Read of state.json (mac)', call('Read', { file_path: `${SAVE.mac}/run/state.json` }), MAC],
    ['Read of state.json (linux)', call('Read', { file_path: `${SAVE.linux}/run/state.json` }), LINUX],
    ['Read of pending.json', call('Read', { file_path: `${SAVE.linux}/pending.json` }), LINUX],
    ['Read of pending/state.json', call('Read', { file_path: `${SAVE.linux}/pending/state.json` }), LINUX],
    [
      'Bash cat of a pending record under another home',
      call('Bash', { command: 'cat /home/other/.local/state/the-race/pending/state.json' }),
      LINUX,
    ],
    ['Read of the folder itself', call('Read', { file_path: SAVE.linux }), LINUX],
    [
      'Read of the board in its old place inside the saves',
      call('Read', { file_path: `${SAVE.linux}/board/evidence.html` }),
      LINUX,
    ],
    [
      'Read with RACE_HOME set',
      call('Read', { file_path: '/data/race/run/log.json' }),
      { ...LINUX, env: { RACE_HOME: '/data/race' } },
    ],
    [
      'Read of the legacy folder in the project',
      call('Read', { file_path: '/home/ann/game/.race/run/state.json' }),
      LINUX,
    ],
    [
      'Read by a relative path',
      call('Read', { file_path: '../../.local/state/the-race/run/state.json' }),
      LINUX,
    ],
    [
      'Read by a path with .. traversal',
      call('Read', { file_path: '/home/ann/game/src/../../.local/state/the-race/run/state.json' }),
      LINUX,
    ],
    [
      'Read relative to a RACE_HOME inside the project',
      call('Read', { file_path: 'saves/run/state.json' }),
      { ...LINUX, env: { RACE_HOME: 'saves' } },
    ],
    ['Read of a notebook', call('Read', { notebook_path: `${SAVE.linux}/run/state.json` }), LINUX],
    ['Grep with the folder as path', call('Grep', { pattern: 'culprit', path: SAVE.linux }), LINUX],
    [
      'Grep in the parent of the saves',
      call('Grep', { pattern: 'culprit', path: '/home/ann/.local/state' }),
      LINUX,
    ],
    [
      'Grep with no path from a working directory above the saves',
      call('Grep', { pattern: 'culprit' }),
      { ...LINUX, cwd: '/home/ann' },
    ],
    ['Glob of the folder', call('Glob', { pattern: '*.json', path: SAVE.mac }), MAC],
    [
      'Glob of the parent, recursively',
      call('Glob', { pattern: '**/state.json', path: '/home/ann/.local' }),
      LINUX,
    ],
    ['Glob of a pattern naming the folder', call('Glob', { pattern: `${SAVE.linux}/**` }), LINUX],
    [
      'Edit of a save',
      call('Edit', { file_path: `${SAVE.linux}/run/state.json`, old_string: 'a', new_string: 'b' }),
      LINUX,
    ],
    ['Write of a save', call('Write', { file_path: `${SAVE.win}\\pending.json`, content: '{}' }), WIN],
    ['MultiEdit of a save', call('MultiEdit', { file_path: `${SAVE.linux}/run/log.json`, edits: [] }), LINUX],
    [
      'NotebookEdit of a save',
      call('NotebookEdit', { notebook_path: `${SAVE.linux}/run/state.json`, new_source: 'x' }),
      LINUX,
    ],
    [
      'MultiEdit with the path inside an edit',
      call('MultiEdit', { edits: [{ file_path: `${SAVE.linux}/pending.json` }] }),
      LINUX,
    ],
    ['Bash cat', call('Bash', { command: `cat ${SAVE.linux}/run/state.json` }), LINUX],
    [
      'Bash cat with $HOME',
      call('Bash', { command: 'cat $HOME/.local/state/the-race/run/state.json' }),
      LINUX,
    ],
    [
      'Bash cat with ${HOME}',
      call('Bash', { command: 'cat "${HOME}/.local/state/the-race/pending.json"' }),
      LINUX,
    ],
    ['Bash cat with ~', call('Bash', { command: 'cat ~/.local/state/the-race/run/state.json' }), LINUX],
    [
      'Bash cat with XDG_STATE_HOME',
      call('Bash', { command: 'cat $XDG_STATE_HOME/the-race/run/log.json' }),
      LINUX,
    ],
    [
      'Bash cat on macOS',
      call('Bash', { command: 'cat ~/Library/Application\\ Support/the-race/run/state.json' }),
      MAC,
    ],
    ['Bash type', call('Bash', { command: `type ${SAVE.win}\\run\\state.json` }), WIN],
    [
      'Bash type with %LOCALAPPDATA%',
      call('Bash', { command: 'type %LOCALAPPDATA%\\the-race\\run\\state.json' }),
      WIN,
    ],
    [
      'Bash Get-Content with $env:LOCALAPPDATA',
      call('Bash', { command: 'Get-Content $env:LOCALAPPDATA\\the-race\\pending.json' }),
      WIN,
    ],
    [
      'PowerShell tool Get-Content',
      call('PowerShell', { command: 'gc "$env:LOCALAPPDATA/the-race/run/state.json"' }),
      WIN,
    ],
    ['Bash ls of the folder', call('Bash', { command: `ls -la ${SAVE.linux}` }), LINUX],
    ['Bash find of the parent', call('Bash', { command: 'find ~/.local -name state.json' }), LINUX],
    ['Bash grep -r of the parent', call('Bash', { command: 'grep -r culprit ~/.local/state' }), LINUX],
    ['Bash ls -R of the parent', call('Bash', { command: 'ls -R /home/ann/.local' }), LINUX],
    // Still denied when it is run, whatever stands before it.
    ['Bash find of the root', call('Bash', { command: 'find / -name state.json' }), LINUX],
    ['Bash sudo find of the home', call('Bash', { command: 'sudo find ~ -name state.json' }), LINUX],
    ['Bash find after a pipe', call('Bash', { command: 'echo x | xargs grep -r culprit /home' }), LINUX],
    ['Bash find after cd and &&', call('Bash', { command: 'cd /home/ann && find . -name run' }), LINUX],
    ['Bash find inside sh -c', call('Bash', { command: 'sh -c "find / -name state.json"' }), LINUX],
    [
      'Bash find in a script handed to an interpreter',
      call('Bash', { command: "bash <<'EOF'\nls\nfind / -name state.json\nEOF" }),
      LINUX,
    ],
    [
      'PowerShell Get-ChildItem -Recurse of the root after a pipe',
      call('PowerShell', { command: 'echo x; Get-ChildItem -Recurse C:\\' }),
      WIN,
    ],
    [
      'Bash Get-ChildItem -Recurse of the parent',
      call('Bash', { command: 'Get-ChildItem -Recurse $env:LOCALAPPDATA' }),
      WIN,
    ],
    [
      'Bash with RACE_HOME',
      call('Bash', { command: 'cat $RACE_HOME/run/state.json' }),
      { ...LINUX, env: { RACE_HOME: '/data/race' } },
    ],
    [
      'Bash with a relative path',
      call('Bash', { command: 'cat ../../.local/state/the-race/run/state.json' }),
      LINUX,
    ],
    [
      'Bash with .. traversal',
      call('Bash', { command: 'cat /tmp/../home/ann/.local/state/the-race/run/state.json' }),
      LINUX,
    ],
    ['Bash after cd', call('Bash', { command: 'cd ~/.local/state/the-race && cat run/state.json' }), LINUX],
    [
      'Bash with a relative file after a cd elsewhere',
      call('Bash', { command: 'cd /x; cat run/state.json' }),
      LINUX,
    ],
    [
      'Bash with quotes in the name',
      call('Bash', { command: "cat ~/.local/state/'the-race'/run/state.json" }),
      LINUX,
    ],
    [
      'Bash for another home folder',
      call('Bash', { command: 'cat /home/bob/.local/state/the-race/run/state.json' }),
      LINUX,
    ],
    [
      'an MCP tool naming the folder in a nested field',
      call('mcp__fs__read', { args: { target: [`${SAVE.linux}/run/state.json`] } }),
      LINUX,
    ],
    [
      'an MCP tool naming the folder with a variable',
      call('mcp__fs__read', { target: '$HOME/.local/state/the-race/pending.json' }),
      LINUX,
    ],
    [
      'a relative cwd from the hook input',
      call('Read', { file_path: 'run/state.json' }, { cwd: SAVE.linux }),
      LINUX,
    ],
  ])('%s', (_name, input, options) => {
    expect(denied(input, options)).toBe(true);
  });
});

describe('the guard as a process', () => {
  const run = (stdin) =>
    spawnSync(process.execPath, [SCRIPT], {
      input: stdin,
      encoding: 'utf8',
      env: { ...process.env, RACE_HOME: '' },
    });

  it('denies with JSON on stdout, a short fixed reason and exit 0', () => {
    const secret = '{"culprit":"mara-voss"}';
    const result = run(
      JSON.stringify({
        tool_name: 'Read',
        cwd: process.cwd(),
        tool_input: { file_path: '/x/.race/run/state.json', note: secret },
      }),
    );
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput).toEqual({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: DENY_REASON,
    });
    expect(DENY_REASON.length).toBeLessThan(120);
    expect(DENY_REASON).toMatch(/game tools/);
    expect(result.stdout + result.stderr).not.toContain('mara-voss');
    expect(result.stdout + result.stderr).not.toContain('state.json');
  });

  it('allows silently', () => {
    const result = run(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'README.md' } }));
    expect(result).toMatchObject({ status: 0, stdout: '', stderr: '' });
  });

  it.each([
    ['empty input', ''],
    ['not JSON', 'not json'],
    ['a JSON null', 'null'],
    ['a JSON number', '7'],
    ['a call without input', '{"tool_name":"Read"}'],
    ['a call with input of the wrong type', '{"tool_name":"Read","tool_input":"x"}'],
    ['an unknown shape', '{"tool_name":7,"tool_input":[]}'],
  ])('fails open on %s, silently', (_name, stdin) => {
    expect(run(stdin)).toMatchObject({ status: 0, stdout: '', stderr: '' });
  });
});
