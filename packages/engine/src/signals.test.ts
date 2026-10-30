// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createRng } from './dice.js';
import { defineMeter } from './meters.js';
import { collectModifier } from './modifiers.js';
import {
  MAX_SIGNAL_EVENTS,
  SignalSchema,
  defineSignal,
  drawVariant,
  findSignal,
  signalCap,
  signalIgnores,
  signalModifier,
  type SignalInput,
} from './signals.js';

const BASE = { id: 'steady', voice: 'calm', gift: 'a-gift', cost: 'a-cost' };
const EVENT = {
  id: 'news',
  chance: 50,
  variants: [
    { tone: 'encouraging', kind: 'good-news', weight: 3, effects: [{ kind: 'meter', meter: 'x', delta: 1 }] },
    {
      tone: 'demoralising',
      kind: 'bad-news',
      weight: 1,
      effects: [{ kind: 'meter', meter: 'x', delta: -1 }],
    },
  ],
} as const satisfies NonNullable<SignalInput['events']>[number];
const METER = defineMeter({ id: 'x', max: 10, start: 10 });

describe('defineSignal', () => {
  it('fills in defaults and keeps what the data says', () => {
    const signal = defineSignal({ ...BASE, modifiers: [{ skills: 'all', amount: 1 }] });

    expect(signal.meters).toEqual([]);
    expect(signal.events).toEqual([]);
  });

  it('refuses a signal that does nothing, or whose parts do nothing', () => {
    expect(SignalSchema.safeParse(BASE).success).toBe(false);
    expect(SignalSchema.safeParse({ ...BASE, meters: [{ meter: 'x' }] }).success).toBe(false);
    expect(SignalSchema.safeParse({ ...BASE, meters: [{ meter: 'x', drift: 0 }] }).success).toBe(false);
    expect(SignalSchema.safeParse({ ...BASE, modifiers: [{ skills: 'all', amount: 0 }] }).success).toBe(
      false,
    );
    const noop = {
      ...EVENT,
      variants: [{ ...EVENT.variants[0], effects: [{ kind: 'meter', meter: 'x', delta: 0 }] }],
    };
    expect(SignalSchema.safeParse({ ...BASE, events: [noop] }).success).toBe(false);
  });

  it('needs a voice, a gift and a cost, all as ids', () => {
    const modifiers = [{ skills: 'all', amount: 1 }];

    expect(SignalSchema.safeParse({ ...BASE, modifiers, voice: 'Not Kebab' }).success).toBe(false);
    expect(SignalSchema.safeParse({ ...BASE, modifiers, gift: undefined }).success).toBe(false);
    expect(SignalSchema.safeParse({ ...BASE, modifiers, cost: '' }).success).toBe(false);
  });

  it('keeps the events within the budget and the kinds of an event distinct', () => {
    const many = Array.from({ length: MAX_SIGNAL_EVENTS + 1 }, (_, index) => ({
      ...EVENT,
      id: `e${String(index)}`,
    }));
    const twins = { ...EVENT, variants: [EVENT.variants[0], EVENT.variants[0]] };

    expect(SignalSchema.safeParse({ ...BASE, events: many }).success).toBe(false);
    expect(SignalSchema.safeParse({ ...BASE, events: [twins] }).success).toBe(false);
    expect(SignalSchema.safeParse({ ...BASE, events: [EVENT] }).success).toBe(true);
  });
});

describe('findSignal', () => {
  const signal = defineSignal({ ...BASE, events: [EVENT] });

  it('finds a signal by id and returns nothing for none or an unknown id', () => {
    expect(findSignal([signal], 'steady')).toBe(signal);
    expect(findSignal([signal], 'other')).toBeUndefined();
    expect(findSignal([signal], undefined)).toBeUndefined();
  });
});

describe('signalModifier', () => {
  const signal = defineSignal({
    ...BASE,
    modifiers: [
      { skills: ['perception'], amount: -1 },
      { trigger: 'night', skills: 'all', amount: 2 },
    ],
  });

  it('applies a modifier without a trigger always, and one with a trigger only in that situation', () => {
    expect(signalModifier(signal, [], 'perception')).toBe(-1);
    expect(signalModifier(signal, [], 'social')).toBe(0);
    expect(signalModifier(signal, ['night'], 'perception')).toBe(1);
    expect(signalModifier(signal, ['night'], 'social')).toBe(2);
    expect(signalModifier(signal, ['crowd'], 'social')).toBe(0);
  });

  it('is zero for a hero without a signal', () => {
    expect(signalModifier(undefined, ['night'], 'perception')).toBe(0);
  });

  it('goes into the one total of a check beside the other sources', () => {
    expect(collectModifier({ signal }, 'perception', ['night'])).toBe(1);
    expect(collectModifier({ signal: undefined }, 'perception', ['night'])).toBe(0);
  });
});

describe('the rules on a meter', () => {
  const signal = defineSignal({
    ...BASE,
    meters: [
      { meter: 'x', cap: 7, ignores: ['failure'] },
      { meter: 'y', drift: 1 },
    ],
  });

  it('knows what a signal ignores, for which meter and which reason', () => {
    expect(signalIgnores(signal, 'x', 'failure')).toBe(true);
    expect(signalIgnores(signal, 'x', 'hour')).toBe(false);
    expect(signalIgnores(signal, 'y', 'failure')).toBe(false);
    expect(signalIgnores(undefined, 'x', 'failure')).toBe(false);
  });

  it('caps a meter at the lower of its own maximum and the signal’s cap', () => {
    expect(signalCap(signal, METER)).toBe(7);
    expect(signalCap(signal, defineMeter({ id: 'x', max: 5, start: 5 }))).toBe(5);
    expect(signalCap(signal, defineMeter({ id: 'y', max: 10, start: 0 }))).toBe(10);
    expect(signalCap(undefined, METER)).toBe(10);
  });
});

describe('drawVariant', () => {
  const event = defineSignal({ ...BASE, events: [EVENT] }).events[0];
  if (event === undefined) throw new Error('The fixture has an event.');

  it('is the same for the same dice and uses one die', () => {
    const first = createRng('v');
    const second = createRng('v');

    expect(drawVariant(event, first)).toEqual(drawVariant(event, second));
    const after = createRng('v');
    after.roll(4);
    expect(first.state()).toBe(after.state());
  });

  it('follows the weights of the data over many seeds', () => {
    let warm = 0;
    const runs = 4000;
    for (let seed = 0; seed < runs; seed += 1) {
      if (drawVariant(event, createRng(seed)).tone === 'encouraging') warm += 1;
    }

    expect(warm / runs).toBeGreaterThan(0.7);
    expect(warm / runs).toBeLessThan(0.8);
  });
});
