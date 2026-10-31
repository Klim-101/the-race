// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { MAX_REPUTATION, type DetectiveRunView } from '@the-race/engine';
import type { BoardText } from './board-text.js';
import { escapeHtml } from './escape-html.js';
import { named, type TabText } from './tab-text.js';

const list = (items: readonly string[]): string =>
  `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;

function meter(label: string, value: number, max: number): string {
  return `<p class="meter"><span>${escapeHtml(label)}</span> <meter min="0" max="${String(max)}" value="${String(value)}">${String(value)}</meter> <span class="tag">${String(value)} / ${String(max)}</span></p>`;
}

/** The climate of the country the case is set in: its zone, each season with its weather, the hazards. */
function renderClimate(view: DetectiveRunView, text: BoardText): string {
  if (view.setting === null) return '';
  const { climate } = text;
  const { name, climate: profile } = view.setting;
  const hazards =
    profile.hazards.length === 0
      ? climate.noHazards
      : profile.hazards.map((hazard) => climate.hazardNames[hazard]).join(', ');
  return `<h3>${escapeHtml(climate.title)}</h3>
<div class="card">
<p>${escapeHtml(climate.setIn)}: <strong>${escapeHtml(name)}</strong></p>
<p class="tag">${escapeHtml(climate.zone)}: ${escapeHtml(climate.zones[profile.zone])}</p>
<p>${escapeHtml(climate.seasons)}:</p>
${list(profile.seasons.map(({ id, weather }) => `${escapeHtml(climate.seasonNames[id])}: ${escapeHtml(climate.weathers[weather])}`))}
<p>${escapeHtml(climate.hazards)}: ${escapeHtml(hazards)}</p>
</div>`;
}

/**
 * The hero and what they carry: who they are, how they hold up, the kit and supplies, what is on its way, the
 * traits that have shown themselves and how many have not, and the weather of the country they work in.
 */
export function renderHero(view: DetectiveRunView, board: BoardText, text: TabText): string {
  const t = text.hero;
  const e = escapeHtml;
  const { condition } = view;

  const skills = Object.entries(view.hero.skills).map(
    ([skill, level]) => `${e(named(t.skillNames, skill))}: ${String(level)}`,
  );
  const conditions =
    condition.conditions.length === 0
      ? `<p class="empty">${e(t.none)}</p>`
      : list(
          condition.conditions.map(
            ({ id, minutesLeft }) =>
              `${e(named(t.conditionNames, id))} <span class="tag">${minutesLeft === null ? e(t.untilNight) : `${String(minutesLeft)} ${e(t.minutes)}`}</span>`,
          ),
        );
  const warnings =
    view.warnings.length === 0
      ? ''
      : list(view.warnings.map((id) => `<span class="warn">${e(named(t.warningNames, id))}</span>`));
  const kit =
    view.kit.length === 0
      ? `<p class="empty">${e(t.nothing)}</p>`
      : list(
          view.kit.map(
            ({ id, state }) =>
              `${e(named(t.gear, id))}${state === 'lost' ? ` <span class="warn">(${e(t.lost)})</span>` : ''}`,
          ),
        );
  const supplies =
    view.supplies.length === 0
      ? `<p class="empty">${e(t.nothing)}</p>`
      : list(view.supplies.map(({ id, count }) => `${e(named(t.consumables, id))} ×${String(count)}`));
  const pending =
    view.pending.length === 0
      ? ''
      : `<h3>${e(t.pending)}</h3>${list(
          view.pending.map(
            ({ source, meter: target, delta, inMinutes }) =>
              `${e(named(t.consumables, source))}: ${delta > 0 ? '+' : ''}${String(delta)} ${e(named(t.meters, target))} <span class="tag">${inMinutes === null ? e(t.atNight) : e(t.inMinutes.replace('{n}', String(inMinutes)))}</span>`,
          ),
        )}`;
  const traits =
    view.revealedTraits.length === 0
      ? `<p class="empty">${e(t.noTraits)}</p>`
      : list(view.revealedTraits.map(({ id }) => e(named(t.traitNames, id))));

  const note = view.signal === null ? undefined : t.signalNotes[view.signal.id];
  const signalNote =
    note === undefined
      ? ''
      : `<p>${e(t.gift)}: ${e(note.gift)}</p>
<p>${e(t.cost)}: ${e(note.cost)}</p>
`;

  return `<div class="card">
<p><strong>${e(view.hero.name)}</strong></p>
<p class="tag">${e(t.background)}: ${e(named(t.backgrounds, view.hero.background))}${view.hero.lifeState === undefined ? '' : ` · ${e(t.lifeState)}: ${e(named(t.lifeStates, view.hero.lifeState))}`}${view.signal === null ? '' : ` · ${e(t.signal)}: ${e(named(t.signals, view.signal.id))}`}</p>
${signalNote}<p>${e(t.skills)}: ${skills.join(', ')}</p>
</div>
<h3>${e(t.condition)}</h3>
<div class="card">
${meter(t.reputation, view.reputation, MAX_REPUTATION)}
${meter(t.nerves, condition.nerves, condition.maxNerves)}
${meter(t.sleepDebt, condition.sleepDebt, condition.maxSleepDebt)}
<p>${e(t.conditions)}:</p>
${conditions}
${warnings}
</div>
<h3>${e(t.kit)}</h3>
${kit}
<h3>${e(t.supplies)}</h3>
${supplies}
${pending}
<h3>${e(t.traits)}</h3>
${traits}
<p class="tag">${e(t.hidden)}: ${String(view.hiddenTraitCount)}</p>
${renderClimate(view, board)}`;
}
