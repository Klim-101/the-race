// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveHero } from '../../src/detective/archetype.js';

/**
 * A small solvable case: the baker stole the festival cheese wheel to pay off the oven.
 * Chain 0 needs only perception; chain 1 needs social the default hero lacks.
 */
export function buildCheeseCase(): Record<string, unknown> & {
  locations: Record<string, unknown>[];
  clues: Record<string, unknown>[];
  suspects: (Record<string, unknown> & { lies: Record<string, unknown>[] })[];
  deductions: Record<string, unknown>[];
  truth: Record<string, unknown> & { timeline: Record<string, unknown>[] };
  solution: { motiveDeductionId: string; evidenceChains: string[][] };
  clock: { days: number; worldEvents: Record<string, unknown>[] };
} {
  return {
    schemaVersion: 1,
    locale: 'en',
    crimeType: 'curious-theft',
    tone: 'absurd',
    title: 'The Vanishing Wheel of Elmwick',
    premise: 'On the morning of the harvest fair, the giant cheese wheel is gone from its stall.',
    startLocationId: 'market-square',
    locations: [
      {
        id: 'market-square',
        name: 'Market square',
        description: 'Stalls, bunting and a crowd that smells of mustard.',
        connections: ['cheese-stall', 'storage-cellar'],
        access: { kind: 'open' },
      },
      {
        id: 'cheese-stall',
        name: 'Cheese stall',
        description: 'An empty plinth where the wheel used to sit.',
        connections: ['mayor-office'],
        access: { kind: 'open' },
      },
      {
        id: 'storage-cellar',
        name: 'Storage cellar',
        description: 'Cold, damp and locked with a rusty padlock.',
        connections: [],
        access: { kind: 'clue', clueId: 'cellar-key' },
      },
      {
        id: 'mayor-office',
        name: 'Mayor office',
        description: 'A secretary guards the door like a dragon guards gold.',
        connections: [],
        access: { kind: 'skill', check: { skill: 'social', difficulty: 12 } },
      },
    ],
    clues: [
      {
        id: 'cellar-key',
        locationId: 'market-square',
        description: 'A rusty key dropped next to the fountain.',
        discovery: null,
        pointsTo: [],
        isRedHerring: false,
      },
      {
        id: 'flour-crumbs',
        locationId: 'cheese-stall',
        description: 'Flour on the plinth, though nobody bakes at a cheese stall.',
        discovery: { skill: 'perception', difficulty: 10 },
        pointsTo: ['baker'],
        isRedHerring: false,
      },
      {
        id: 'cart-tracks',
        locationId: 'storage-cellar',
        description: 'Round tracks of something heavy rolled into the cellar.',
        discovery: { skill: 'perception', difficulty: 8 },
        pointsTo: ['baker'],
        isRedHerring: false,
      },
      {
        id: 'oven-receipt',
        locationId: 'mayor-office',
        description: 'An unpaid receipt for a festival oven, signed by the baker.',
        discovery: { skill: 'reasoning', difficulty: 12 },
        pointsTo: ['baker'],
        isRedHerring: false,
      },
      {
        id: 'debt-ledger',
        locationId: 'mayor-office',
        description: 'A ledger with the baker in red ink on every page.',
        discovery: null,
        pointsTo: ['baker'],
        isRedHerring: false,
      },
      {
        id: 'blue-glove',
        locationId: 'cheese-stall',
        description: 'A blue glove of the kind the rival cheesemaker wears.',
        discovery: null,
        pointsTo: ['rival'],
        isRedHerring: true,
      },
    ],
    suspects: [
      {
        id: 'baker',
        locationId: 'cheese-stall',
        name: 'Orla Brenn',
        persona: 'A cheerful baker with flour up to the elbows.',
        secret: 'She owes the town for an oven she cannot pay for.',
        alibi: 'Says she was asleep at home all night.',
        lies: [
          { id: 'baker-asleep', statement: 'I never left my house last night.', brokenBy: ['cart-tracks'] },
        ],
      },
      {
        id: 'rival',
        locationId: 'market-square',
        name: 'Gustav Holm',
        persona: 'A rival cheesemaker who lost the fair contract.',
        secret: 'He sneaked into the fair to taste the competition.',
        alibi: 'Claims he was in another town.',
        lies: [{ id: 'rival-away', statement: 'I was not even in town.', brokenBy: ['blue-glove'] }],
      },
      {
        id: 'mayor',
        name: 'Mayor Elsa Vik',
        persona: 'A mayor who cares about the fair more than about people.',
        secret: 'She promised the cheese to a buyer from abroad.',
        alibi: 'Was at a dinner with the council.',
        lies: [],
      },
    ],
    deductions: [
      {
        id: 'motive-debt',
        clueIds: ['oven-receipt', 'debt-ledger'],
        insight: 'The baker needed money fast, and the wheel is worth a fortune.',
      },
    ],
    truth: {
      culpritId: 'baker',
      motive: 'Pay off the festival oven before the town seizes her bakery.',
      method: 'Rolled the wheel into the cellar at night and planned to sell it later.',
      crimeLocationId: 'cheese-stall',
      crimeAtMinute: 120,
      timeline: [
        { atMinute: 100, actorId: 'baker', locationId: 'storage-cellar', action: 'Opens the cellar.' },
        { atMinute: 120, actorId: 'baker', locationId: 'cheese-stall', action: 'Rolls the wheel away.' },
        { atMinute: 120, actorId: 'rival', locationId: 'market-square', action: 'Tastes a sample.' },
      ],
    },
    solution: {
      motiveDeductionId: 'motive-debt',
      evidenceChains: [
        ['flour-crumbs', 'cart-tracks'],
        ['oven-receipt', 'debt-ledger'],
      ],
    },
    clock: {
      days: 3,
      worldEvents: [{ day: 2, description: 'A cheese shortage hits the northern provinces.' }],
    },
  };
}

/** Trained in perception and reasoning, untrained in social. */
export function buildHero(): DetectiveHero {
  return {
    name: 'Mira Kos',
    gender: 'female',
    archetype: 'detective',
    skills: { perception: 3, reasoning: 2, social: 0, pressure: 1, tech: 2, contacts: 2 },
  };
}
