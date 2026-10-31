// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { TragedyCategory } from '../../src/text/tragedy-filter.js';

// Headlines in the manner of the real ones, invented for the tests: no real place, person or outlet.
// What each must come to: kept, reduced to an armed conflict, or dropped for a category.

export type Expected = 'keep' | 'armed-conflict' | TragedyCategory;

export const HEADLINES: readonly (readonly [string, Expected])[] = [
  // Kept: economy, technology, small crimes, jokes, and words that only look grim.
  ['Grain prices dip as harvests recover', 'keep'],
  ['Port of Nordell halts cranes as talks resume', 'keep'],
  ['Bridge toll doubled for heavy trucks', 'keep'],
  ['Central bank holds rates steady for a third month', 'keep'],
  ['Cloud provider outage disrupts payments across the region', 'keep'],
  ['Hackers leak customer records of a mid-sized retailer', 'keep'],
  ['Ransomware group demands payment from a regional clinic network', 'keep'],
  ['Museum reports the theft of a rare brass weight', 'keep'],
  ['Trade war over steel tariffs deepens between two neighbours', 'keep'],
  ['Stable currency calms importers', 'keep'],
  ['Skilled workers wanted as factories expand', 'keep'],
  ['Rapeseed prices climb on weak supply', 'keep'],
  ['Perishable goods delayed at the border', 'keep'],
  ['Dragon-themed festival draws record crowds', 'keep'],
  ['Parliament debates a new tax on streaming', 'keep'],
  ['Mayor declares Tuesday optional', 'keep'],
  ['Цены на зерно упали второй месяц подряд', 'keep'],
  ['Школы переходят на зимнее расписание', 'keep'],
  ['Новый закон об аренде вступил в силу', 'keep'],
  ['Центробанк сохранил ставку на прежнем уровне', 'keep'],
  ['Сбой в облачном сервисе нарушил работу платежей', 'keep'],
  ['Утечка данных у крупного ритейлера: в сеть попали адреса клиентов', 'keep'],
  ['Стриминговые сервисы начали ценовую войну за подписчиков', 'keep'],
  ['Фестиваль драконов собрал рекордную публику', 'keep'],
  ['Мэр объявил вторник выходным днём', 'keep'],

  // Reduced: an armed conflict, and nothing else of the headline.
  ['War enters its third year, talks stall', 'armed-conflict'],
  ['Troops mass near the border as ceasefire collapses', 'armed-conflict'],
  ['Missile alert halts shipping in the strait', 'armed-conflict'],
  ['Начались переговоры о перемирии', 'armed-conflict'],
  ['Вторжение вызвало рост цен на газ', 'armed-conflict'],
  ['Обстрел порта остановил отгрузку зерна', 'armed-conflict'],
  ['Грузовики с помощью задержаны на линии фронта', 'armed-conflict'],

  // Dropped.
  ['Dozens killed as a bus overturns', 'casualties'],
  ['Two dead after a warehouse roof gives way', 'casualties'],
  ['Victims of the fraud demand refunds', 'casualties'],
  ['Число погибших выросло до двадцати', 'casualties'],
  ['Мужчина умер в очереди за пособием', 'casualties'],
  ['Airstrike kills dozens in a market town', 'casualties'],
  ['Bomb threat empties the central station', 'terror'],
  ['Hostage crisis at a bank branch ends', 'terror'],
  ['Теракт в торговом центре: введён режим тревоги', 'terror'],
  ['Взрыв на заводе повредил цех', 'terror'],
  ['Gunman opens fire at a market', 'violence'],
  ['Riot police clash with protesters', 'violence'],
  ['Pub fight ends with a stabbing', 'violence'],
  ['Torture claims fill a prison report', 'violence'],
  ['Нападение на инкассаторов у банка', 'violence'],
  ['Man charged with murder after an argument', 'crime-against-people'],
  ['Human trafficking ring uncovered', 'crime-against-people'],
  ['Rapist sentenced after a long trial', 'crime-against-people'],
  ['Children hospitalised after a school lunch', 'children'],
  ['Teenager arrested over a school hack', 'children'],
  ['Детей эвакуировали из здания', 'children'],
  ['Школьники эвакуированы из-за обстрела', 'children'],
  ['Earthquake shakes the coastal province', 'disaster'],
  ['Storm floods the lower town', 'disaster'],
  ['Лесной пожар приблизился к посёлку', 'disaster'],
  ['Крушение поезда остановило движение', 'disaster'],
  ['Suicide hotline overwhelmed by calls', 'self-harm'],
  ['Передозировка на фестивале: организаторов проверят', 'self-harm'],
  ['Famine spreads in the dry provinces', 'grim'],
  ['Вспышка холеры в портовом городе', 'grim'],
];
