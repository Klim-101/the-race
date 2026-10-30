// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Trait } from '../traits.js';

export const DETECTIVE_TRAITS: readonly Trait[] = [
  {
    id: 'former-accountant',
    trigger: 'financial-documents',
    effect: { kind: 'modifier', skills: ['logic', 'observation'], amount: 3 },
  },
  { id: 'debtor', trigger: 'second-day', effect: { kind: 'spawn-event', event: 'debt-collector' } },
  { id: 'photographic-memory', trigger: 'reinspection', effect: { kind: 'auto-discover' } },
  { id: 'claustrophobe', trigger: 'confined-space', effect: { kind: 'modifier', skills: 'all', amount: -3 } },
  {
    id: 'old-enemy-in-the-police',
    trigger: 'police-contact',
    effect: { kind: 'lock-out', source: 'police-data' },
  },
];
