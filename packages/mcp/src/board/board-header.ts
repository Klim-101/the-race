// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { MAX_REPUTATION, type DetectiveRunView } from '@the-race/engine';
import { clock, deadlineLine, duration } from './board-chronicle.js';
import type { Fresh } from './board-new.js';
import type { BoardText } from './board-text.js';
import { escapeHtml } from './escape-html.js';
import { LOCALE_TEXT } from '../locales/index.js';
import { named, type TabText } from './tab-text.js';

type Words = TabText['header'];

/** A level in thirds, so the page can say how the hero is and never by how much. */
function third(value: number, max: number): 0 | 1 | 2 {
  const share = max <= 0 ? 0 : value / max;
  return share < 1 / 3 ? 0 : share < 2 / 3 ? 1 : 2;
}

/** The hero's nerves, sleep and reputation in words, with the conditions that are on them now. */
export function conditionWords(view: DetectiveRunView, text: TabText): string[] {
  const words: Words = text.header;
  const { condition } = view;
  const reputation = (['poor', 'middling', 'good'] as const)[third(view.reputation, MAX_REPUTATION)];
  const nerves = (['frayed', 'strained', 'steady'] as const)[third(condition.nerves, condition.maxNerves)];
  // Sleep debt is the other way round: the more of it, the worse.
  const sleep = (['rested', 'tired', 'exhausted'] as const)[
    third(condition.sleepDebt, condition.maxSleepDebt)
  ];
  return [
    words.nervesBands[nerves],
    words.sleepBands[sleep],
    ...condition.conditions.map(({ id }) => named(text.hero.conditionNames, id)),
    words.reputationBands[reputation],
  ];
}

/** What the last turn changed, one line each, from the words of the language; the cards carry the same marks. */
function freshLines(view: DetectiveRunView, fresh: Fresh, text: TabText): string[] {
  const t = text.fresh;
  const fill = (line: string, values: Readonly<Record<string, string>>): string =>
    Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), line);
  return [
    ...view.clues.filter(({ id }) => fresh.clueIds.has(id)).map(({ number }) => fill(t.clue, { n: number })),
    ...view.leads
      .filter(({ id }) => fresh.leadIds.has(id))
      .map(({ reason }) => fill(t.lead, { text: reason })),
    ...view.suspects.filter(({ id }) => fresh.lieSuspectIds.has(id)).map(({ name }) => fill(t.lie, { name })),
    ...view.suspects
      .filter(({ id }) => fresh.moods.has(id))
      .map(({ name, mood }) => fill(t.mood, { name, mood: text.statements.moods[mood] })),
    ...[...fresh.tools.values()].map((item) =>
      fill(t.tool, {
        name: named(text.hero.gear, item.id),
        state:
          item.state === 'owned'
            ? fill(text.hero.chargesLeft, { n: String(item.charges) })
            : named({ lost: text.hero.lost, spent: text.hero.spent, broken: text.hero.broken }, item.state),
      }),
    ),
  ];
}

/** How far into the night a hero who stays up is, in words: before midnight, past it, deep in it, and near the dawn. */
function awakeBand(minutesPastMidnight: number): 'evening' | 'past-midnight' | 'deep' | 'dawn' {
  return minutesPastMidnight === 0
    ? 'evening'
    : minutesPastMidnight < 180
      ? 'past-midnight'
      : minutesPastMidnight < 360
        ? 'deep'
        : 'dawn';
}

/** The line about a hero who has chosen not to sleep tonight, how long they have been up in words and never in numbers. */
function awakeLine(view: DetectiveRunView, text: TabText): string {
  const { awake } = view;
  if (awake === null) return '';
  const e = escapeHtml;
  return `
<p class="meta awake">${e(text.header.awake)}: ${e(text.header.awakeBands[awakeBand(awake.minutesPastMidnight)])}</p>`;
}

/**
 * The line about the past hero the run remembers, from the public record alone: who they were and how it ended, with the
 * country and the case's theme when the record has them. It is flavour and says nothing of this case.
 */
function rememberedLine(view: DetectiveRunView, text: TabText): string {
  const { remembers } = view;
  if (remembers === null) return '';
  const e = escapeHtml;
  const { stats, hall } = LOCALE_TEXT[view.locale];
  const parts = [
    e(named(stats.reasons, remembers.endReason)),
    ...(remembers.setting === undefined ? [] : [e(remembers.setting.name[view.locale])]),
    ...(remembers.theme === undefined ? [] : [e(named(hall.themes, remembers.theme))]),
  ];
  return `
<p class="meta remembered">${e(text.header.remembered)}: <strong>${e(remembers.name)}</strong>, ${e(named(text.hero.backgrounds, remembers.background))} · ${parts.join(' · ')}</p>`;
}

/**
 * The header over every tab, made from the public view alone: the title, the turn the page shows, the day and
 * the hour, the working time left, the hero's reputation and condition in words, and what the last turn changed.
 */
export function renderHeader(view: DetectiveRunView, board: BoardText, text: TabText, fresh: Fresh): string {
  const e = escapeHtml;
  const words = text.header;
  const lines = freshLines(view, fresh, text);
  const day = words.day
    .replace('{day}', String(view.clock.day))
    .replace('{total}', String(view.clock.totalDays))
    .replace('{time}', clock(view.clock.minute));
  return `<header class="head">
<h1>${e(view.title)}</h1>
<p class="meta">${e(words.turn.replace('{n}', String(view.turn)))} · ${e(day)} · ${e(board.status[view.status])} · ${e(board.detective)}: ${e(view.hero.name)}</p>
<p class="meta">${e(words.timeLeft)}: <strong>${e(duration(view.chronicle.activeMinutesLeft, text.chronicle))}</strong> · ${e(words.condition)}: ${e(conditionWords(view, text).join(', '))}</p>${deadlineLine(view, text).replace('<p>', '<p class="meta deadline">')}${awakeLine(view, text)}${rememberedLine(view, text)}${
    lines.length === 0
      ? ''
      : `\n<div class="fresh"><span class="tag">${e(text.fresh.title)}</span><ul>${lines.map((line) => `<li>${e(line)}</li>`).join('')}</ul></div>`
  }
</header>`;
}
