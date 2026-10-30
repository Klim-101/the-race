// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Tool } from '../define-tool.js';
import { serverInfo } from './server-info.js';

/**
 * Every tool the server offers, one file each. Adding a tool is one import and one line here, which keeps
 * two changes that add different tools from touching the same lines of any other file.
 */
export const TOOLS: readonly Tool[] = [serverInfo];
