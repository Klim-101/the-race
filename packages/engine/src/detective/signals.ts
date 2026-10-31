// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { defineSignal } from '../signals.js';

// The signals of the detective: moods and circumstances, each with a gift and a cost. Modifiers, a rule on a
// meter and events are all the data they need, so a new one is a few lines and no code.
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

export const RESTLESS = defineSignal({
  id: 'restless',
  voice: 'jittery-quick',
  gift: 'quick-to-notice',
  cost: 'cannot-switch-off',
  // Eyes everywhere; and a mind that does not let the body sleep, so the debt grows by a point each night.
  modifiers: [{ skills: ['perception'], amount: 1 }],
  meters: [{ meter: 'sleep-debt', drift: 1 }],
});

export const OVERCONFIDENT = defineSignal({
  id: 'overconfident',
  voice: 'brisk-cocky',
  gift: 'sure-of-the-room',
  cost: 'brushes-off-doubt',
  // Leans on people with ease; and does not look twice at a place already searched.
  modifiers: [
    { skills: ['pressure'], amount: 1 },
    { trigger: 'reinspection', skills: ['perception', 'reasoning'], amount: -1 },
  ],
});

export const HOMESICK = defineSignal({
  id: 'homesick',
  voice: 'wistful-soft',
  gift: 'a-letter-now-and-then',
  cost: 'mind-far-away',
  // At home in a crowd of strangers, as long as the first day lasts; from the second the mind drifts.
  modifiers: [
    { trigger: 'crowd', skills: ['social'], amount: 1 },
    { trigger: 'second-day', skills: ['perception'], amount: -1 },
  ],
  events: [
    {
      id: 'letter-from-home',
      chance: 30,
      fromDay: 2,
      role: 'family',
      variants: [
        {
          tone: 'encouraging',
          kind: 'letter-from-home-warm',
          weight: 2,
          effects: [{ kind: 'meter', meter: 'nerves', delta: 2 }],
        },
        {
          tone: 'demoralising',
          kind: 'letter-from-home-wistful',
          weight: 1,
          effects: [{ kind: 'meter', meter: 'nerves', delta: -1 }],
        },
      ],
    },
  ],
});

export const IN_A_HURRY = defineSignal({
  id: 'in-a-hurry',
  voice: 'clipped-brisk',
  gift: 'no-time-to-waste',
  cost: 'rushes-the-details',
  // Calls in favours before the other side has finished picking up; and skims the columns of a ledger.
  modifiers: [
    { skills: ['contacts'], amount: 1 },
    { trigger: 'financial-documents', skills: ['reasoning'], amount: -1 },
  ],
});

export const DETECTIVE_SIGNALS = [
  IN_LOVE,
  BURNT_OUT,
  FEELING_LOW,
  RESTLESS,
  OVERCONFIDENT,
  HOMESICK,
  IN_A_HURRY,
];
