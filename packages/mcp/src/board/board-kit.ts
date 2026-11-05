// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import type { Fresh } from './board-new.js';
import { escapeHtml } from './escape-html.js';
import { named, type TabText } from './tab-text.js';

type Piece = DetectiveRunView['kit'][number];

/**
 * What the hero carries, laid out the way they carry it: the pockets (the phone, the notebook, what is consumed:
 * coffee, pills), the suitcase with its slots, those taken and those free, and, for each part of a place noticed
 * and not yet searched, which tool of the kit gets past what stands in its way. Drawn from the public view alone.
 */
export function renderKit(view: DetectiveRunView, text: TabText, fresh: Fresh): string {
  const e = escapeHtml;
  const t = text.hero;
  const wording = text.plan;

  const piece = ({ id, state, charges, lawful, removes }: Piece): string => {
    const status =
      state === 'owned'
        ? charges === null
          ? ''
          : ` <span class="tag">${e(t.chargesLeft.replace('{n}', String(charges)))}</span>`
        : ` <span class="warn">(${e(named({ lost: t.lost, spent: t.spent, broken: t.broken }, state))})</span>`;
    const unlawful = lawful ? '' : ` <span class="warn">${e(t.unlawful)}</span>`;
    const gets =
      removes.length === 0
        ? ''
        : `<br><span class="tag">${e(t.getsPast)}: ${e(removes.map((kind) => named(wording.obstacles, kind)).join(', '))}</span>`;
    const mark = fresh.tools.has(id) ? ` <span class="new">${e(text.fresh.mark)}</span>` : '';
    return `${e(named(t.gear, id))}${status}${unlawful}${mark}${gets}`;
  };

  const pockets = [
    ...view.kit.filter(({ suitcase }) => !suitcase).map(piece),
    ...view.supplies.map(
      ({ id, count, limit }) =>
        `${e(named(t.consumables, id))} ×${String(count)}${limit === null ? '' : ` <span class="tag">/ ${String(limit)}</span>`}`,
    ),
  ];
  const slots = [
    ...view.kit
      .filter(({ suitcase }) => suitcase)
      .map((item) => `<div class="card slot">${piece(item)}</div>`),
    ...Array.from(
      { length: Math.max(0, view.toolSlots.total - view.toolSlots.used) },
      () => `<div class="card slot empty-card"><span class="empty">${e(t.freeSlot)}</span></div>`,
    ),
  ];
  const placeName = new Map(view.map.places.map(({ id, name }) => [id, name]));
  const forParts = view.placeParts.flatMap(({ placeId, parts }) =>
    parts.flatMap(({ name, obstacle, searched }) => {
      if (searched || obstacle === null) return [];
      const tool = view.kit.find(({ state, removes }) => state === 'owned' && removes.includes(obstacle))?.id;
      const how = tool === undefined ? wording.noTool : wording.tool.replace('{tool}', named(t.gear, tool));
      return [
        `${e(placeName.get(placeId) ?? placeId)}: ${e(name)} <span class="tag">${e(named(wording.obstacles, obstacle))} · ${e(how)}</span>`,
      ];
    }),
  );
  const list = (items: readonly string[]): string =>
    `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;

  return `<h3>${e(t.kit)}</h3>
<h4>${e(t.pockets)}</h4>
${pockets.length === 0 ? `<p class="empty">${e(t.nothing)}</p>` : list(pockets)}
<h4>${e(t.suitcase.replace('{used}', String(view.toolSlots.used)).replace('{total}', String(view.toolSlots.total)))}</h4>
<div class="slots">
${slots.join('\n')}
</div>${
    forParts.length === 0
      ? ''
      : `
<h4>${e(t.forParts)}</h4>
${list(forParts)}`
  }
`;
}
