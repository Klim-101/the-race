// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from '../assert-never.js';
import type { Lead, LeadTrigger, LeadWindow, Location } from './case-schema.js';
import type { DetectiveRunState } from './run-state.js';

/** The first ruleset in which a place can wait for a lead and a part can be shown by one. */
export const LEADS_RULESET_VERSION = 13;

const leadsApply = (run: Pick<DetectiveRunState, 'rulesetVersion'>): boolean =>
  run.rulesetVersion >= LEADS_RULESET_VERSION;

export function isLeadEarned(run: DetectiveRunState, leadId: string): boolean {
  return run.earnedLeads.some((earned) => earned.leadId === leadId);
}

/**
 * Whether the hero knows the place exists: they have been there, or no lead stands between them and it. A run of
 * a ruleset from before the leads knows every place next to one it has seen, as it always did.
 */
export function isPlaceKnown(run: DetectiveRunState, location: Location): boolean {
  if (!leadsApply(run) || location.requiresLead === undefined) return true;
  return run.visitedLocationIds.includes(location.id) || isLeadEarned(run, location.requiresLead);
}

/** A moment of the day is in a window; a window may wrap midnight ("from ten at night to five"). */
export function inWindow(window: LeadWindow, minute: number): boolean {
  return window.fromMinute < window.untilMinute
    ? minute >= window.fromMinute && minute < window.untilMinute
    : minute >= window.fromMinute || minute < window.untilMinute;
}

/** Whether the hour of the day lets the hero follow the lead; a lead with no window can be followed at any hour. */
export function isLeadOpen(run: DetectiveRunState, leadId: string): boolean {
  const window = run.case.leads?.find(({ id }) => id === leadId)?.window;
  return window === undefined || inWindow(window, run.clock.minute);
}

/** The leads not yet earned that this deed earns. */
export function leadsEarnedBy(run: DetectiveRunState, deed: LeadTrigger): readonly Lead[] {
  if (!leadsApply(run)) return [];
  return (run.case.leads ?? []).filter(
    (lead) =>
      !isLeadEarned(run, lead.id) &&
      deedKey(lead.earnedBy) === deedKey(deed) &&
      toolFits(lead.earnedBy, deed),
  );
}

/** A lead earned by a clue studied with one tool is earned by that tool only; with none named, by any. */
function toolFits(trigger: LeadTrigger, deed: LeadTrigger): boolean {
  return (
    trigger.kind !== 'study' ||
    deed.kind !== 'study' ||
    trigger.tool === undefined ||
    trigger.tool === deed.tool
  );
}

/** What a deed is about, as one string: two deeds are the same when the kind and the thing agree. */
function deedKey(deed: LeadTrigger): string {
  switch (deed.kind) {
    case 'clue':
      return `clue:${deed.clueId}`;
    case 'talk':
      return `talk:${deed.suspectId}`;
    case 'lie':
      return `lie:${deed.lieId}`;
    case 'deduction':
      return `deduction:${deed.deductionId}`;
    case 'locals':
      return `locals:${deed.locationId}`;
    case 'study':
      return `study:${deed.clueId}`;
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(deed);
  }
}
