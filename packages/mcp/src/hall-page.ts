// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import {
  ACHIEVEMENTS,
  archetypeOf,
  earnedAchievements,
  computeProfileStats,
  type Archetype,
  type Locale,
  type ProfileRecord,
} from '@the-race/engine';
import { escapeHtml } from './board/escape-html.js';
import { named } from './board/tab-text.js';
import type { HallText } from './hall-text.js';
import { LOCALE_TEXT } from './locales/index.js';

const STYLE = `
:root{color-scheme:light dark;--bg:#f4efe6;--card:#fffdf8;--ink:#2a2622;--muted:#7a7066;--line:#ddd3c3;--accent:#8a3b2a}
@media (prefers-color-scheme:dark){:root{--bg:#1b1917;--card:#252220;--ink:#ece4d8;--muted:#a09484;--line:#3a3430;--accent:#e08a70}}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px 48px;background:var(--bg);color:var(--ink);font:16px/1.5 Georgia,'Times New Roman',serif;overflow-wrap:anywhere}
main{max-width:1040px;margin:0 auto}
h1{margin:0 0 4px;font-size:1.8rem}
.meta{color:var(--muted);margin:0 0 16px}
.totals{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 20px;padding:0;list-style:none}
.totals li{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px 14px}
.totals strong{display:block;font-size:1.4rem}
h2{margin:32px 0 12px;font-size:1.3rem}
.scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line)}
th,td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:normal;font-size:.9rem}
td small{display:block;color:var(--muted)}
a{color:var(--accent)}
.won{color:var(--accent);font-weight:bold}
.empty{color:var(--muted)}
.badges{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin:0;padding:0;list-style:none}
.badges li{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:10px 14px}
.badges .kind{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}
.badges strong{display:block}
.badges .locked{opacity:.55}
@media print{body{background:#fff;color:#000}}
`;

const NONE = '–';

/** What the hall needs to show one record: the words, the language and where the board of the run is. */
interface RowContext {
  readonly text: HallText;
  readonly locale: Locale;
  readonly e: (value: string) => string;
  readonly boardHref: (record: ProfileRecord) => string | undefined;
}

/**
 * How one kind of game is shown in the hall: the columns it has and the cells of a record. A new kind of game adds an
 * entry here, and the compiler insists on it, so the page never has to learn what a record of that kind means.
 */
interface ArchetypeRows {
  readonly headers: (text: HallText) => readonly string[];
  readonly cells: (record: ProfileRecord, context: RowContext) => readonly string[];
}

const playTime = (minutes: number, text: HallText): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0
    ? text.minutesOnly.replace('{m}', String(rest))
    : text.duration.replace('{h}', String(hours)).replace('{m}', String(rest));
};

const resultOf = (record: ProfileRecord): 'won' | 'lost' | 'gave-up' =>
  record.won ? 'won' : record.endReason === 'gave-up' ? 'gave-up' : 'lost';

const ROWS = {
  detective: {
    headers: ({ columns }) => [
      columns.hero,
      columns.case,
      columns.country,
      columns.result,
      columns.days,
      columns.time,
      columns.clues,
      columns.traits,
      columns.board,
    ],
    cells: (record, { text, locale, e, boardHref }) => {
      const reasons = LOCALE_TEXT[locale].stats.reasons;
      const backgrounds = LOCALE_TEXT[locale].tabs.hero.backgrounds;
      const result = resultOf(record);
      const href = boardHref(record);
      return [
        `${e(record.hero.name)}<small>${e(named(backgrounds, record.hero.background))}</small>`,
        `${e(record.title)}${record.theme === undefined ? '' : `<small>${e(named(text.themes, record.theme))}</small>`}`,
        record.setting === undefined ? NONE : e(record.setting.name[locale]),
        `<span class="${result}">${e(text.results[result])}</span><small>${e(named(reasons, record.endReason))}</small>`,
        String(record.days),
        e(playTime(record.minutes, text)),
        String(record.cluesFound),
        `${String(record.traitsRevealed)}/${String(record.traitsTotal)}`,
        href === undefined ? NONE : `<a href="${e(href)}">${e(text.openBoard)}</a>`,
      ];
    },
  },
} as const satisfies Record<Archetype, ArchetypeRows>;

/** The achievements: the earned ones told, the others shown as still to earn, a secret one without its words. */
function renderAchievements(
  records: readonly ProfileRecord[],
  text: HallText,
  e: (value: string) => string,
): string {
  const words = text.achievements;
  const earned = new Set<string>(earnedAchievements(records));
  const cards = ACHIEVEMENTS.map(({ id, kind }) => {
    const done = earned.has(id);
    const hidden = kind === 'secret' && !done;
    const item = words.items[id];
    return `<li class="${done ? 'earned' : 'locked'}"><span class="kind">${e(words.kinds[kind])}</span><strong>${e(hidden ? words.secretName : item.name)}</strong>${e(hidden ? words.secretHint : item.description)}${done ? '' : `<small>${e(words.locked)}</small>`}</li>`;
  });
  return `<h2>${e(words.title)}: ${String(earned.size)}/${String(ACHIEVEMENTS.length)}</h2>
<ul class="badges">
${cards.join('\n')}
</ul>`;
}

/**
 * The hall of heroes: every hero the player has played, newest first, grouped by the kind of game, with the totals.
 * Made from the records of the profile alone, which hold what the player saw once a run was over and nothing of the
 * case's truth. It needs no script and loads nothing from outside. `boardHref` says where the board of a run is,
 * relative to this page, or `undefined` when there is none.
 */
export function renderHallPage(
  records: readonly ProfileRecord[],
  updatedOn: string,
  boardHref: (record: ProfileRecord) => string | undefined,
): string {
  // The language of the hall is the one the player played in last.
  const locale = records.at(-1)?.locale ?? 'en';
  const text = LOCALE_TEXT[locale].hall;
  const e = escapeHtml;
  const stats = computeProfileStats(records);
  const context: RowContext = { text, locale, e, boardHref };
  const byKind = new Map<Archetype, ProfileRecord[]>();
  for (const record of records) {
    byKind.set(archetypeOf(record), [record, ...(byKind.get(archetypeOf(record)) ?? [])]);
  }
  const kinds = Object.keys(ROWS) as Archetype[];
  const sections = kinds.flatMap((kind) => {
    // Newest first: each record was put in front of the ones before it.
    const own = byKind.get(kind) ?? [];
    if (own.length === 0) return [];
    const rows: ArchetypeRows = ROWS[kind];
    const head = rows
      .headers(text)
      .map((header) => `<th>${e(header)}</th>`)
      .join('');
    const body = own
      .map((record) => {
        const cells = rows.cells(record, context).map((cell) => `<td>${cell}</td>`);
        return `<tr>${cells.join('')}</tr>`;
      })
      .join('\n');
    return [
      `<h2>${e(named(text.archetypes, kind))}</h2>
<div class="scroll"><table>
<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table></div>`,
    ];
  });
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${e(text.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${e(text.title)}</h1>
<p class="meta">${e(text.updated)}: ${e(updatedOn)}</p>
<ul class="totals">
<li><strong>${String(stats.runs)}</strong>${e(text.totals.runs)}</li>
<li><strong>${String(stats.won)}</strong>${e(text.totals.wins)}</li>
<li><strong>${String(stats.bestStreak)}</strong>${e(text.totals.streak)}</li>
<li><strong>${String(stats.longestRunDays)}</strong>${e(text.totals.longest)}</li>
</ul>
${sections.length === 0 ? `<p class="empty">${e(text.none)}</p>` : sections.join('\n')}
${renderAchievements(records, text, e)}
</main>
</body>
</html>
`;
}
