// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// The contract of the values the HUD keeps in the session: what it has learned from the game's own tools.
// Every field is a field of the public view of the run, the same that run_view shows the narrator.

export type HudPlace = {
  id: string;
  name: string;
  visited: boolean;
  blocked: 'locked' | 'closed' | null;
};

export type Hud = {
  locale: 'ru' | 'en';
  title: string;
  day: number;
  totalDays: number;
  minute: number;
  turn: number;
  /** The place the hero is at: the `current` of the known map. */
  locationId: string;
  clueCount: number;
  /** The known map, as the game sent it. */
  places: HudPlace[];
  links: { from: string; to: string }[];
};

declare module 'claude-code' {
  interface PluginState {
    'the-race': {
      /** `null` while there is no run in progress. */
      hud: Shaped<Hud | null>;
      /** The language of the last run: the pane speaks it even when no run is on. */
      locale: Shaped<'ru' | 'en'>;
    };
  }
}
