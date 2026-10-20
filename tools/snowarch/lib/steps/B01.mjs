// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// B01 workspace — make `.local/`, prove the two committed files are still the committed files, and fetch the release's
// signed manifest (ARC-11-C7).
//
// The verification is the interesting half. `.mcp.json` and `.claude/settings.json` ARE the
// registration: a clone is the install, and Claude Code reads them directly. So an edit to either
// changes what gets registered, and the bootstrap must not proceed as though it had not. Two
// questions are asked, because they catch different mistakes: `git diff` catches an uncommitted
// edit, and the S01 rules — re-evaluated here rather than only at commit time — catch one that was
// committed.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localDir } from '../local-paths.mjs';
import { manifestSays, manifestSource, refreshManifest } from '../licence/fetch.mjs';
import { PRODUCT_KEYS } from '../licence/keys.mjs';
import { cachedManifest, releaseTagOf } from '../licence/manifest.mjs';
import { cloudSyncWarning } from '../cloud-sync.mjs';
import { checkMcpJson, checkSettingsJson } from '../registration.mjs';
import { FILE, TEXT } from './inputs.mjs';
import { INPUTS } from '../inputs.mjs';

export const id = 'B01';
export const title = 'workspace';
export const needsNode = false;
export const runsWhen = () => true;
// ARC-09-S05: the declaration lives in `lib/inputs.mjs`. Ten steps answering "what are my
// inputs" in ten files is ten places to get the resume rule wrong, and no way to show a user the
// set — the table is one answer, and `docs/ARCHITECTURE.md` renders from it.
export const inputs = INPUTS.B01.resolve;

/**
 * ARC-09-C140 — B01 RUNS WHENEVER ITS MANIFEST IS NOT HELD, whatever its inputs say: on a release tree whose config
 * names the manifests, when the cache holds no manifest that verifies and is this release's. The owner's upgrade from
 * 2.0.13 printed `[B01/09] workspace … ok (cached)` at U6 and then E-32 FAIL, because nothing had fetched the
 * manifest: U4 was 2.0.13's code, and B01's inputs had not moved. The cache is B01's OUTPUT, not one of its inputs —
 * hashed, it would read "wanted" before every fetch that made it "held", and B01 would run again on the next bootstrap.
 *
 * The cache is read the way E-32 reads it (`cachedManifest`), offline. `licenceKeys` is the seam `run` has.
 */
export function outputMissing(ctx) {
  const tag = releaseTagOf(ctx.root);
  if (!tag || !manifestSource(ctx.config)) return false;
  return cachedManifest(ctx.root, tag, { keys: ctx.licenceKeys ?? PRODUCT_KEYS, local: localDir(ctx.root) }).state !== 'held';
}

export const REGISTRATION_REMEDY =
  'run: git checkout -- .mcp.json   (never edit this file; per-machine values belong in '
  + '.claude/settings.local.json)';

/** `.local/` at 0700, whether it is new or already there. Windows has no mode to set. */
export function ensureLocalDir(root, plat = process.platform) {
  const dir = localDir(root);
  const existed = existsSync(dir);
  mkdirSync(join(dir, 'logs'), { recursive: true, mode: 0o700 });
  if (plat === 'win32') return { existed, modes: 'acl-inherited' };
  // An existing directory keeps whatever mode it had — `mkdirSync` does not change it — so a
  // checkout bootstrapped before this rule existed would stay 0755 forever without the chmod.
  chmodSync(dir, 0o700);
  return { existed, modes: '0700' };
}

/** Does the working tree still hold what was committed? */
export function committedFilesUnchanged(root, files, run = defaultRun) {
  try {
    run(['diff', '--quiet', 'HEAD', '--', ...files], root);
    return { clean: true, files: [] };
  } catch {
    // `--name-only` for the report: naming the file that differs is the difference between a
    // remedy someone can follow and one they have to guess at.
    try {
      const out = run(['diff', '--name-only', 'HEAD', '--', ...files], root);
      return { clean: false, files: out.split('\n').map((l) => l.trim()).filter(Boolean) };
    } catch { return { clean: false, files }; }
  }
}

const defaultRun = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });

export const run = async (ctx) => {
  const plat = ctx.plat ?? process.platform;
  const dir = ensureLocalDir(ctx.root, plat);
  ctx.state.writer = 'node';
  if (plat === 'win32') ctx.state.fileModes = 'acl-inherited';

  const data = { localDir: dir.existed ? 'reused' : 'created', modes: dir.modes };

  // The cloud-sync warning is recorded as well as printed, so B09 can repeat it at the end — the
  // one line a user most needs to see again is the one that scrolled past ten steps ago.
  const cloud = cloudSyncWarning(ctx.root);
  if (cloud) data.cloudSync = cloud;

  const files = ['.mcp.json', '.claude/settings.json'];
  const diff = committedFilesUnchanged(ctx.root, files, ctx.git ?? defaultRun);
  if (!diff.clean) {
    return { status: 'fail', data,
      detail: `${diff.files.join(' and ')} differs from the committed version`,
      remedy: REGISTRATION_REMEDY };
  }

  // ...and the rules themselves, in case the difference was committed.
  const readJson = (rel) => {
    try { return JSON.parse(readFileSync(join(ctx.root, rel), 'utf8')); } catch { return null; }
  };
  const problems = [
    ...checkMcpJson(readJson('.mcp.json') ?? {}, ctx.config),
    ...checkSettingsJson(readJson('.claude/settings.json') ?? {}),
  ];
  if (problems.length > 0) {
    return { status: 'fail', data, detail: problems[0], remedy: REGISTRATION_REMEDY };
  }

  // ARC-11-C7 — THE ONE FETCH AN INSTALL MAKES, through the revocation list's transport: E-32 FAILs on a release tree
  // with no manifest held, so without this every fresh install would read as tampered until somebody refreshed. Not
  // fetched, it warns with the reason, and E-32's remedy is the refresh; a development version has none to fetch, and
  // a config that names no licences repository says nothing, as the revocation list's refresh does.
  const tag = releaseTagOf(ctx.root);
  // `licenceKeys` is the test seam E-31 and E-32 have: a suite injects the keys it generated. Nothing in the product
  // sets it.
  const fetched = tag ? refreshManifest(ctx.root, { config: ctx.config, tag, env: ctx.env ?? process.env,
    keys: ctx.licenceKeys ?? PRODUCT_KEYS }) : null;
  const manifest = fetched?.outcome === 'unconfigured' ? null : fetched;
  if (manifest) {
    data.manifest = { outcome: manifest.outcome, tag, files: manifest.files ?? null };
    ctx.line?.(manifestSays(manifest));
  }
  const warnings = [cloud, manifest && manifest.outcome !== 'fetched' ? manifestSays(manifest) : null].filter(Boolean);

  return warnings.length > 0
    ? { status: 'warn', detail: warnings.join(' · '), data }
    : { status: 'ok', detail: `.local/ ${data.localDir} (${dir.modes})${manifest ? ` · ${manifestSays(manifest)}` : ''}`, data };
};
