// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

/** Case text, headlines and names are data that may carry markup or instructions: nothing goes in raw. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** A text cut to `max` characters (not UTF-16 units) with an ellipsis, for a label that has to fit a box. */
export function truncate(text: string, max: number): string {
  const characters = Array.from(text);
  return characters.length <= max ? text : `${characters.slice(0, max - 1).join('')}…`;
}
