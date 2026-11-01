// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale } from '../../locale.js';
import { findViolence } from '../../text/violence.js';
import type { Trait } from '../../traits.js';
import type { DetectiveHero } from '../archetype.js';
import type { CaseIssue } from '../case-issue.js';
import { isLastingEffect, type DetectiveCase } from '../case-schema.js';
import { isSolvable, scheduledClosures, withEffect, type Standing } from '../solvability.js';

/**
 * The pool of random events: ids are unique, every reference resolves, days fall inside the case, no
 * description speaks of violence or death, and no event, taken with every scheduled closure, can cut this
 * hero off from the solution. Events are checked one by one; the engine checks again, with what has already
 * happened, before it applies one, which is what keeps a run of them from adding up to a dead end.
 */
export function checkRandomEvents(
  detectiveCase: DetectiveCase,
  hero: DetectiveHero,
  traits: readonly Trait[],
  locale: Locale,
  minEvents: number,
): CaseIssue[] {
  const { days } = detectiveCase.clock;
  const locationIds = new Set(detectiveCase.locations.map(({ id }) => id));
  const suspectIds = new Set(detectiveCase.suspects.map(({ id }) => id));
  const takenIds = new Set([
    ...detectiveCase.locations.map(({ id }) => id),
    ...detectiveCase.clues.map(({ id }) => id),
    ...detectiveCase.suspects.flatMap(({ id, lies }) => [id, ...lies.map((lie) => lie.id)]),
    ...detectiveCase.deductions.map(({ id }) => id),
  ]);
  const base: Standing = {
    closedLocationIds: scheduledClosures(detectiveCase),
    closedSources: new Set(),
    suspectPlaces: new Map(),
  };
  const issues: CaseIssue[] = [];

  const pool = detectiveCase.randomEvents ?? [];
  // A case that must have a pool needs an event for every day, and at least `minEvents`.
  const needed = minEvents > 0 ? Math.max(minEvents, days) : 0;
  if (pool.length < needed) {
    issues.push({
      code: 'too-few-random-events',
      path: 'randomEvents',
      message: `The case needs at least ${String(needed)} random events (as many as it has days, and not fewer than ${String(minEvents)}), with fromDay and untilDay spread over its days; it has ${String(pool.length)}.`,
    });
  }
  if (needed > 0 && pool.length > 0) {
    const uncovered = Array.from({ length: days }, (_, index) => index + 1).filter(
      (day) =>
        !pool.some(({ fromDay, untilDay }) => fromDay <= day && (untilDay === null || untilDay >= day)),
    );
    if (uncovered.length > 0) {
      issues.push({
        code: 'random-events-miss-a-day',
        path: 'randomEvents',
        message: `Every day of the case needs an event that may happen on it; no event covers day ${uncovered.map(String).join(', ')} (see fromDay and untilDay).`,
      });
    }
  }

  pool.forEach((event, index) => {
    const path = `randomEvents[${String(index)}]`;
    const outOfRange = (field: string, message: string): void => {
      issues.push({ code: 'random-event-out-of-range', path: `${path}.${field}`, message });
    };
    if (takenIds.has(event.id)) {
      issues.push({ code: 'duplicate-id', path: `${path}.id`, message: `Id "${event.id}" is already used.` });
    }
    takenIds.add(event.id);

    if (event.fromDay > days) outOfRange('fromDay', `The case lasts ${String(days)} days.`);
    if (event.duration.kind === 'until-day' && event.duration.day > days + 1) {
      outOfRange(
        'duration.day',
        `The case lasts ${String(days)} days, so an effect cannot outlast day ${String(days + 1)}.`,
      );
    }
    const violence = findViolence(event.description, locale);
    if (violence !== undefined) {
      issues.push({
        code: 'random-event-violence',
        path: `${path}.description`,
        message: `A random event never hurts or kills anyone; rewrite it without "${violence}".`,
      });
    }

    const { effect } = event;
    const unknown = (kind: string, id: string, field: string): void => {
      issues.push({
        code: 'unknown-reference',
        path: `${path}.effect.${field}`,
        message: `Unknown ${kind} "${id}".`,
      });
    };
    let isResolved = true;
    if (
      (effect.kind === 'location-closes' || effect.kind === 'suspect-moves') &&
      !locationIds.has(effect.locationId)
    ) {
      unknown('location', effect.locationId, 'locationId');
      isResolved = false;
    }
    if (effect.kind === 'suspect-moves' && !suspectIds.has(effect.suspectId)) {
      unknown('suspect', effect.suspectId, 'suspectId');
      isResolved = false;
    }
    if (
      isResolved &&
      isLastingEffect(effect) &&
      !isSolvable(detectiveCase, hero, traits, withEffect(base, effect))
    ) {
      issues.push({
        code: 'random-event-cuts-solution',
        path: `${path}.effect`,
        message: 'If this event happened, this hero could no longer prove the case.',
      });
    }
  });
  return issues;
}
