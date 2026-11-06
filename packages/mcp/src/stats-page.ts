// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { GenerationStats, RunsStats } from '@the-race/saves';
import { escapeHtml } from './board/escape-html.js';
import { named } from './board/tab-text.js';
import { LOCALE_TEXT } from './locales/index.js';
import type { StatsText } from './stats-text.js';

const STYLE = `
:root{color-scheme:light dark;--bg:#f4efe6;--card:#fffdf8;--ink:#2a2622;--muted:#7a7066;--line:#ddd3c3;--accent:#8a3b2a;--warn:#b26a00}
@media (prefers-color-scheme:dark){:root{--bg:#1b1917;--card:#252220;--ink:#ece4d8;--muted:#a09484;--line:#3a3430;--accent:#e08a70;--warn:#e0a040}}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px 48px;background:var(--bg);color:var(--ink);font:16px/1.5 Georgia,'Times New Roman',serif;overflow-wrap:anywhere}
main{max-width:960px;margin:0 auto}
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
a{color:var(--accent)}
.won{color:var(--accent);font-weight:bold}
.damaged,.in-progress{color:var(--warn)}
.empty{color:var(--muted)}
@media print{body{background:#fff;color:#000}}
`;

/** How many of the rules that rejected cases most often the page lists. */
const CODES_SHOWN = 10;

function renderGeneration(
  generation: GenerationStats,
  text: StatsText,
  e: (value: string) => string,
): string {
  const { accepted, failed, acceptedOnAttempt, frames, codes } = generation;
  const words = text.generation;
  const heading = `<h2>${e(words.title)}</h2>`;
  const framed = frames.accepted + frames.rejected;
  if (accepted + failed + framed + acceptedOnAttempt.length + codes.length === 0) {
    return `\n${heading}\n<p class="empty">${e(words.none)}</p>`;
  }
  const decided = accepted + failed;
  const share = decided === 0 ? '–' : `${String(Math.round((100 * accepted) / decided))}%`;
  const attempts = acceptedOnAttempt
    .map((count, index) => `<tr><td>${String(index + 1)}</td><td>${String(count)}</td></tr>`)
    .join('\n');
  const rules = codes
    .slice(0, CODES_SHOWN)
    .map(({ code, count }) => `<tr><td>${e(code)}</td><td>${String(count)}</td></tr>`)
    .join('\n');
  return `
${heading}
<ul class="totals">
<li><strong>${share}</strong>${e(words.share)}</li>
<li><strong>${String(accepted)}</strong>${e(words.accepted)}</li>
<li><strong>${String(failed)}</strong>${e(words.failed)}</li>${
    framed === 0
      ? ''
      : `
<li><strong>${String(frames.accepted)}</strong>${e(words.framesAccepted)}</li>
<li><strong>${String(frames.rejected)}</strong>${e(words.framesRejected)}</li>`
  }
</ul>${
    attempts === ''
      ? ''
      : `
<div class="scroll"><table>
<thead><tr><th>${e(words.attempt)}</th><th>${e(words.acceptedOnIt)}</th></tr></thead>
<tbody>
${attempts}
</tbody>
</table></div>`
  }${
    rules === ''
      ? ''
      : `
<h2>${e(words.mostOften)}</h2>
<div class="scroll"><table>
<thead><tr><th>${e(words.code)}</th><th>${e(words.rejections)}</th></tr></thead>
<tbody>
${rules}
</tbody>
</table></div>`
  }`;
}

/**
 * The page of all the runs: each with its date, title, hero, result, days and turns, and a link to its board when
 * it has one, and the totals; then how the case generator has done. Made from the statistics alone, which hold only
 * what `run_view` shows and codes of the rules that rejected a case. It needs no script and loads nothing from
 * outside. `boardHref` says where the board of a run is, relative to this page.
 */
export function renderStatsPage(
  stats: RunsStats,
  generation: GenerationStats,
  boardHref: (runId: string) => string,
): string {
  const text = LOCALE_TEXT[stats.locale].stats;
  const e = escapeHtml;
  const none = '–';
  const rows = stats.runs
    .toReversed()
    .map(({ runId, startedOn, title, hero, result, endReason, days, turns, board }) => {
      const how =
        endReason === null
          ? text.results[result]
          : `${text.results[result]} · ${named(text.reasons, endReason)}`;
      return `<tr>
<td>${e(startedOn ?? none)}</td>
<td>${title === null ? `<span class="empty">${e(text.unreadable)}</span>` : e(title)}</td>
<td>${hero === null ? none : e(hero)}</td>
<td class="${e(result)}">${e(how)}</td>
<td>${days === null ? none : String(days)}</td>
<td>${turns === null ? none : String(turns)}</td>
<td>${board ? `<a href="${e(boardHref(runId))}">${e(text.openBoard)}</a>` : none}</td>
</tr>`;
    });
  return `<!doctype html>
<html lang="${stats.locale}">
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
<p class="meta">${e(text.updated)}: ${e(stats.updatedOn)}</p>
<ul class="totals">
<li><strong>${String(stats.totals.runs)}</strong>${e(text.totals.runs)}</li>
<li><strong>${String(stats.totals.wins)}</strong>${e(text.totals.wins)}</li>
<li><strong>${String(stats.totals.longestDays)}</strong>${e(text.totals.longest)}</li>
<li><strong>${String(stats.totals.bestStreak)}</strong>${e(text.totals.streak)}</li>
</ul>${
    rows.length === 0
      ? `\n<p class="empty">${e(text.none)}</p>`
      : `
<div class="scroll"><table>
<thead><tr><th>${e(text.columns.date)}</th><th>${e(text.columns.title)}</th><th>${e(text.columns.hero)}</th><th>${e(text.columns.result)}</th><th>${e(text.columns.days)}</th><th>${e(text.columns.turns)}</th><th>${e(text.columns.board)}</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table></div>`
  }${renderGeneration(generation, text, e)}
</main>
</body>
</html>
`;
}
