// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Tool } from '../define-tool.js';
import { accuse } from './accuse.js';
import { act } from './act.js';
import { deduce } from './deduce.js';
import { evidenceBoard } from './evidence-board.js';
import { generatorBrief } from './generator-brief.js';
import { heroCreate } from './hero-create.js';
import { heroOffer } from './hero-offer.js';
import { heroPick } from './hero-pick.js';
import { newsBrief } from './news-brief.js';
import { profileExport, profileImport, profileView } from './profile-tools.js';
import { question } from './question.js';
import { runGiveUp } from './run-give-up.js';
import { runNew } from './run-new.js';
import { runView } from './run-view.js';
import { scenarioSubmit } from './scenario-submit.js';
import { seedsSubmit } from './seeds-submit.js';
import { serverInfo } from './server-info.js';
import { tavernNews } from './tavern-news.js';
import { worldPropose } from './world-propose.js';
import { worldView } from './world-view.js';

/**
 * Every tool the server offers, one file each. Adding a tool is one import and one line here, which keeps
 * two changes that add different tools from touching the same lines of any other file.
 */
export const TOOLS: readonly Tool[] = [
  serverInfo,
  accuse,
  act,
  deduce,
  evidenceBoard,
  generatorBrief,
  heroCreate,
  heroOffer,
  heroPick,
  newsBrief,
  profileExport,
  profileImport,
  profileView,
  question,
  runGiveUp,
  runNew,
  runView,
  scenarioSubmit,
  seedsSubmit,
  tavernNews,
  worldPropose,
  worldView,
];
