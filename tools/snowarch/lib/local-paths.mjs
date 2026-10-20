// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-07-C43 head 2 — every path under `.local/`, in one place.
 *
 * WHY THIS FILE EXISTS. Head 1 put `SNOWARCH_STATE_ROOT` beside the root discovery and taught the six
 * path builders to ask for it. It could not be turned on, because twenty-five OTHER sites built
 * `join(root, '.local', …)` by hand — the doctor four times, `steps/B06` five, `commands/upgrade`
 * twice, and so on. A redirect honoured by six builders and ignored by twenty-five is a state root
 * that is half-moved: a redirected doctor would read the real `bootstrap-state.json` while writing its
 * cache into the temp directory, which is the "create one place, write to another" defect one level
 * up. The twenty-five were not a rule anyone broke; they were the absence of a place to put the rule.
 *
 * SO THE RULE HAS A HOME, and this is it. Everything under `.local/` is named here, once, and the
 * modules that used to own a path re-export it so no importer had to move.
 *
 * IT IS A LEAF, DELIBERATELY. It imports `node:path` and `config.mjs` and nothing else, because the
 * alternative was a cycle: `bootstrap.mjs` and `steps/` need the store path, `mode.mjs` used to own
 * it, and `mode.mjs` imports `bootstrap.mjs`. Anything that reads or writes state can import this
 * safely, whatever else it imports.
 *
 * WHAT IS NOT HERE. A path built against a root that is NOT this checkout — `commands/upgrade.mjs`
 * links the checkout's `.local/` into the worktree it just made, and that worktree's own `.local`
 * entry is a location in another tree rather than this checkout's state. Redirecting it would put the
 * link somewhere the upgrade is not looking. The rule is about THIS checkout's state directory, and a
 * caller that means another tree says so with `join(thatRoot, '.local')` and a comment.
 */
import { join } from 'node:path';
import { stateRoot } from './config.mjs';

/** `<state root>/.local` — the directory itself, for a mkdir, a chmod or a mode check. */
export const localDir = (root) => join(stateRoot(root), '.local');

/**
 * A path under `.local/` given as a RELATIVE spelling, for the one data-driven caller.
 *
 * `doctor/fix.mjs`'s store-mode repair is handed its target by the check that found it
 * (`checks/engine-repo.mjs` passes `.local`), so the path arrives as data rather than as a call. It
 * still has to follow the state root, and a path that is not under `.local/` still has to not —
 * a fix that chmodded a redirected directory when it meant a file in the checkout would be repairing
 * something nobody reported.
 */
export function localPathFrom(root, relative) {
  const parts = String(relative).split(/[\\/]+/).filter(Boolean);
  return parts[0] === '.local' ? join(stateRoot(root), ...parts) : join(root, ...parts);
}

/** `.local/bootstrap-state.json` — what this checkout knows about its own installation. */
export const statePath = (root) => join(localDir(root), 'bootstrap-state.json');

/** `.local/instances.json` — the instance store. It holds credentials; it is 0600 and 0700 above. */
export const storePath = (root) => join(localDir(root), 'instances.json');

/** `.local/config.json` — B07's generated engine configuration. */
export const configPath = (root) => join(localDir(root), 'config.json');

/** `.local/doctor-last.json` — what the SessionStart banner reads. */
export const doctorCachePath = (root) => join(localDir(root), 'doctor-last.json');

/** `.local/doctor-last.inputs.json` — the mtimes that decide whether the cache still describes this. */
export const doctorInputsPath = (root) => join(localDir(root), 'doctor-last.inputs.json');

/** `.local/upgrade-check.json` — what the banner reads for "a newer release exists". */
export const upgradeCheckPath = (root) => join(localDir(root), 'upgrade-check.json');

/** `.local/logs` — one file per command run, rotated to the last ten. */
export const logsDir = (root) => join(localDir(root), 'logs');

/** `.local/licence.json` — the installed licence (ARC-11-C1). Signed, not secret, copied in by hand. */
export const licencePath = (root) => join(localDir(root), 'licence.json');

/** `.local/revocations.json` — the last revocation list fetched, and when (ARC-11-C1). The banner reads it. */
export const revocationsPath = (root) => join(localDir(root), 'revocations.json');

/** `.local/release-manifest.json` — this release's signed manifest, as last fetched, and when (ARC-11-C7). E-32 reads it. */
export const releaseManifestPath = (root) => join(localDir(root), 'release-manifest.json');
