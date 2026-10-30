// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { viewRun, type DetectiveRunState, type DetectiveRunView } from '@the-race/engine';

/**
 * The only words of the summary that are not the case's own. They live in one place so that they can
 * move to the locale files with the other player-facing text.
 */
export const RESUME_LABELS = {
  heading: 'RESUME SUMMARY',
  instruction:
    'The engine owns the state and the dice. Continue from the facts below and invent none of the rest.',
  status: 'Status',
  turn: 'Turn',
  time: 'Time',
  day: 'Day',
  of: 'of',
  reputation: 'Reputation',
  hero: 'Hero',
  skills: 'Skills',
  traits: 'Known traits',
  hiddenTraits: 'Traits not yet revealed',
  location: 'Location',
  exits: 'Exits',
  visited: 'visited',
  suspects: 'Suspects',
  clues: 'Clues found',
  insights: 'Insights',
  none: 'none',
} as const;
export type ResumeLabels = Record<keyof typeof RESUME_LABELS, string>;

function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  return `${String(hours).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function list(labels: ResumeLabels, lines: readonly string[]): string[] {
  return lines.length > 0 ? lines.map((line) => `- ${line}`) : [`- ${labels.none}`];
}

function renderView(view: DetectiveRunView, labels: ResumeLabels): string {
  const skills = Object.entries(view.hero.skills)
    .map(([skill, level]) => `${skill} ${String(level)}`)
    .join(', ');
  return [
    `${labels.heading}: ${view.title}`,
    view.premise,
    labels.instruction,
    '',
    `${labels.status}: ${view.status}. ${labels.turn} ${String(view.turn)}. ${labels.time}: ${labels.day} ${String(view.clock.day)} ${labels.of} ${String(view.clock.totalDays)}, ${formatMinute(view.clock.minute)}. ${labels.reputation}: ${String(view.reputation)}.`,
    `${labels.hero}: ${view.hero.name}. ${labels.skills}: ${skills}.`,
    `${labels.traits}: ${view.revealedTraits.map(({ id }) => id).join(', ') || labels.none}. ${labels.hiddenTraits}: ${String(view.hiddenTraitCount)}.`,
    '',
    `${labels.location}: ${view.location.name}`,
    view.location.description,
    `${labels.exits}:`,
    ...list(
      labels,
      view.location.exits.map(({ name, visited }) => (visited ? `${name} (${labels.visited})` : name)),
    ),
    `${labels.suspects}:`,
    ...list(
      labels,
      view.suspects.map(({ name, persona }) => `${name}: ${persona}`),
    ),
    `${labels.clues}:`,
    ...list(
      labels,
      view.clues.map(({ description }) => description),
    ),
    `${labels.insights}:`,
    ...list(
      labels,
      view.insights.map(({ insight }) => insight),
    ),
  ].join('\n');
}

/**
 * A short text that lets a brand-new agent session continue a run without the old conversation. It is
 * built from `viewRun` alone, never from the raw state, so the truth, the solution, unfound clues, lies
 * and hidden traits cannot reach it.
 */
export function buildResumeSummary(run: DetectiveRunState, labels: ResumeLabels = RESUME_LABELS): string {
  return renderView(viewRun(run), labels);
}
