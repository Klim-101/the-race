#!/usr/bin/env node
// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { createDefaultContext, serveStdio } from './stdio.js';

// The process entry and nothing else, so it is left out of the coverage run; the integration test spawns it.
await serveStdio(process, createDefaultContext(process.cwd()));
