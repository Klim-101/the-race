// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { climateFor } from './climate.js';
import { chooseSetting } from './setting.js';
import { EMPTY_WORLD, proposeEntry, type World, type WorldProposal } from './world.js';

function worldOf(proposals: WorldProposal[]): World {
  return proposals.reduce((world, proposal) => {
    const added = proposeEntry(world, proposal);
    if (!added.ok) throw new Error('The test world must be valid.');
    return added.world;
  }, EMPTY_WORLD);
}

const country = (en: string, ru: string, real: string): WorldProposal => ({
  kind: 'country',
  real: [real],
  mirror: { en, ru },
  climate: climateFor([real], 'neutral'),
});

describe('chooseSetting', () => {
  it('has no setting in a world without a country that has a climate', () => {
    const company: WorldProposal = {
      kind: 'organisation',
      real: ['Gazprom'],
      mirror: { en: 'Brightfen', ru: 'Брайтфен' },
    };
    const bare: WorldProposal = {
      kind: 'country',
      real: ['Norway'],
      mirror: { en: 'Valdmark', ru: 'Вальдмарк' },
    };

    expect(chooseSetting(EMPTY_WORLD, 'run-1')).toBeUndefined();
    expect(chooseSetting(worldOf([company, bare]), 'run-1')).toBeUndefined();
  });

  it('is set in a country with its mirror name and the climate of the real one', () => {
    const world = worldOf([country('Valdmark', 'Вальдмарк', 'Norway')]);

    expect(chooseSetting(world, 'run-1')).toEqual({
      id: 'valdmark',
      name: { en: 'Valdmark', ru: 'Вальдмарк' },
      climate: climateFor(['Norway'], 'neutral'),
    });
  });

  it('picks the same country for the same seed, and not always the same one across seeds', () => {
    const world = worldOf([
      country('Valdmark', 'Вальдмарк', 'Norway'),
      country('Kessarin', 'Кессарин', 'Egypt'),
      country('Tavrenia', 'Таврения', 'Brazil'),
    ]);
    const ids = Array.from({ length: 60 }, (_, index) => chooseSetting(world, `run-${String(index)}`)?.id);

    expect(chooseSetting(world, 'run-7')).toEqual(chooseSetting(world, 'run-7'));
    expect(new Set(ids).size).toBe(3);
  });
});
