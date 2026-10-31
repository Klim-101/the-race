// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MCP_SERVER_NAME } from './plugin-generator.mjs';

const AGENTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'agents');
// Claude Code names the tools of a plugin's MCP server mcp__plugin_<plugin>_<server>__<tool>. A tool named
// any other way matches nothing, and a subagent that lists only such tools is refused with zero tools.
const PLUGIN_NAME = JSON.parse(readFileSync(join(AGENTS, 'plugin.json'), 'utf8')).name;
const PREFIX = `mcp__plugin_${PLUGIN_NAME}_${MCP_SERVER_NAME}__`;

// The tool surface the agent layer may name; the MCP server implements it.
const NARRATOR_TOOLS = [
  'run_new',
  'hero_create',
  'run_view',
  'act',
  'question',
  'deduce',
  'accuse',
  'run_give_up',
  'evidence_board',
];
const GENERATOR_TOOLS = ['generator_brief', 'scenario_submit'];
const EXTRACTOR_TOOLS = ['news_brief', 'seeds_submit'];
const NON_MCP_TOOLS_OF_NARRATOR = ['Agent', 'AskUserQuestion'];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function read(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

/** A small frontmatter reader: `key: value` lines between two `---` lines. */
function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split('\n')) {
    const pair = /^([a-z-]+):\s*(.+)$/.exec(line);
    if (!pair) return null;
    data[pair[1]] = pair[2].trim();
  }
  return { data, body: match[2] };
}

const files = walk(AGENTS);
const markdown = files.filter((path) => path.endsWith('.md'));
const skillFiles = files.filter((path) => /[\\/]skills[\\/][^\\/]+[\\/]SKILL\.md$/.test(path));
const subagentFiles = files.filter((path) => /[\\/]subagents[\\/][^\\/]+\.md$/.test(path));
const commandFiles = files.filter((path) => /[\\/]commands[\\/][^\\/]+\.md$/.test(path));
const narratorPath = join(AGENTS, 'skills', 'play-the-race', 'SKILL.md');
const generatorPath = join(AGENTS, 'subagents', 'case-generator.md');
const extractorPath = join(AGENTS, 'subagents', 'seed-extractor.md');

const toolsMentioned = (text) => [...text.matchAll(/mcp__[a-z0-9-]+__[a-z_]+/g)].map(([tool]) => tool);
const name = (path) => relative(AGENTS, path).replaceAll('\\', '/');

describe('frontmatter', () => {
  it('finds the canonical files', () => {
    expect(skillFiles.length).toBeGreaterThan(0);
    expect(subagentFiles.length).toBeGreaterThan(0);
    expect(commandFiles.length).toBeGreaterThan(0);
  });

  it.each(skillFiles)('skill %s has a name that matches its folder and a description', (path) => {
    const parsed = parseFrontmatter(read(path));
    expect(parsed).not.toBeNull();
    expect(parsed.data.name).toBe(path.split(/[\\/]/).at(-2));
    expect(parsed.data.name).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(parsed.data.description.length).toBeGreaterThan(40);
    expect(parsed.body.trim().length).toBeGreaterThan(0);
  });

  it.each(subagentFiles)('subagent %s has a name, a description and an explicit tool allow-list', (path) => {
    const parsed = parseFrontmatter(read(path));
    expect(parsed).not.toBeNull();
    expect(parsed.data.name).toBe(path.split(/[\\/]/).at(-1).replace(/\.md$/, ''));
    expect(parsed.data.description.length).toBeGreaterThan(20);
    expect(parsed.data.tools).toBeTruthy();
    expect(parsed.body.trim().length).toBeGreaterThan(0);
  });

  it.each(commandFiles)('command %s has a description', (path) => {
    const parsed = parseFrontmatter(read(path));
    expect(parsed).not.toBeNull();
    expect(parsed.data.description.length).toBeGreaterThan(5);
  });

  it('plugin.json carries the canonical metadata', () => {
    const plugin = JSON.parse(read(join(AGENTS, 'plugin.json')));
    expect(plugin).toMatchObject({ name: 'the-race', version: '0.0.0', license: 'Apache-2.0' });
    expect(plugin.description).toBeTruthy();
    expect(plugin.author.name).toBeTruthy();
    expect(plugin.keywords.length).toBeGreaterThan(0);
  });
});

describe('tools', () => {
  const allowedForNarrator = new Set(NARRATOR_TOOLS.map((tool) => PREFIX + tool));

  it.each([narratorPath, ...commandFiles])('%s mentions no tool outside the narrator contract', (path) => {
    const mentioned = toolsMentioned(read(path));
    for (const tool of mentioned) expect(allowedForNarrator.has(tool), `${name(path)}: ${tool}`).toBe(true);
    expect(read(path)).not.toMatch(/generator_brief|scenario_submit|news_brief|seeds_submit/);
  });

  it('the narrator pre-approves only contract tools, the subagent launcher and the poll', () => {
    const { data } = parseFrontmatter(read(narratorPath));
    const listed = data['allowed-tools'].split(/[,\s]+/).filter(Boolean);
    for (const tool of listed) {
      expect(allowedForNarrator.has(tool) || NON_MCP_TOOLS_OF_NARRATOR.includes(tool), tool).toBe(true);
    }
    expect(listed).not.toEqual(expect.arrayContaining(['Read']));
  });

  it('the case generator may use exactly the two generator tools', () => {
    const { data } = parseFrontmatter(read(generatorPath));
    const listed = data.tools.split(',').map((tool) => tool.trim());
    expect(listed.toSorted()).toEqual(GENERATOR_TOOLS.map((tool) => PREFIX + tool).toSorted());
  });

  it('the seed extractor may use exactly the two extractor tools', () => {
    const { data } = parseFrontmatter(read(extractorPath));
    const listed = data.tools.split(',').map((tool) => tool.trim());
    expect(listed.toSorted()).toEqual(EXTRACTOR_TOOLS.map((tool) => PREFIX + tool).toSorted());
  });

  it('the seed extractor is told to answer with a bare verdict and to cite headlines by id', () => {
    const body = read(extractorPath);
    expect(body).toContain('`ready`');
    expect(body).toContain('`failed: <short reason>`');
    expect(body).toMatch(/by id, never by text/);
  });

  it('the narrator starts the seed extractor before the case generator', () => {
    const body = read(narratorPath);
    expect(body).toContain('the-race:seed-extractor');
    expect(body.indexOf('the-race:seed-extractor')).toBeLessThan(body.indexOf('the-race:case-generator'));
  });

  it('the case generator is told to answer with a bare verdict', () => {
    const body = read(generatorPath);
    expect(body).toContain('`accepted`');
    expect(body).toContain('`failed: <short reason>`');
  });
});

describe('boundaries', () => {
  // Names that must never appear in the agent layer: the mirror world uses invented ones.
  const REAL_NAMES = [
    'Putin',
    'Trump',
    'Biden',
    'Zelensky',
    'Musk',
    'Google',
    'Microsoft',
    'Amazon',
    'Tesla',
    'Facebook',
    'Twitter',
    'Moscow',
    'Kyiv',
    'London',
    'Washington',
    'Russia',
    'Ukraine',
    'Gaza',
    'Israel',
    'China',
  ];

  it.each(markdown)('%s embeds no real-world name', (path) => {
    const text = read(path);
    for (const real of REAL_NAMES)
      expect(text, `${name(path)}: ${real}`).not.toMatch(new RegExp(`\\b${real}\\b`));
  });

  it.each(markdown)('%s never tells an agent to read the save directory', (path) => {
    for (const line of read(path).split('\n')) {
      if (/\.race\b|save director/i.test(line)) expect(line, name(path)).toMatch(/\b(never|not|no)\b/i);
    }
  });

  it('the narrator keeps its hard rules', () => {
    const text = read(narratorPath);
    expect(text).toMatch(/engine decides/i);
    expect(text).toMatch(/untrusted/i);
    expect(text).toMatch(/Never invent a clue/);
  });
});

describe('triggering evals', () => {
  const evals = JSON.parse(read(join(AGENTS, 'evals', 'triggering.json')));
  const cyrillic = (entry) => /[а-яё]/i.test(entry.prompt);

  it('has well-formed entries', () => {
    for (const entry of evals) {
      expect(typeof entry.prompt).toBe('string');
      expect(typeof entry.shouldTrigger).toBe('boolean');
    }
  });

  it.each([true, false])('has at least 12 prompts with shouldTrigger %s, in both languages', (flag) => {
    const group = evals.filter((entry) => entry.shouldTrigger === flag);
    expect(group.length).toBeGreaterThanOrEqual(12);
    expect(group.some(cyrillic)).toBe(true);
    expect(group.some((entry) => !cyrillic(entry))).toBe(true);
  });
});
