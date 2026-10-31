// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

const MS_PER_DAY = 86_400_000;

/** A day as `YYYY-MM-DD`, in UTC; the format the caches and the seeds are keyed by. */
export function isDay(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(text);
}

/** The day `days` before `day` (after it when negative). Pure: it never asks what day it is today. */
export function shiftDay(day: string, days: number): string {
  if (!isDay(day)) throw new RangeError(`Not a day: ${day}`);
  return new Date(Date.parse(`${day}T00:00:00Z`) - days * MS_PER_DAY).toISOString().slice(0, 10);
}
