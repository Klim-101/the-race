// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFrame, type ScenarioReading } from '../frame.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';

/** How a submitted document reads as a detective case (see `readFrame`). */
export type CaseReading = ScenarioReading<DetectiveCase>;

/** Reads a submitted document as a whole detective case or as a frame of one, or says what is wrong with it. */
export const readCaseOrFrame = (document: unknown): CaseReading => readFrame(DetectiveCaseSchema, document);
