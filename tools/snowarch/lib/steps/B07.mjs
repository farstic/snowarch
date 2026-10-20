// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// B07 Claude settings — the two Claude Code settings, and the per-checkout config that mirrors them.
//
// The whole step is "write two array members into a file that belongs to someone else", which is
// why the writing lives in `settings-local.mjs` and this only decides WHAT to ask for and reports
// what happened. ARC-08's `--fix` and ARC-06-S12's `mode` call that same function.
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { configPath, localDir, storePath as storePathOf } from '../local-paths.mjs';
// Four levels up: steps → lib → snowarch → tools → the repository root. In-repo committed
// JavaScript, not an npm dependency — the bootstrap still installs nothing, and `label.js` is
// zod-free precisely so it can be read in a checkout that has never run `npm ci`.
import { readDefaultLabel } from '../../../../packages/snowarch/dist/store/label.js';
import { applyToggles, HOOKS_LEFT_ALONE, SETTINGS_LOCAL, writeJsonAtomic } from '../settings-local.mjs';
import { TEXT } from './inputs.mjs';
import { INPUTS } from '../inputs.mjs';

export const id = 'B07';
export const title = 'Claude settings';
export const needsNode = false;
export const runsWhen = () => true;
// ARC-09-S05: the declaration lives in `lib/inputs.mjs`. Ten steps answering "what are my
// inputs" in ten files is ten places to get the resume rule wrong, and no way to show a user the
// set — the table is one answer, and `docs/ARCHITECTURE.md` renders from it.
export const inputs = INPUTS.B07.resolve;

export const CONFIG_FILE = join('.local', 'config.json');
export const CONFIG_VERSION = 1;

/**
 * `.local/config.json` v1 — mode, registration, and the default instance's LABEL.
 *
 * `defaultInstance` is a MIRROR and never a second source. The store is authoritative; ARC-07's
 * `set-default` re-mirrors it. It is read through a label-only reader that returns one string, so
 * no URL, username or credential can reach this file even by accident — which matters because
 * unlike the store, this file is not 0600 and is read by things that have no business with secrets.
 */
export function writeConfig(root, { mode, registration, storePath, now = new Date(),
  readLabel = readDefaultLabel }) {
  // `.local/` is B01's to create, but this must not DEPEND on B01 having run: ARC-08's `--fix`
  // calls B07's writer on its own, and a step that only works in one call order is a trap for
  // whoever calls it next.
  mkdirSync(localDir(root), { recursive: true, mode: 0o700 });
  const store = storePath ?? storePathOf(root);
  const label = existsSync(store) ? readLabel(store) : null;
  const config = {
    version: CONFIG_VERSION,
    mode,
    defaultInstance: label ? label.label : null,
    registration,
    updatedAt: now.toISOString(),
  };
  writeJsonAtomic(configPath(root), config);
  return config;
}

export const run = async (ctx) => {
  const registration = ctx.state.registration ?? 'project';
  const result = applyToggles({
    root: ctx.root,
    mode: ctx.mode,
    nodePresent: ctx.node.present,
    registration,
    // The key is the config's, never a literal: `.mcp.json`, the toggles and the doctor all have to
    // name the same server, and one place decides what it is called.
    serverKey: ctx.config.mcp.serverKey,
    ...(ctx.checkIgnored ? { check: ctx.checkIgnored } : {}),
  });
  if (!result.ok) return { status: 'fail', detail: result.reason, remedy: null };
  // S-05 variant B's whole of AC 3: the hook entry follows Node's presence (`computeSettings`
  // adds it when Node is here and removes it when it is not), and a user-set `disableAllHooks` is
  // left alone with this note. Printed through the runner's sink so it is redacted and logged
  // like every other line.
  if (result.userDisabledHooks && ctx.line) ctx.line(HOOKS_LEFT_ALONE);

  // ARC-06-C7 — the mode is recorded HERE, by the step that just made it true, and never earlier.
  // The toggles above are what a live checkout actually is; until they are written, "live" is a
  // request, not a fact. B03 therefore records nothing, and a switch interrupted before this line
  // leaves the previous mode in `bootstrap-state.json` with the toggles that match it.
  ctx.state.mode = ctx.mode;
  const config = writeConfig(ctx.root, { mode: ctx.mode, registration,
    ...(ctx.readLabel ? { readLabel: ctx.readLabel } : {}) });

  return {
    status: 'ok',
    detail: result.changed
      ? `${SETTINGS_LOCAL} updated for ${ctx.mode}`
      : `${SETTINGS_LOCAL} already correct for ${ctx.mode}`,
    // Never the label's VALUE in `data`: labels are not secrets, but the state file is the one
    // place this project keeps saying nothing that identifies an instance.
    data: { settingsChanged: result.changed, configVersion: config.version,
      defaultInstance: config.defaultInstance === null ? 'none' : 'set' },
  };
};
