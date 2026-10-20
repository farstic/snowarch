#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The engine lint: does any governing text cite something the server does not have?
 *
 * Five checks today (S04 adds the rest):
 *
 *   L01  every `snow_*` token is a tool in the contract
 *   L02  every `mcp__…__` prefix is the one `engine.config.json` declares
 *   L03  no retired name outside the three files where naming the past is the job
 *   L07  the registration key agrees across its four declarations
 *   L11  the pin's sha still describes the committed contract
 *
 * Usage:
 *   node packages/contract/lint/engine-lint.mjs [--json] [--root <dir>] [--only L01,L03]
 *
 * Exit 0 pass · 1 findings · 2 cannot run. "Cannot run" is separate from "found problems" on
 * purpose: a missing `dist/contract.json` means the check never happened, and a caller that
 * treated that as a pass would be reassured by silence.
 *
 * Stdlib only, no shelling out, no git. It has to work on a fresh clone before `npm ci`, and it
 * has to finish in a couple of seconds on every CI cell — including Windows, where spawning a
 * process per file would dominate the runtime.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLintContext } from './lib/context.mjs';
import { renderJson, renderText, statusOf } from './lib/report.mjs';
import * as l01 from './checks/l01-tokens.mjs';
import * as l02 from './checks/l02-prefix.mjs';
import * as l03 from './checks/l03-retired.mjs';
import * as l04 from './checks/l04-descriptions.mjs';
import * as l05 from './checks/l05-paths.mjs';
import * as l06 from './checks/l06-generated.mjs';
import * as l08 from './checks/l08-expectations.mjs';
import * as l09 from './checks/l09-used-by.mjs';
import * as l07 from './checks/l07-serverkey.mjs';
import * as l10 from './checks/l10-plugin-validate.mjs';
import * as l11 from './checks/l11-pin.mjs';

const CHECKS = [l01, l02, l03, l04, l05, l06, l07, l08, l09, l10, l11];

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};

// `fileURLToPath`, never `new URL(...).pathname` — `/C:/…` on Windows is not a path.
const selfRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const root = resolve(value('--root') ?? selfRoot);
const asJson = flag('--json');
const only = (value('--only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const cannotRun = (message) => {
  process.stderr.write(`engine-lint: ${message}\n`);
  process.exit(2);
};

// The inputs are assembled by `lib/context.mjs`, which the doctor's E-18…E-21 call too: one
// description of what a lint check reads, so the doctor cannot be linting a different object
// from the one CI lints (ARC-08-S02).
const ctx = buildLintContext({ root, selfRoot, requireClaude: flag('--require-claude'), cannotRun });

const selected = only.length > 0 ? CHECKS.filter((c) => only.includes(c.id)) : CHECKS;
if (only.length > 0) {
  const unknown = only.filter((id) => !CHECKS.some((c) => c.id === id));
  if (unknown.length > 0) cannotRun(`--only names unknown check(s): ${unknown.join(', ')}`);
}

const results = selected.map((check) => {
  const findings = check.run(ctx);
  return {
    id: check.id,
    findings,
    note: ctx.notes.get(check.id),
    status: statusOf({ ...check, skipped: ctx.skipped.has(check.id) }, findings),
  };
});

process.stdout.write(asJson ? renderJson(results) : renderText(results));

// The skip notes go to stderr, not into the JSON: they say what was NOT checked, which is
// operator information rather than a finding, and putting them in `findings` would make a
// consumer count them as problems.
for (const note of ctx.skipNotes) process.stderr.write(`SKIP ${note}\n`);

process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
