// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// PreToolUse hook: keeps the narrator out of the game's save directory, which holds the sealed truth in
// plain JSON. It ships inside the plugin, so it imports nothing from this repository: the directory is
// resolved here with the same rules as `resolveSaveDir` in packages/saves, and a test keeps the two in step.
//
// The evidence board is not in this directory: it is written to `board/` in the game folder (or to
// RACE_BOARD_DIR), a folder the player chose, where any browser account can open it. It holds only what the run_view tool shows, so
// the guard leaves it alone, and the narrator is told by the skill never to open it, to spare the turns.
//
// It is a guard against an accidental spoiler from the narrator, not a defence against the player (see
// docs/adr/0006). It errs towards denying a doubtful shell command, fails open on input it cannot parse, and
// never prints anything it read: the reason it gives is fixed text.
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const DENY_REASON =
  "The game's saves are off limits. Use the game tools (mcp__plugin_the-race_the-race__*) instead of files.";

// Tools that change a file: only the path they name matters, not the text they write.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const PATH_FIELDS = new Set(['file_path', 'notebook_path', 'path']);

const APP_DIR = 'the-race';
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/;

/** The folder that holds the saves and the board; the same rules as `resolveGameFolder` in packages/saves. */
export function resolveGameFolder({ env, platform, home }) {
  const chosen = env.RACE_GAME_FOLDER || env.CLAUDE_PLUGIN_OPTION_GAME_FOLDER;
  if (chosen && (platform === 'win32' || !WINDOWS_DRIVE_PATH.test(chosen))) return chosen;
  return platform === 'win32' ? path.win32.join('C:\\', APP_DIR) : path.posix.join(home, APP_DIR);
}

/** Where saves lived before the game had a folder of its own; the same rules as `legacySaveDir`. */
function legacySaveDir({ env, platform, home }) {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA;
    const base = local ? local : path.win32.join(home, 'AppData', 'Local');
    return path.win32.join(base, APP_DIR);
  }
  if (platform === 'darwin') return path.posix.join(home, 'Library', 'Application Support', APP_DIR);
  const state = env.XDG_STATE_HOME;
  const base = state && path.posix.isAbsolute(state) ? state : path.posix.join(home, '.local', 'state');
  return path.posix.join(base, APP_DIR);
}

/**
 * Every directory that may hold the saves: `RACE_HOME` alone when it is set, else `saves/` in the game folder
 * and the legacy directory. The server picks one of them by looking at the disk; the guard does not need to,
 * and keeps both closed.
 */
export function resolveSaveDirs({ env, platform, home }) {
  if (env.RACE_HOME) return [env.RACE_HOME];
  const joined = (platform === 'win32' ? path.win32 : path.posix).join(
    resolveGameFolder({ env, platform, home }),
    'saves',
  );
  return [joined, legacySaveDir({ env, platform, home })];
}

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value !== null && typeof value === 'object')
    for (const item of Object.values(value)) strings(item, out);
  return out;
}

function pathStrings(value, out = []) {
  if (Array.isArray(value)) for (const item of value) pathStrings(item, out);
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (PATH_FIELDS.has(key) && typeof item === 'string') out.push(item);
      else if (typeof item === 'object') pathStrings(item, out);
    }
  }
  return out;
}

/** Slashes forward, repeats collapsed, no trailing slash (except a root), lower case: a comparable key. */
function key(text) {
  const slashed = text.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const trimmed = slashed.length > 3 && slashed.endsWith('/') ? slashed.slice(0, -1) : slashed;
  return trimmed.toLowerCase();
}

// A substring match that does not fire on a sibling such as `the-race-notes`.
function mentions(text, directory) {
  for (let at = text.indexOf(directory); at !== -1; at = text.indexOf(directory, at + 1)) {
    if (!/[a-z0-9._-]/.test(text.charAt(at + directory.length))) return true;
  }
  return false;
}

function isInside(candidate, directory) {
  return candidate === directory || candidate.startsWith(`${directory}/`);
}

function isAncestor(candidate, directory) {
  return directory.startsWith(candidate.endsWith('/') ? candidate : `${candidate}/`);
}

// Expands `~` and the variable forms of the shells a model uses, so `$HOME/.local/state/the-race` is read
// as the path it names. An unknown variable is left alone.
function expand(text, context) {
  const lookup = (name) => {
    const wanted = context.platform === 'win32' ? name.toLowerCase() : name;
    for (const [candidate, value] of Object.entries(context.env)) {
      const have = context.platform === 'win32' ? candidate.toLowerCase() : candidate;
      if (have === wanted && value) return value;
    }
    if (wanted === (context.platform === 'win32' ? 'userprofile' : 'HOME')) return context.home;
    return undefined;
  };
  return text
    .replace(/(^|[\s"'=:(])~(?=[/\\]|$|[\s"'])/g, (_, lead) => `${lead}${context.home}`)
    .replace(
      /\$\{env:(\w+)\}|\$env:(\w+)|\$\{(\w+)\}|\$(\w+)|%(\w+)%/gi,
      (whole, ...groups) => lookup(groups.slice(0, 5).find(Boolean)) ?? whole,
    );
}

// What a shell command or path could be hiding behind: the same text with quoting characters removed.
function variants(text, context) {
  const expanded = expand(text, context);
  return [...new Set([expanded, expanded.replace(/["'`^]/g, '')])];
}

// Candidate paths in a string: the whole text (a path may hold spaces) and each token that looks like one.
function candidates(text) {
  const tokens = text.split(/[\s;&|<>(),=]+/).filter((token) => /[/\\]|^\.{1,2}$/.test(token));
  return [text, ...tokens];
}

// A file that is only ever in the save directory, named so that a relative path after a `cd` still shows.
const SAVE_FILE =
  /(^|[/\s])(pending(\/state)?\.json|runs?\/([^/\s]+\/)?(state|log)(\.prev)?\.json)(?=$|[\s"'`;&|)])/;
// The save directory spelled out for another home or another shell than the one resolved here.
const SAVE_SHAPE =
  /(^|[/\s])(state|local|application support)\/the-race(\/|$|[\s"'`;&|)])|(^|[/\s])the-race\/(saves(\/|$|[\s"'`;&|)])|runs?(\/|$|[\s"'`;&|)])|pending(\/|\.json))|(^|[/\s])\.race(\/|$|[\s"'`;&|)])/;
// A command that walks into every folder under a path it is given. A recursive tool counts when it is run: at
// the start of a simple command, after a prefix such as sudo or xargs, or as the argument of `sh -c`. The same
// word in prose, in a comment or in the text of a file being written is not a command, and treating it as one
// denied the writing of a hooks module under a mods folder.
const COMMAND_START = String.raw`(?:^|[;&|(\n\`{]|\$\(|\b(?:then|do|else|sudo|time|xargs|env|exec|nohup|command)\s+|\s-(?:c|command)\s+["']?)\s*`;
const RECURSIVE = [
  /\b(find|rg|tree|ag|ack|du)\b/i,
  /\b(grep|egrep|fgrep)\b[^;&|\n]*(\s-[a-zA-Z]*[rR]|--recursive)/,
  /\bls\b[^;&|\n]*\s-[a-zA-Z]*R/,
  /\b(Get-ChildItem|gci|dir|ls)\b[^;&|\n]*\s-(r|rec|recurse)\b/i,
  /\bdir\b[^;&|\n]*\s\/s\b/i,
  /\b(Select-String|sls)\b/i,
].map((pattern) => new RegExp(`${COMMAND_START}(?:${pattern.source})`, `${pattern.flags}m`));

// The body of a heredoc that `cat` or `tee` only writes to a file, and of a here-string that is only stored or
// written, is data: what a file will say is not what the command does. A body handed to an interpreter
// (`node - <<EOF`) is code and stays, since its lines are commands too.
function withoutWrittenBodies(text) {
  return text
    .replace(
      /^([ \t]*(?:cat|tee)\b[^\n]*<<-?[ \t]*(['"]?)(\w+)\2[^\n]*)\n[\s\S]*?\n[ \t]*\3[ \t]*(?=\n|$)/gm,
      '$1',
    )
    .replace(/((?:Set-Content|Add-Content|Out-File|\$\w+[ \t]*=)[^\n]*@(['"]))\n[\s\S]*?\n\2@/g, '$1');
}

function touchesSaves(text, context, { walks }) {
  const { directories, pathApi, cwd } = context;
  for (const variant of variants(text, context)) {
    const flat = key(variant);
    if (SAVE_SHAPE.test(flat) || SAVE_FILE.test(flat)) return true;
    if (directories.some((directory) => mentions(flat, directory))) return true;
    for (const candidate of candidates(variant)) {
      const resolved = key(pathApi.resolve(cwd, candidate));
      if (directories.some((directory) => isInside(resolved, directory))) return true;
      if (walks && directories.some((directory) => isAncestor(resolved, directory))) return true;
    }
  }
  return false;
}

/** Decides one hook call. Returns true when the call must be denied. */
export function shouldDeny(input, options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const cwd =
    typeof input.cwd === 'string' && pathApi.isAbsolute(input.cwd)
      ? input.cwd
      : (options.cwd ?? process.cwd());
  const directories = resolveSaveDirs({ env, platform, home }).map((dir) => key(pathApi.resolve(cwd, dir)));
  const context = { env, platform, home, cwd, directories, pathApi };

  const toolName = typeof input.tool_name === 'string' ? input.tool_name : '';
  const toolInput = input.tool_input;
  if (toolInput === null || typeof toolInput !== 'object') return false;

  if (EDIT_TOOLS.has(toolName)) {
    return pathStrings(toolInput).some((text) => touchesSaves(text, context, { walks: false }));
  }
  // A shell command that recurses over a parent of the saves reaches them without naming them.
  const recursiveCommand = toolName === 'Bash' || toolName === 'PowerShell';
  const wholeText = strings(toolInput).map((text) => (recursiveCommand ? withoutWrittenBodies(text) : text));
  if (
    wholeText.some((text) =>
      touchesSaves(text, context, { walks: recursiveCommand && RECURSIVE.some((re) => re.test(text)) }),
    )
  ) {
    return true;
  }
  // Grep and Glob search under a path, or under the working directory when none is given.
  if (toolName === 'Grep' || toolName === 'Glob') {
    const root = key(
      pathApi.resolve(cwd, typeof toolInput.path === 'string' ? expand(toolInput.path, context) : '.'),
    );
    const deep = toolName === 'Grep' || /\*\*/.test(String(toolInput.pattern ?? ''));
    return deep && directories.some((directory) => isAncestor(root, directory));
  }
  return false;
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
    if (input === null || typeof input !== 'object' || !shouldDeny(input)) return;
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: DENY_REASON,
        },
      })}\n`,
    );
  } catch {
    // Fail open: a hook that cannot read its input must not break the player's tool calls. Nothing is logged,
    // because the input may hold the very text the hook exists to keep out of the transcript.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
