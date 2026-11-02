// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import type { Obtainable } from '../obtainability.js';

/**
 * A lead is a promise to the hero, so the case must keep it: whatever hides behind one can be reached by earning
 * it, a lead that is false leads to nothing that matters, and nobody the hero has to find lives where only a lead
 * can take them.
 */
export function checkLeads(detectiveCase: DetectiveCase, obtainable: Obtainable): CaseIssue[] {
  const issues: CaseIssue[] = [];
  const leads = detectiveCase.leads ?? [];
  const falseLeadIds = new Set(leads.filter(({ isFalse }) => isFalse).map(({ id }) => id));
  const usedLeadIds = new Set<string>();
  const cluesById = new Map(detectiveCase.clues.map((clue) => [clue.id, clue]));
  const hiddenPlaceIds = new Set<string>();

  const needsLead = (leadId: string, path: string): void => {
    usedLeadIds.add(leadId);
    if (!obtainable.leadIds.has(leadId)) {
      issues.push({
        code: 'unearnable-lead',
        path,
        message: `Lead "${leadId}" can never be earned by this hero, and something is hidden behind it.`,
      });
    }
  };

  detectiveCase.locations.forEach((location, locationIndex) => {
    const where = `locations[${String(locationIndex)}]`;
    if (location.requiresLead !== undefined) {
      hiddenPlaceIds.add(location.id);
      needsLead(location.requiresLead, `${where}.requiresLead`);
      if (location.id === detectiveCase.startLocationId) {
        issues.push({
          code: 'hidden-start',
          path: `${where}.requiresLead`,
          message: 'The place the hero starts in is known from the first minute: it cannot wait for a lead.',
        });
      }
      const holdsTruth = detectiveCase.clues.some(
        (clue) => clue.locationId === location.id && !clue.isRedHerring,
      );
      if (falseLeadIds.has(location.requiresLead) && holdsTruth) {
        issues.push({
          code: 'false-lead-holds-clue',
          path: `${where}.requiresLead`,
          message: `Lead "${location.requiresLead}" is false, but "${location.id}" holds a clue that is not a red herring.`,
        });
      }
    }
    (location.parts ?? []).forEach((part, partIndex) => {
      const path = `${where}.parts[${String(partIndex)}]`;
      if (part.requiresLead !== null) {
        needsLead(part.requiresLead, `${path}.requiresLead`);
        const held = part.holds === null ? undefined : cluesById.get(part.holds);
        if (falseLeadIds.has(part.requiresLead) && held !== undefined && !held.isRedHerring) {
          issues.push({
            code: 'false-lead-holds-clue',
            path: `${path}.requiresLead`,
            message: `Lead "${part.requiresLead}" is false, but part "${part.id}" holds a clue that is not a red herring.`,
          });
        }
      }
      if (part.fallback?.kind === 'lead') needsLead(part.fallback.leadId, `${path}.fallback`);
    });
  });

  detectiveCase.suspects.forEach((suspect, index) => {
    if (suspect.locationId !== undefined && hiddenPlaceIds.has(suspect.locationId)) {
      issues.push({
        code: 'suspect-in-hidden-place',
        path: `suspects[${String(index)}].locationId`,
        message: `Suspect "${suspect.id}" is at "${suspect.locationId}", which the hero does not know until a lead names it.`,
      });
    }
  });

  leads.forEach((lead, index) => {
    if (!usedLeadIds.has(lead.id)) {
      issues.push({
        code: 'unused-lead',
        path: `leads[${String(index)}]`,
        message: `Lead "${lead.id}" opens nothing: name it in the requiresLead of a place or a part.`,
      });
    }
  });
  return issues;
}
