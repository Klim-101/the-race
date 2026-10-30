// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { TraitSchema, type Trait } from '../traits.js';

// Parsed so that a catalogue entry whose polarity disagrees with its effects fails on load.
export const DETECTIVE_TRAITS: readonly Trait[] = [
  {
    id: 'former-accountant',
    polarity: 'positive',
    trigger: 'financial-documents',
    effects: [{ kind: 'modifier', skills: ['reasoning', 'perception'], amount: 3 }],
    excludes: ['sloppy-with-paperwork'],
  },
  {
    id: 'photographic-memory',
    polarity: 'positive',
    trigger: 'reinspection',
    effects: [{ kind: 'auto-discover' }],
  },
  {
    id: 'ex-hacker',
    polarity: 'positive',
    trigger: 'digital-evidence',
    effects: [{ kind: 'modifier', skills: ['tech'], amount: 3 }],
    excludes: ['technophobe'],
  },
  {
    id: 'well-connected',
    polarity: 'positive',
    trigger: 'high-society',
    effects: [{ kind: 'modifier', skills: ['contacts', 'social'], amount: 3 }],
  },
  {
    id: 'night-owl',
    polarity: 'positive',
    trigger: 'night',
    effects: [{ kind: 'modifier', skills: 'all', amount: 2 }],
    excludes: ['insomniac'],
  },
  {
    id: 'people-reader',
    polarity: 'positive',
    trigger: 'interrogation',
    effects: [{ kind: 'modifier', skills: ['social', 'pressure'], amount: 2 }],
    excludes: ['hothead'],
  },
  {
    id: 'debtor',
    polarity: 'negative',
    trigger: 'second-day',
    effects: [{ kind: 'spawn-event', event: 'debt-collector' }],
  },
  {
    id: 'claustrophobe',
    polarity: 'negative',
    trigger: 'confined-space',
    effects: [{ kind: 'modifier', skills: 'all', amount: -3 }],
  },
  {
    id: 'old-enemy-in-the-police',
    polarity: 'negative',
    trigger: 'police-contact',
    effects: [{ kind: 'lock-out', source: 'police-data' }],
  },
  {
    id: 'technophobe',
    polarity: 'negative',
    trigger: 'digital-evidence',
    effects: [{ kind: 'modifier', skills: ['tech'], amount: -3 }],
  },
  {
    id: 'stage-fright',
    polarity: 'negative',
    trigger: 'crowd',
    effects: [{ kind: 'modifier', skills: ['social', 'pressure'], amount: -2 }],
    excludes: ['showman'],
  },
  {
    id: 'sloppy-with-paperwork',
    polarity: 'negative',
    trigger: 'financial-documents',
    effects: [{ kind: 'modifier', skills: ['reasoning'], amount: -3 }],
  },
  {
    id: 'hothead',
    polarity: 'mixed',
    trigger: 'interrogation',
    effects: [
      { kind: 'modifier', skills: ['pressure'], amount: 3 },
      { kind: 'modifier', skills: ['social'], amount: -2 },
    ],
  },
  {
    id: 'insomniac',
    polarity: 'mixed',
    trigger: 'night',
    effects: [
      { kind: 'modifier', skills: ['perception'], amount: 3 },
      { kind: 'modifier', skills: ['reasoning'], amount: -2 },
    ],
  },
  {
    id: 'showman',
    polarity: 'mixed',
    trigger: 'crowd',
    effects: [
      { kind: 'modifier', skills: ['social'], amount: 3 },
      { kind: 'modifier', skills: ['perception'], amount: -2 },
    ],
  },
].map((trait) => TraitSchema.parse(trait));
