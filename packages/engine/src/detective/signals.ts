// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { defineSignal } from '../signals.js';

// The first signals of the detective, three to show what the data can say; the real set is a content task.
// A partner is a role and never a name: the name, like the wording of every message, is not the engine's.

export const IN_LOVE = defineSignal({
  id: 'in-love',
  voice: 'warm-distracted',
  gift: 'someone-to-come-back-to',
  cost: 'a-bad-word-hurts-more',
  modifiers: [{ trigger: 'interrogation', skills: ['social'], amount: 1 }],
  events: [
    {
      id: 'partner-message',
      chance: 40,
      role: 'partner',
      variants: [
        {
          tone: 'encouraging',
          kind: 'partner-message-warm',
          weight: 2,
          effects: [{ kind: 'meter', meter: 'nerves', delta: 2 }],
        },
        {
          // More than the usual one point of a scare: a harsh word from the person who matters costs more.
          tone: 'demoralising',
          kind: 'partner-message-cold',
          weight: 1,
          effects: [{ kind: 'meter', meter: 'nerves', delta: -3 }],
        },
      ],
    },
  ],
});

export const BURNT_OUT = defineSignal({
  id: 'burnt-out',
  voice: 'flat-dry',
  gift: 'nothing-left-to-lose',
  cost: 'never-fully-rested',
  modifiers: [{ skills: ['social'], amount: -1 }],
  meters: [
    // Pressure no longer frays the nerves, and fatigue builds up slower; but the hero never feels fresh.
    { meter: 'nerves', cap: 8, ignores: ['failure'] },
    { meter: 'sleep-debt', drift: -1 },
  ],
});

export const FEELING_LOW = defineSignal({
  id: 'feeling-low',
  voice: 'quiet-heavy',
  gift: 'brooding-sees-more',
  cost: 'dull-senses',
  modifiers: [
    { skills: ['perception'], amount: -1 },
    { trigger: 'night', skills: ['reasoning'], amount: 1 },
  ],
  events: [
    {
      // A cold: it lasts until the next night, which cures it.
      id: 'a-cold',
      chance: 20,
      variants: [
        {
          tone: 'neutral',
          kind: 'caught-a-cold',
          weight: 1,
          effects: [{ kind: 'condition', condition: 'exhausted' }],
        },
      ],
    },
  ],
});

export const DETECTIVE_SIGNALS = [IN_LOVE, BURNT_OUT, FEELING_LOW];
