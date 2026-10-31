// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { NameRegion } from './name-generator.js';

// A mirrored country keeps the climate of the real one: the substance is kept, the names are not. The profile
// is made of ids and the words for them live in the locale files, so nothing here is player-facing text.

export const CLIMATE_ZONES = [
  'polar',
  'subarctic',
  'oceanic',
  'continental',
  'mediterranean',
  'subtropical',
  'tropical-wet',
  'tropical-dry',
  'arid',
  'highland',
] as const;
export const ClimateZoneSchema = z.enum(CLIMATE_ZONES);
export type ClimateZone = z.infer<typeof ClimateZoneSchema>;

export const SEASONS = ['winter', 'spring', 'summer', 'autumn', 'dry-season', 'wet-season'] as const;
export const SeasonSchema = z.enum(SEASONS);
export type Season = z.infer<typeof SeasonSchema>;

export const WEATHERS = [
  'frost',
  'snow',
  'cold-rain',
  'mild',
  'warm',
  'hot',
  'humid',
  'storms',
  'dry-heat',
  'windy',
  'fog',
] as const;
export const WeatherSchema = z.enum(WEATHERS);
export type Weather = z.infer<typeof WeatherSchema>;

/**
 * Nuisances of the weather that a case can lean on: a road shut by snow, a day lost to fog. None of them is a
 * disaster, since the tragedy filter keeps disasters out of the game.
 */
export const HAZARDS = [
  'blizzard',
  'ice',
  'heavy-rain',
  'heatwave',
  'drought',
  'gale',
  'fog',
  'dust-wind',
] as const;
export const HazardSchema = z.enum(HAZARDS);
export type Hazard = z.infer<typeof HazardSchema>;

const uniqueBy = <T>(items: readonly T[], key: (item: T) => string): boolean =>
  new Set(items.map(key)).size === items.length;

export const ClimateProfileSchema = z
  .strictObject({
    zone: ClimateZoneSchema,
    seasons: z
      .array(z.strictObject({ id: SeasonSchema, weather: WeatherSchema }))
      .min(2)
      .max(4),
    hazards: z.array(HazardSchema).max(3),
  })
  .refine(({ seasons }) => uniqueBy(seasons, ({ id }) => id), { message: 'A season is listed once.' })
  .refine(({ hazards }) => uniqueBy(hazards, (hazard) => hazard), { message: 'A hazard is listed once.' });
export type ClimateProfile = z.infer<typeof ClimateProfileSchema>;

const season = (id: (typeof SEASONS)[number], weather: (typeof WEATHERS)[number]) => ({ id, weather });

/** One typical profile for each zone; a country is placed in a zone, not given a profile of its own. */
export const ZONE_PROFILES: Readonly<Record<ClimateZone, ClimateProfile>> = {
  polar: {
    zone: 'polar',
    seasons: [season('winter', 'frost'), season('summer', 'cold-rain')],
    hazards: ['blizzard', 'ice', 'gale'],
  },
  subarctic: {
    zone: 'subarctic',
    seasons: [season('winter', 'snow'), season('spring', 'cold-rain'), season('summer', 'mild')],
    hazards: ['blizzard', 'ice'],
  },
  oceanic: {
    zone: 'oceanic',
    seasons: [season('winter', 'cold-rain'), season('summer', 'mild'), season('autumn', 'windy')],
    hazards: ['gale', 'fog'],
  },
  continental: {
    zone: 'continental',
    seasons: [season('winter', 'snow'), season('spring', 'cold-rain'), season('summer', 'warm')],
    hazards: ['blizzard', 'ice', 'heatwave'],
  },
  mediterranean: {
    zone: 'mediterranean',
    seasons: [season('winter', 'cold-rain'), season('summer', 'dry-heat')],
    hazards: ['heatwave', 'drought'],
  },
  subtropical: {
    zone: 'subtropical',
    seasons: [season('winter', 'mild'), season('summer', 'humid'), season('autumn', 'storms')],
    hazards: ['heavy-rain', 'heatwave'],
  },
  'tropical-wet': {
    zone: 'tropical-wet',
    seasons: [season('wet-season', 'storms'), season('dry-season', 'humid')],
    hazards: ['heavy-rain', 'gale'],
  },
  'tropical-dry': {
    zone: 'tropical-dry',
    seasons: [season('dry-season', 'hot'), season('wet-season', 'storms')],
    hazards: ['drought', 'heavy-rain'],
  },
  arid: {
    zone: 'arid',
    seasons: [season('winter', 'mild'), season('summer', 'dry-heat')],
    hazards: ['heatwave', 'dust-wind', 'drought'],
  },
  highland: {
    zone: 'highland',
    seasons: [season('winter', 'snow'), season('summer', 'mild'), season('autumn', 'fog')],
    hazards: ['ice', 'fog'],
  },
};

/** Where the climate of a country comes from: the real countries of the table, in both languages. */
const COUNTRY_ZONES: readonly {
  readonly zone: ClimateZone;
  readonly names: readonly (readonly string[])[];
}[] = [
  {
    zone: 'polar',
    names: [
      ['Greenland', 'Гренландия'],
      ['Antarctica', 'Антарктида'],
    ],
  },
  {
    zone: 'subarctic',
    names: [
      ['Norway', 'Норвегия'],
      ['Sweden', 'Швеция'],
      ['Finland', 'Финляндия'],
      ['Iceland', 'Исландия'],
      ['Canada', 'Канада'],
    ],
  },
  {
    zone: 'oceanic',
    names: [
      ['Germany', 'Германия'],
      ['France', 'Франция'],
      ['United Kingdom', 'UK', 'Britain', 'Великобритания'],
      ['Ireland', 'Ирландия'],
      ['Netherlands', 'Нидерланды', 'Голландия'],
      ['Belgium', 'Бельгия'],
      ['Denmark', 'Дания'],
      ['New Zealand', 'Новая Зеландия'],
      ['Argentina', 'Аргентина'],
      ['Japan', 'Япония'],
    ],
  },
  {
    zone: 'continental',
    names: [
      ['Russia', 'Россия', 'РФ'],
      ['Ukraine', 'Украина'],
      ['Belarus', 'Беларусь', 'Белоруссия'],
      ['Poland', 'Польша'],
      ['United States', 'USA', 'US', 'США', 'Соединённые Штаты'],
      ['China', 'Китай'],
      ['South Korea', 'Южная Корея'],
      ['Kazakhstan', 'Казахстан'],
      ['Mongolia', 'Монголия'],
      ['Czechia', 'Czech Republic', 'Чехия'],
    ],
  },
  {
    zone: 'mediterranean',
    names: [
      ['Spain', 'Испания'],
      ['Italy', 'Италия'],
      ['Greece', 'Греция'],
      ['Portugal', 'Португалия'],
      ['Turkey', 'Турция'],
      ['Israel', 'Израиль'],
      ['Chile', 'Чили'],
      ['Morocco', 'Марокко'],
    ],
  },
  {
    zone: 'subtropical',
    names: [
      ['India', 'Индия'],
      ['South Africa', 'ЮАР', 'Южная Африка'],
      ['Taiwan', 'Тайвань'],
    ],
  },
  {
    zone: 'tropical-wet',
    names: [
      ['Brazil', 'Бразилия'],
      ['Colombia', 'Колумбия'],
      ['Indonesia', 'Индонезия'],
      ['Philippines', 'Филиппины'],
      ['Thailand', 'Таиланд'],
      ['Vietnam', 'Вьетнам'],
      ['Nigeria', 'Нигерия'],
    ],
  },
  {
    zone: 'tropical-dry',
    names: [
      ['Mexico', 'Мексика'],
      ['Venezuela', 'Венесуэла'],
    ],
  },
  {
    zone: 'arid',
    names: [
      ['Egypt', 'Египет'],
      ['Saudi Arabia', 'Саудовская Аравия'],
      ['Iran', 'Иран'],
      ['Iraq', 'Ирак'],
      ['Algeria', 'Алжир'],
      ['Australia', 'Австралия'],
    ],
  },
  {
    zone: 'highland',
    names: [
      ['Switzerland', 'Швейцария'],
      ['Austria', 'Австрия'],
      ['Nepal', 'Непал'],
      ['Peru', 'Перу'],
      ['Kenya', 'Кения'],
      ['Ethiopia', 'Эфиопия'],
      ['Georgia', 'Грузия'],
      ['Armenia', 'Армения'],
    ],
  },
];

/** When the table has no entry, the sound of the region the name was given for says what the land is like. */
export const REGION_ZONES: Readonly<Record<NameRegion, ClimateZone>> = {
  neutral: 'oceanic',
  north: 'subarctic',
  south: 'mediterranean',
  east: 'continental',
  west: 'oceanic',
  island: 'tropical-wet',
};

const fold = (name: string): string => name.normalize('NFKC').toLowerCase().replaceAll('ё', 'е').trim();

/**
 * The climate of a real country: that of its zone in the table when any of the ways it is written is in it,
 * and otherwise the zone of the region as a fallback. Either way the profile is checked against the schema,
 * so a hole in the table can never put a broken profile in the dictionary. Pure, so the same country has the
 * same climate in every run.
 */
export function climateFor(real: readonly string[], region: NameRegion): ClimateProfile {
  const wanted = new Set(real.map(fold));
  const found = COUNTRY_ZONES.find(({ names }) =>
    names.some((aliases) => aliases.some((n) => wanted.has(fold(n)))),
  );
  return ClimateProfileSchema.parse(ZONE_PROFILES[found?.zone ?? REGION_ZONES[region]]);
}
