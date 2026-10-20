// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The lint's inputs, assembled once — for the CLI and for the doctor.
 *
 * ARC-08-S02's E-18…E-21 run the lint checks themselves rather than a copy of their logic, so the
 * object those checks read had to stop being a literal inside the CLI. It is the same object in
 * both callers; what differs is what happens when an input is missing. The CLI exits 2 ("cannot
 * run" is not "passed"); the doctor turns the same sentence into one FAIL line and keeps reporting
 * the other twenty-two checks, because a diagnostic that stops at the first bad answer hides its
 * own cause.
 *
 * Stdlib only, no git, no spawning: it runs on a fresh clone before `npm ci`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { scanFiles } from './scan.mjs';
import { isEngineeringCheckout } from '../../../../tools/snowarch/lib/engineering-checkout.mjs';

/** Raised by the default `cannotRun` — a caller that wants an exit code passes its own. */
export class LintInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LintInputError';
  }
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * @param {object} options
 * @param {string} options.root         the tree to lint
 * @param {string} [options.selfRoot]   the lint's own repository; `isSelfRoot` compares against it
 * @param {boolean} [options.requireClaude]
 * @param {(message: string) => never} [options.cannotRun]
 */
export function buildLintContext({ root, selfRoot = root, requireClaude = false,
  cannotRun = (message) => { throw new LintInputError(message); } } = {}) {
  const contractPath = join(root, 'packages', 'snowarch', 'dist', 'contract.json');
  const pinPath = join(root, 'packages', 'contract', 'required-tools.json');
  const retiredPath = join(root, 'packages', 'contract', 'retired-names.json');
  const configPath = join(root, 'engine.config.json');
  const mcpPath = join(root, '.mcp.json');

  if (!existsSync(contractPath)) {
    // ARC-09-C185a: the build is a maintainer's tool; in an install the contract is a shipped file, E-32's to restore.
    cannotRun(`${contractPath} is missing — the contract is a build artefact`
      + (isEngineeringCheckout(root) ? '; run node scripts/build-dist.mjs' : ' the release ships'));
  }
  for (const p of [pinPath, retiredPath, configPath]) {
    if (!existsSync(p)) cannotRun(`${p} is missing`);
  }

  let ctx;
  try {
    const contractText = readFileSync(contractPath, 'utf8');
    const config = readJson(configPath);
    const serverKey = config?.mcp?.serverKey;
    if (typeof serverKey !== 'string' || serverKey.length === 0) {
      cannotRun('engine.config.json has no mcp.serverKey — L02 has no expected value to compare against');
    }
    ctx = {
      root,
      files: scanFiles(root),
      contractText,
      contract: JSON.parse(contractText),
      requiredTools: readJson(pinPath),
      retiredNames: readJson(retiredPath),
      serverKey,
      config,
      // True when the lint is running against its own repository rather than a fixture tree.
      // L06 needs it: two generators take no --root and would check the real repo from a fixture.
      isSelfRoot: root === selfRoot,
      requireClaude,
      // A check that cannot run says so through the caller rather than deciding an exit code itself.
      cannotRun,
      // A check that could not run adds its id here; `statusOf` already has the vocabulary
      // for it, and a skip rendered as a pass is the one outcome a reader must not see.
      skipped: new Set(),
      mcpJson: existsSync(mcpPath) ? readJson(mcpPath) : null,
      skipNotes: [],
      // What a check MEASURED, keyed by id, for its status line. A note is not a finding: it says
      // how much was looked at, which is the difference between "nothing is wrong" and "nothing
      // was read". Text output only — the JSON shape is ARC-08's contract.
      notes: new Map(),
    };
  } catch (e) {
    if (e instanceof LintInputError) throw e;
    cannotRun(`could not read an input: ${e.message}`);
  }
  return ctx;
}
