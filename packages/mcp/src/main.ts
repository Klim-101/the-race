#!/usr/bin/env node
// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { moveDefaultLegacyRun, moveDefaultLegacySaves } from '@the-race/saves';
import { createDefaultContext, serveStdio } from './stdio.js';

// The process entry and nothing else, so it is left out of the coverage run; the integration test spawns it.
// The saves of an older start are moved into the game folder before anything reads them; a failed move changes
// nothing and the old folder is used as before.
const moved = await moveDefaultLegacySaves();
// The one run of the old layout becomes the first of the player's runs, by the same kind of checked move.
await moveDefaultLegacyRun();
const context = createDefaultContext();
if (moved.status === 'moved') context.notices.savesMoved = { from: moved.from, to: moved.to };
await serveStdio(process, context);
