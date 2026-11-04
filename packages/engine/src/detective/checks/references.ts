// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from '../../assert-never.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';

interface IdentifiedEntity {
  readonly id: string;
  readonly path: string;
}

/** Every id is unique across the case, and every reference names an entity of the right kind. */
export function checkReferences(detectiveCase: DetectiveCase): CaseIssue[] {
  return [...checkUniqueIds(detectiveCase), ...checkReferencesResolve(detectiveCase)];
}

function checkUniqueIds(detectiveCase: DetectiveCase): CaseIssue[] {
  const entities: IdentifiedEntity[] = [
    ...detectiveCase.locations.map((location, index) => ({
      id: location.id,
      path: `locations[${String(index)}].id`,
    })),
    ...detectiveCase.locations.flatMap((location, locationIndex) =>
      (location.parts ?? []).map((part, partIndex) => ({
        id: part.id,
        path: `locations[${String(locationIndex)}].parts[${String(partIndex)}].id`,
      })),
    ),
    ...(detectiveCase.leads ?? []).map((lead, index) => ({
      id: lead.id,
      path: `leads[${String(index)}].id`,
    })),
    ...(detectiveCase.witnesses ?? []).map((witness, index) => ({
      id: witness.id,
      path: `witnesses[${String(index)}].id`,
    })),
    ...detectiveCase.clues.map((clue, index) => ({ id: clue.id, path: `clues[${String(index)}].id` })),
    ...detectiveCase.suspects.flatMap((suspect, suspectIndex) => [
      { id: suspect.id, path: `suspects[${String(suspectIndex)}].id` },
      ...suspect.lies.map((lie, lieIndex) => ({
        id: lie.id,
        path: `suspects[${String(suspectIndex)}].lies[${String(lieIndex)}].id`,
      })),
    ]),
    ...detectiveCase.deductions.map((deduction, index) => ({
      id: deduction.id,
      path: `deductions[${String(index)}].id`,
    })),
  ];
  const seenIds = new Set<string>();
  const issues: CaseIssue[] = [];
  for (const entity of entities) {
    if (seenIds.has(entity.id)) {
      issues.push({ code: 'duplicate-id', path: entity.path, message: `Id "${entity.id}" is already used.` });
    }
    seenIds.add(entity.id);
  }
  return issues;
}

function checkReferencesResolve(detectiveCase: DetectiveCase): CaseIssue[] {
  const locationIds = new Set(detectiveCase.locations.map((location) => location.id));
  const clueIds = new Set(detectiveCase.clues.map((clue) => clue.id));
  const suspectIds = new Set(detectiveCase.suspects.map((suspect) => suspect.id));
  const deductionIds = new Set(detectiveCase.deductions.map((deduction) => deduction.id));
  const leadIds = new Set((detectiveCase.leads ?? []).map((lead) => lead.id));
  const lieIds = new Set(detectiveCase.suspects.flatMap(({ lies }) => lies.map(({ id }) => id)));
  const issues: CaseIssue[] = [];
  const expect = (knownIds: ReadonlySet<string>, kind: string, id: string, path: string): void => {
    if (!knownIds.has(id))
      issues.push({ code: 'unknown-reference', path, message: `Unknown ${kind} "${id}".` });
  };

  expect(locationIds, 'location', detectiveCase.startLocationId, 'startLocationId');
  detectiveCase.locations.forEach((location, index) => {
    location.connections.forEach((id, connectionIndex) => {
      expect(
        locationIds,
        'location',
        id,
        `locations[${String(index)}].connections[${String(connectionIndex)}]`,
      );
    });
    if (location.access.kind === 'clue') {
      expect(clueIds, 'clue', location.access.clueId, `locations[${String(index)}].access.clueId`);
    }
    if (location.requiresLead !== undefined) {
      expect(leadIds, 'lead', location.requiresLead, `locations[${String(index)}].requiresLead`);
    }
    (location.parts ?? []).forEach((part, partIndex) => {
      const path = `locations[${String(index)}].parts[${String(partIndex)}]`;
      if (part.holds !== null) expect(clueIds, 'clue', part.holds, `${path}.holds`);
      if (part.requiresLead !== null) expect(leadIds, 'lead', part.requiresLead, `${path}.requiresLead`);
      if (part.fallback?.kind === 'ask') {
        expect(suspectIds, 'suspect', part.fallback.suspectId, `${path}.fallback.suspectId`);
      }
      if (part.fallback?.kind === 'lead') {
        expect(leadIds, 'lead', part.fallback.leadId, `${path}.fallback.leadId`);
      }
    });
  });
  (detectiveCase.witnesses ?? []).forEach((witness, index) => {
    expect(locationIds, 'location', witness.locationId, `witnesses[${String(index)}].locationId`);
  });
  detectiveCase.clues.forEach((clue, index) => {
    expect(locationIds, 'location', clue.locationId, `clues[${String(index)}].locationId`);
    (clue.about ?? []).forEach((id, aboutIndex) => {
      expect(suspectIds, 'suspect', id, `clues[${String(index)}].about[${String(aboutIndex)}]`);
    });
    clue.pointsTo.forEach((id, pointIndex) => {
      expect(suspectIds, 'suspect', id, `clues[${String(index)}].pointsTo[${String(pointIndex)}]`);
    });
  });
  detectiveCase.suspects.forEach((suspect, suspectIndex) => {
    if (suspect.locationId !== undefined) {
      expect(locationIds, 'location', suspect.locationId, `suspects[${String(suspectIndex)}].locationId`);
    }
    suspect.lies.forEach((lie, lieIndex) => {
      lie.brokenBy.forEach((id, clueIndex) => {
        const path = `suspects[${String(suspectIndex)}].lies[${String(lieIndex)}].brokenBy[${String(clueIndex)}]`;
        expect(clueIds, 'clue', id, path);
      });
      (lie.brokenByInsights ?? []).forEach((id, insightIndex) => {
        const path = `suspects[${String(suspectIndex)}].lies[${String(lieIndex)}].brokenByInsights[${String(insightIndex)}]`;
        expect(deductionIds, 'deduction', id, path);
      });
      const liePath = `suspects[${String(suspectIndex)}].lies[${String(lieIndex)}]`;
      if (lie.after !== undefined) expect(lieIds, 'lie', lie.after, `${liePath}.after`);
      if (lie.gives !== undefined) expect(clueIds, 'clue', lie.gives, `${liePath}.gives`);
    });
  });
  detectiveCase.deductions.forEach((deduction, index) => {
    if (deduction.clears !== undefined) {
      expect(suspectIds, 'suspect', deduction.clears, `deductions[${String(index)}].clears`);
    }
    deduction.clueIds.forEach((id, clueIndex) => {
      expect(clueIds, 'clue', id, `deductions[${String(index)}].clueIds[${String(clueIndex)}]`);
    });
  });

  (detectiveCase.leads ?? []).forEach((lead, index) => {
    const path = `leads[${String(index)}].earnedBy`;
    const { earnedBy } = lead;
    switch (earnedBy.kind) {
      case 'clue':
        expect(clueIds, 'clue', earnedBy.clueId, `${path}.clueId`);
        break;
      case 'talk':
        expect(suspectIds, 'suspect', earnedBy.suspectId, `${path}.suspectId`);
        break;
      case 'lie':
        expect(lieIds, 'lie', earnedBy.lieId, `${path}.lieId`);
        break;
      case 'deduction':
        expect(deductionIds, 'deduction', earnedBy.deductionId, `${path}.deductionId`);
        break;
      case 'locals':
        expect(locationIds, 'location', earnedBy.locationId, `${path}.locationId`);
        break;
      case 'study':
        expect(clueIds, 'clue', earnedBy.clueId, `${path}.clueId`);
        break;
      /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
      default:
        assertNever(earnedBy);
    }
  });

  detectiveCase.clock.worldEvents.forEach((event, index) => {
    if (event.effect?.kind === 'location-closes') {
      expect(
        locationIds,
        'location',
        event.effect.locationId,
        `clock.worldEvents[${String(index)}].effect.locationId`,
      );
    }
  });

  const { truth, solution } = detectiveCase;
  expect(suspectIds, 'suspect', truth.culpritId, 'truth.culpritId');
  expect(locationIds, 'location', truth.crimeLocationId, 'truth.crimeLocationId');
  truth.timeline.forEach((entry, index) => {
    expect(suspectIds, 'suspect', entry.actorId, `truth.timeline[${String(index)}].actorId`);
    expect(locationIds, 'location', entry.locationId, `truth.timeline[${String(index)}].locationId`);
  });
  expect(deductionIds, 'deduction', solution.motiveDeductionId, 'solution.motiveDeductionId');
  solution.evidenceChains.forEach((chain, chainIndex) => {
    chain.forEach((id, clueIndex) => {
      expect(clueIds, 'clue', id, `solution.evidenceChains[${String(chainIndex)}][${String(clueIndex)}]`);
    });
  });
  return issues;
}
