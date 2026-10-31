// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { CLIMATE_ZONES, ClimateProfileSchema, REGION_ZONES, ZONE_PROFILES, climateFor } from './climate.js';
import { NAME_REGIONS } from './name-generator.js';

describe('the profiles of the zones', () => {
  it('have one valid profile for every zone, in that zone', () => {
    for (const zone of CLIMATE_ZONES) {
      expect(ClimateProfileSchema.safeParse(ZONE_PROFILES[zone]).success).toBe(true);
      expect(ZONE_PROFILES[zone].zone).toBe(zone);
    }
  });

  it('name no disaster among the hazards', () => {
    const hazards = Object.values(ZONE_PROFILES).flatMap((profile) => profile.hazards);

    expect(hazards.join(' ')).not.toMatch(/flood|fire|quake|tsunami/);
  });
});

describe('ClimateProfileSchema', () => {
  const profile = ZONE_PROFILES.arid;

  it('refuses a season or a hazard listed twice, too few or too many seasons, and any unknown field', () => {
    const [first] = profile.seasons;
    if (first === undefined) throw new Error('A season was expected.');
    expect(ClimateProfileSchema.safeParse({ ...profile, seasons: [first, first] }).success).toBe(false);
    expect(ClimateProfileSchema.safeParse({ ...profile, seasons: [first] }).success).toBe(false);
    expect(ClimateProfileSchema.safeParse({ ...profile, hazards: ['gale', 'gale'] }).success).toBe(false);
    expect(ClimateProfileSchema.safeParse({ ...profile, hazards: ['a', 'b', 'c', 'd'] }).success).toBe(false);
    expect(ClimateProfileSchema.safeParse({ ...profile, mood: 'grim' }).success).toBe(false);
  });
});

describe('climateFor', () => {
  it('keeps the climate of the real country, whichever way it is written', () => {
    expect(climateFor(['Norway'], 'neutral').zone).toBe('subarctic');
    expect(climateFor(['Россия', 'Russia'], 'island').zone).toBe('continental');
    expect(climateFor(['НОРВЕГИЯ'], 'south').zone).toBe('subarctic');
    expect(climateFor(['The USA', 'US'], 'north').zone).toBe('continental');
    expect(climateFor(['Egypt'], 'north').zone).toBe('arid');
  });

  it('falls back to the zone of the region when the table has no entry', () => {
    for (const region of NAME_REGIONS) {
      expect(climateFor(['Freedonia'], region).zone).toBe(REGION_ZONES[region]);
    }
  });

  it('gives a valid profile every time, and the same one for the same country', () => {
    for (const name of ['Norway', 'Freedonia', 'Egypt', 'Brazil']) {
      const profile = climateFor([name], 'neutral');

      expect(ClimateProfileSchema.safeParse(profile).success).toBe(true);
      expect(climateFor([name], 'neutral')).toEqual(profile);
    }
  });
});
