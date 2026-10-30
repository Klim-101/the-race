// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// PreToolUse hook: keeps the narrator out of the game's save directory, which holds the sealed truth in
// plain JSON. It ships inside the plugin, so it imports nothing from this repository: the directory is
// resolved here with the same rules as `resolveSaveDir` in packages/saves, and a test keeps the two in step.
//
// It is a guard against an accidental spoiler from the narrator, not a defence against the player (see
// docs/adr/0006). It errs towards denying a doubtful shell command, fails open on input it cannot parse, and
// never prints anything it read: the reason it gives is fixed text.
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const DENY_REASON =
  "The game's saves are off limits. Use the game tools (mcp__the-race__*) instead of files.";

// Tools that change a file: only the path they name matters, not the text they write.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const PATH_FIELDS = new Set(['file_path', 'notebook_path', 'path']);

/** The per-user directory holding the saves; the same rules as `resolveSaveDir` in packages/saves. */
export function resolveSaveDir({ env, platform, home }) {
  if (env.RACE_HOME) return env.RACE_HOME;
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA;
    const base = local ? local : path.win32.join(home, 'AppData', 'Local');
    return path.win32.join(base, 'the-race');
  }
  if (platform === 'darwin') return path.posix.join(home, 'Library', 'Application Support', 'the-race');
  const state = env.XDG_STATE_HOME;
  const base = state && path.posix.isAbsolute(state) ? state : path.posix.join(home, '.local', 'state');
  return path.posix.join(base, 'the-race');
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
const SAVE_FILE = /(^|[/\s])(pending(\/state)?\.json|run\/(state|log)(\.prev)?\.json)(?=$|[\s"'`;&|)])/;
// The save directory spelled out for another home or another shell than the one resolved here.
const SAVE_SHAPE =
  /(^|[/\s])(state|local|application support)\/the-race(\/|$|[\s"'`;&|)])|(^|[/\s])the-race\/(run(\/|$|[\s"'`;&|)])|pending(\/|\.json))|(^|[/\s])\.race(\/|$|[\s"'`;&|)])/;
// A command that walks into every folder under a path it is given.
const RECURSIVE = [
  /\b(find|rg|tree|ag|ack|du)\b/i,
  /\b(grep|egrep|fgrep)\b[^;&|\n]*(\s-[a-zA-Z]*[rR]|--recursive)/,
  /\bls\b[^;&|\n]*\s-[a-zA-Z]*R/,
  /\b(Get-ChildItem|gci|dir|ls)\b[^;&|\n]*\s-(r|rec|recurse)\b/i,
  /\bdir\b[^;&|\n]*\s\/s\b/i,
  /\b(Select-String|sls)\b/i,
];

function touchesSaves(text, context, { walks }) {
  const { directory, pathApi, cwd } = context;
  for (const variant of variants(text, context)) {
    const flat = key(variant);
    if (mentions(flat, directory) || SAVE_SHAPE.test(flat) || SAVE_FILE.test(flat)) return true;
    for (const candidate of candidates(variant)) {
      const resolved = key(pathApi.resolve(cwd, candidate));
      if (isInside(resolved, directory)) return true;
      if (walks && isAncestor(resolved, directory)) return true;
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
  const directory = key(pathApi.resolve(cwd, resolveSaveDir({ env, platform, home })));
  const context = { env, platform, home, cwd, directory, pathApi };

  const toolName = typeof input.tool_name === 'string' ? input.tool_name : '';
  const toolInput = input.tool_input;
  if (toolInput === null || typeof toolInput !== 'object') return false;

  if (EDIT_TOOLS.has(toolName)) {
    return pathStrings(toolInput).some((text) => touchesSaves(text, context, { walks: false }));
  }
  // A shell command that recurses over a parent of the saves reaches them without naming them.
  const recursiveCommand = toolName === 'Bash' || toolName === 'PowerShell';
  const wholeText = strings(toolInput);
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
    return deep && isAncestor(root, directory);
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
