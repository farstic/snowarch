// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S02 — where the repository is, and what it says about itself.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repository root, from THIS FILE's location — never `process.cwd()`.
 *
 * A CLI invoked from a subdirectory must still find `engine.config.json`, the corpus and the
 * contract; resolving from the working directory would make every path depend on where the operator
 * happened to be standing. `cwd` is used for exactly one thing: telling them when it differs, so a
 * command that reports on "the repository" is not mistaken for one reporting on "here".
 */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The keys this ARC reads, validated on load so a typo fails at the edge rather than three calls in. */
const REQUIRED = [['docs', 'pin'], ['docs', 'family'], ['mcp', 'serverKey'], ['floors', 'node']];

export function loadConfig(from = root) {
  const p = join(from, 'engine.config.json');
  if (!existsSync(p)) {
    throw new Error(`engine.config.json not found at ${from} — is this a snowarch checkout?`);
  }
  const config = JSON.parse(readFileSync(p, 'utf8'));
  const missing = REQUIRED.filter(([a, b]) => config?.[a]?.[b] === undefined).map((k) => k.join('.'));
  if (missing.length > 0) {
    // ARC-09-C209 — the keys in backticks: printed through the redactor, a bare `docs.pin` reads as a person's name.
    throw new Error(`engine.config.json is missing: ${missing.map((k) => `\`${k}\``).join(', ')}`);
  }
  return config;
}

/** The version of record: the root package.json, which the release script owns. */
export function version(from = root) {
  return JSON.parse(readFileSync(join(from, 'package.json'), 'utf8')).version;
}

/**
 * The contract's sha256, computed — never stored twice.
 *
 * `dist/contract.json` is a build artefact, so a checkout that has not built has no sha and says so
 * rather than printing a stale one from somewhere else.
 */
export function contractSha(from = root) {
  const p = join(from, 'packages', 'snowarch', 'dist', 'contract.json');
  if (!existsSync(p)) return null;
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

/**
 * Where `.local/` lives — the repository root, unless `SNOWARCH_STATE_ROOT` redirects it.
 *
 * ARC-07-C43, HEAD 1 OF TWO, AND IT IS INERT ON ITS OWN. `root` above is derived from THIS FILE's
 * location, which is right for reading the corpus and the contract and is exactly why a spawned CLI
 * cannot be pointed away from the checkout's state: a child given a temp `cwd` still discovers the
 * same root and still writes `.local/logs/<command>-<stamp>.log`, `.local/doctor-last.json` and
 * `.local/upgrade-check.json` into the repository. Five suites do that on every `npm test` — the
 * measured list is in C43's row — and `.local/` is gitignored, so `assert-clean` cannot see it.
 *
 * NOTHING SETS THE VARIABLE YET, and that is deliberate rather than unfinished. Head 2 routes the
 * twenty sites that still hand-build `.local/…` instead of calling the builders below, and only then
 * does the harness set it. Until then this returns the root it was given, so the half-moved state a
 * partial redirect would produce — a doctor reading the real `bootstrap-state.json` while writing its
 * cache somewhere else — cannot happen: it needs a value, and there is nobody to supply one. For the
 * same reason the variable is NOT documented, defaulted or advertised anywhere until head 2 lands;
 * the first reader who exported it early would get precisely that doctor.
 *
 * IT REDIRECTS ONLY THIS CHECKOUT'S STATE. A caller that passes a fixture root of its own keeps it,
 * so a test that deliberately writes into a temp tree cannot be captured by an exported variable, and
 * one that means to redirect the real root has to say so. Reads and writes both go through it, so a
 * redirected state root is coherent rather than half-moved.
 *
 * `env` is a parameter for the reason `loadState`'s `read` is: so a case can set it without touching
 * the process it runs in.
 */
export function stateRoot(from = root, env = process.env) {
  const to = env.SNOWARCH_STATE_ROOT;
  if (!to || resolve(from) !== root) return from;
  return resolve(to);
}

/** `undefined` when the caller is standing in the repository root; the note's text otherwise. */
export function cwdNote(cwd = process.cwd(), from = root) {
  if (resolve(cwd) === resolve(from)) return undefined;
  return `note: running against ${from} (you are in ${resolve(cwd)})`;
}
