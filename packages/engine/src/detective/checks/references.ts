// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

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
  });
  detectiveCase.clues.forEach((clue, index) => {
    expect(locationIds, 'location', clue.locationId, `clues[${String(index)}].locationId`);
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
    });
  });
  detectiveCase.deductions.forEach((deduction, index) => {
    deduction.clueIds.forEach((id, clueIndex) => {
      expect(clueIds, 'clue', id, `deductions[${String(index)}].clueIds[${String(clueIndex)}]`);
    });
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
