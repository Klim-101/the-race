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
  'hero_offer',
  'hero_pick',
  'run_view',
  'act',
  'question',
  'deduce',
  'accuse',
  'run_give_up',
  'evidence_board',
  'tavern_news',
  'profile_view',
  'profile_export',
  'profile_import',
];
const GENERATOR_TOOLS = ['generator_brief', 'scenario_submit'];
const EXTRACTOR_TOOLS = ['news_brief', 'world_propose', 'seeds_submit'];
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

  it('the seed extractor may use exactly the three extractor tools', () => {
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

  it('the narrator brings the news to the tavern before the heroes are offered, after starting the extractor', () => {
    const body = read(narratorPath);
    const start = body.indexOf('**New run:**');
    const news = body.indexOf('the-race:seed-extractor', start);
    const tavern = body.indexOf('tavern_news', start);
    const poll = body.indexOf('Then the tavern: the player does not build a hero', start);
    expect(news).toBeGreaterThan(start);
    expect(tavern).toBeGreaterThan(news);
    expect(poll).toBeGreaterThan(tavern);
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

describe('talks with suspects', () => {
  const REFERENCE = join(AGENTS, 'skills', 'play-the-race', 'reference');
  const talks = read(join(REFERENCE, 'talks.md'));

  // Every field of a questioning that the narrator voices; kept beside InterrogationOutcome in the engine.
  it.each(['alibi', 'conceded', 'secret', 'stance', 'presented'])(
    'says in talks.md what to do with the outcome field %s',
    (field) => {
      expect(talks).toContain(`\`${field}\``);
      expect(read(join(REFERENCE, 'outcomes.md'))).toContain(`\`${field}\``);
    },
  );

  it.each([
    [join('skills', 'play-the-race', 'SKILL.md')],
    [join('skills', 'play-the-race', 'reference', 'tone.md')],
    [join('skills', 'play-the-race', 'reference', 'outcomes.md')],
  ])('points to talks.md from %s', (file) => {
    expect(read(join(AGENTS, file))).toContain('talks.md');
  });

  it('forbids a fact of the case in a talk that gives nothing away', () => {
    expect(talks).toMatch(/no fact of the case/);
  });
});

describe('the prompts carry no story of a canonical case', () => {
  const CASES = join(AGENTS, '..', 'content', 'cases');
  const prompts = walk(join(AGENTS, 'subagents')).map((path) => [relative(AGENTS, path), read(path)]);

  // What identifies a sample case: its ids, as a model would copy them, and the names and the title it
  // shows the player. A generator that sees them in its prompt writes that story again.
  function identifiers(sample) {
    const ids = [
      ...sample.locations.map(({ id }) => id),
      ...sample.clues.map(({ id }) => id),
      ...sample.suspects.map(({ id }) => id),
      ...sample.deductions.map(({ id }) => id),
      ...(sample.randomEvents ?? []).map(({ id }) => id),
    ].map((id) => `"${id}"`);
    const names = [
      sample.title,
      ...sample.suspects.map(({ name }) => name),
      ...sample.locations.map(({ name }) => name),
    ];
    return [...ids, ...names.filter((name) => name.length >= 6)];
  }

  const samples = readdirSync(CASES)
    .filter((file) => file.endsWith('.json'))
    .map((file) => [file, JSON.parse(read(join(CASES, file)))]);

  it('finds the sample cases', () => {
    expect(samples.length).toBeGreaterThanOrEqual(4);
  });

  it.each(samples)('%s leaves no id, name or title in a prompt', (_file, sample) => {
    for (const [file, text] of prompts) {
      for (const identifier of identifiers(sample)) {
        expect(text.includes(identifier), `${file} contains ${identifier}`).toBe(false);
      }
    }
  });
});

describe('the news is visible to the player', () => {
  const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));
  const generator = read(join(AGENTS, 'subagents', 'case-generator.md'));

  it('has the narrator say, once and out of the fiction, when the news did not come through', () => {
    expect(skill).toMatch(/If `items` is empty[^.]*say so in one plain line out of the fiction/);
    expect(skill).toMatch(/On `failed`[^.]*say so to the player/);
  });

  it('has the narrator nod to what the case grew from, and only when the view has it', () => {
    expect(skill).toContain('`inspiration`');
    expect(skill).toContain('`inspiration: null`');
  });

  it('has the generator keep the seed recognisable in the case', () => {
    expect(generator).toMatch(/keep it recognisable/);
  });
});

describe('the events of a turn', () => {
  const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));
  const outcomes = read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'outcomes.md'));
  const generator = read(join(AGENTS, 'subagents', 'case-generator.md'));

  it('has the narrator tell them as a scene, from the result of the turn', () => {
    expect(skill).toMatch(/`events` is not empty[^.]*short scene/);
    expect(outcomes).toContain('## Events of the turn');
    expect(outcomes).toMatch(/`\{ outcome, events, felt, revealed, view \}`/);
  });

  it('has the generator bring a pool of events, which the engine requires', () => {
    expect(generator).toMatch(
      /\*\*randomEvents\*\* \(\*\*required\*\*: at least three and \*\*at least as many as the case has days\*\*/,
    );
  });

  it('has the generator cover every day with some event, which the engine requires', () => {
    expect(generator).toMatch(
      /every day of the case must be covered by some event's `fromDay` to `untilDay`/,
    );
    expect(generator).toMatch(/`untilDay` null means every day from `fromDay` on/);
  });

  it('has the narrator know that every day brings an event, and tell each one as a scene of its own', () => {
    const outcomes = read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'outcomes.md'));

    expect(outcomes).toMatch(/Every day brings at least one, at midday or in the evening/);
    expect(outcomes).toMatch(/a short scene of two to four sentences in the hero's voice/);
  });
});

describe('the signal at work', () => {
  const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));
  const outcomes = read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'outcomes.md'));

  it('has the narrator show the gift and the cost of the signal when the turn result says they worked', () => {
    expect(skill).toMatch(/`felt` is not empty, one clause/);
    expect(outcomes).toContain('## The signal at work');
    expect(outcomes).toMatch(/`\{ outcome, events, felt, revealed, view \}`/);
    for (const effect of ['helped', 'hindered', 'shielded']) expect(outcomes).toContain(`\`${effect}\``);
  });

  it('keeps numbers and skill names out of the telling', () => {
    expect(outcomes).toMatch(/never as a number or a skill name/);
  });
});

describe('the fields of accuse', () => {
  const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));
  // The description is written as joined string literals; join them to read it as the model does.
  const tool = read(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'mcp', 'src', 'tools', 'accuse.ts'),
  ).replace(/'\s*\+\s*\n\s*'/g, '');
  const FIELDS = ['turn', 'culpritId', 'motiveInsightId', 'evidenceClueIds'];
  const GUESSES = ['suspectId', 'insightId', 'clueIds'];

  it('gives the narrator the exact fields, with their types, and the names not to use', () => {
    for (const field of FIELDS) expect(skill).toContain(`\`${field}\``);
    for (const guess of GUESSES) expect(skill).toContain(`not \`${guess}\``);
    expect(skill).toMatch(/`turn` \(a number/);
    expect(skill).toMatch(/an array of clue ids, even for one clue or none, never a string/);
  });

  it('says the same in the description of the tool, which is what the model reads at the call', () => {
    for (const field of FIELDS) expect(tool).toContain(`\`${field}\``);
    expect(tool).toMatch(/`culpritId` is not `suspectId`/);
    expect(tool).toMatch(/`motiveInsightId` is not `insightId`/);
    expect(tool).toMatch(/`evidenceClueIds` is not `clueIds`/);
    expect(tool).toMatch(/`turn` is a number and `evidenceClueIds` an array of clue ids \(never a string\)/);
  });

  it('has the input schema carry the same four fields', () => {
    for (const field of FIELDS) expect(tool).toMatch(new RegExp(`\\n    ${field}: `));
  });
});

describe('the size of a link', () => {
  const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));
  const outcomes = read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'outcomes.md'));

  it('has the narrator tell the sizes in the poll and never offer a size no open conclusion has', () => {
    expect(skill).toContain('`openLinks`');
    expect(skill).toMatch(/never offer a link whose size no open conclusion has/);
  });

  it('explains the field and the refusal to the narrator', () => {
    expect(outcomes).toMatch(/`openLinks` \(how many clues each conclusion still to be made takes/);
    expect(outcomes).toContain('`wrong-link-size`');
  });
});

describe('the pressure of the poll', () => {
  const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));

  it('says that no option is a standing one, and that the poll leads with where the story is', () => {
    expect(skill).toMatch(/No option is a standing one/);
    expect(skill).toMatch(
      /lead with where the story is: the place, the people here and what is still unvisited/,
    );
  });

  it('offers a link only when something is new, and never as the first option of two polls in a row', () => {
    expect(skill).toMatch(/and something is new since the last attempt\*\*/);
    expect(skill).toMatch(/Never make it the first option of two polls in a row/);
  });

  it('offers the accusation only when asked or once when every conclusion is drawn, and never again after a refusal', () => {
    expect(skill).toMatch(/\*\*Accuse\*\* is never a standing option/);
    expect(skill).toMatch(/when the player asks for it \(through "Other", or by saying so\)/);
    expect(skill).toMatch(/once, when every conclusion of the case has been drawn \(`openLinks` is empty\)/);
    expect(skill).toMatch(/after the player declines, never offer it again unless they ask/);
  });

  it('offers a rest or the end of the day only when it is late or the hero is worn out', () => {
    expect(skill).toMatch(/\*\*Rest or stop for the day\*\*, only when it is late or the hero is worn out/);
    expect(skill).toMatch(/never as a default/);
  });
});

describe('the nerves of the hero', () => {
  const outcomes = read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'outcomes.md'));

  it('tells the narrator the new cost and the warnings as feelings, never as numbers', () => {
    expect(outcomes).toContain('`nerves-lost`');
    expect(outcomes).toContain('`frayed-nerves` and `ragged-nerves`');
    expect(outcomes).toMatch(/never name the number or the meter/);
  });
});

describe('a save that cannot be read', () => {
  const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));
  const outcomes = read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'outcomes.md'));

  it('has the narrator say in one line that an earlier save was left alone, and never block on it', () => {
    expect(skill).toContain('`unreadableSaves`');
    expect(skill).toMatch(/was left as it is, then go on; it blocks nothing/);
    expect(skill).toMatch(/never ask them to move or delete anything/);
  });

  it('does not tell the narrator to stop over a damaged save', () => {
    expect(outcomes).toMatch(/`save-unusable` \(an earlier save could not be read and was left as it is/);
    expect(outcomes).not.toMatch(/save-unusable` \(say so plainly and stop\)/);
  });
});

describe('the number of a clue', () => {
  const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));
  const outcomes = read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'outcomes.md'));

  it('has the narrator name a clue by its number in a poll and in the prose, with a short title', () => {
    expect(skill).toContain('`clues[].number`');
    expect(skill).toMatch(/KESVIK-03 · /);
    expect(skill).toMatch(/Name a clue by its number, in a poll and in the prose/);
  });

  it('maps a number typed through Other to the id, and never names a clue that is not found', () => {
    expect(skill).toMatch(
      /find the clue in `clues` with that `number` and pass its `id` to `question` or `deduce`/,
    );
    expect(skill).toMatch(/clue not found: say there is no such clue yet and never invent or hint at one/);
  });

  it('has the polls that show or link clues labelled by number, and the view reference say so', () => {
    expect(skill).toMatch(/which of them to show \(`multiSelect`, each option labelled by the clue's number/);
    expect(skill).toMatch(/each option labelled by the clue's number and a short title/);
    expect(outcomes).toMatch(/a public `number` such as `KESVIK-03`/);
  });
});

describe('a trait shows itself', () => {
  const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));
  const outcomes = read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'outcomes.md'));

  it('has the narrator tell a revealed trait once, from the result of the turn, and hint at none before', () => {
    expect(skill).toMatch(/`revealed` is not empty, a hidden trait/);
    expect(outcomes).toContain('## A trait shows itself');
    for (const reason of ['modifier', 'auto-discover', 'lock-out', 'spawn-event']) {
      expect(outcomes).toContain(`\`${reason}\``);
    }
    expect(outcomes).toMatch(/never hint at a trait that has not been revealed/);
  });
});

describe('the ending of a run', () => {
  const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));

  it('points the narrator to the endings reference, which says the hero leaves and never dies', () => {
    expect(skill).toContain('reference/endings.md');
    expect(read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'endings.md'))).toContain(
      'The hero leaves; the hero never dies.',
    );
  });
});

describe('the hero as the narrator', () => {
  const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));
  const tone = read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'tone.md'));
  const voice = read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'hero-voice.md'));
  const prompts = [
    skill,
    tone,
    voice,
    ...['talks.md', 'endings.md', 'outcomes.md', 'hero-creation.md'].map((file) =>
      read(join(AGENTS, 'skills', 'play-the-race', 'reference', file)),
    ),
  ];

  it('tells the story in the first person from the pick on, and keeps the tavern an outside voice', () => {
    expect(skill).toMatch(/you are the hero's own thoughts: first person, present tense/);
    expect(tone).toMatch(/\*\*First person, present tense\*\*/);
    expect(tone).toMatch(/Я толкаю дверь/);
    expect(read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'hero-creation.md'))).toMatch(
      /outside voice/,
    );
  });

  it('points to the voice reference, which says how the voice comes from the hero and what stays', () => {
    expect(skill).toContain('reference/hero-voice.md');
    expect(tone).toContain('hero-voice.md');
    expect(voice).toMatch(/a little irony/i);
    expect(voice).toMatch(/The hero leaves the case at the end and never dies/);
  });

  it('has no haughty narrator or second person left anywhere in the narrator files', () => {
    for (const text of prompts) {
      expect(text).not.toMatch(/haughty|supercilious|look down your nose|Second person, present tense/i);
    }
  });
});

describe('the language of the hero', () => {
  const dir = join(AGENTS, 'skills', 'play-the-race');
  const skill = read(join(dir, 'SKILL.md'));
  const voice = read(join(dir, 'reference', 'hero-voice.md'));
  const tone = read(join(dir, 'reference', 'tone.md'));

  it('is the language of the run, said where the voice is set and in the turn loop, short lines included', () => {
    for (const text of [voice, tone]) {
      expect(text).toMatch(/\*\*The language comes first\.\*\*/);
      expect(text).toMatch(/the short line between a tool call and the poll/);
      expect(text).toMatch(/rewritten before it is sent/);
    }
    expect(skill).toMatch(/read `locale` of the result's `view` and write that line in it/);
  });

  it('has a Russian counterpart for the voice examples of the signal, the trait and the ending', () => {
    const outcomes = read(join(dir, 'reference', 'outcomes.md'));
    const endings = read(join(dir, 'reference', 'endings.md'));

    expect(outcomes).toMatch(/the warmth in my head[^()]*\(«/);
    expect(outcomes).toMatch(/I have always read a room faster than a ledger" \(«/);
    expect(endings).toMatch(/«я оставляю папку на столе/);
  });
});

describe('the move of the saves', () => {
  it('is told once, plainly, from the view', () => {
    const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));

    expect(skill).toMatch(/`savesMoved`/);
    expect(skill).toMatch(/say once, in one plain line out of the fiction/);
  });
});

describe('the rumours of the tavern', () => {
  it('are told freshly in each run, as the tool says and the skill repeats', () => {
    const skill = read(join(AGENTS, 'skills', 'play-the-race', 'SKILL.md'));

    expect(skill).toMatch(/this run's own rumours, so tell them freshly, in different words each time/);
  });
});

describe('the road', () => {
  const outcomes = read(join(AGENTS, 'skills', 'play-the-race', 'reference', 'outcomes.md'));
  const generator = read(join(AGENTS, 'subagents', 'case-generator.md'));

  it('has the narrator tell the weather and the mishaps of the road, comic and never harmful', () => {
    expect(outcomes).toContain('## The road');
    for (const id of ['wrong-turn', 'missed-bus', 'deep-puddle', 'lost-in-the-fog', 'dog-follows']) {
      expect(outcomes).toContain(`\`${id}\``);
    }
    expect(outcomes).toMatch(/Never turn a mishap into an injury, a fight or a threat/);
  });

  it('has the generator mark each place indoor or outdoor', () => {
    expect(generator).toMatch(/`exposure` \(`"indoor"` for a room in a building, `"outdoor"` for a street/);
  });
});

describe('the map of a generated case', () => {
  const generator = read(join(AGENTS, 'subagents', 'case-generator.md'));

  it('is a town: 8 to 12 places, streets between the buildings and never two buildings side by side', () => {
    expect(generator).toMatch(/\*\*locations\*\* \(8 to 12, \*\*a town and not a floor plan\*\*/);
    expect(generator).toMatch(/two buildings never connect directly, only through an `outdoor` place/);
    expect(generator).not.toMatch(/\*\*locations\*\* \(6 to 9\)/);
  });
});
