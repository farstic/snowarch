// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S07 — the operator's path: a live install with no keyboard, from a 0600 file.
//
// This exists so a credential never has to pass through argv, a transcript, a CI variable dump or a
// shared config file. The file is a store document — the same schema `.local/instances.json` uses —
// so `cp` from another checkout works, and so there is exactly one definition of what an instance
// is. It is READ, never copied, moved or deleted; the operator is told it still holds their
// credentials.
//
// Everything the store module does is imported LAZILY. `parseStore` and `saveStore` reach for zod,
// which only exists after B04 — a design-only checkout that never installs anything must be able to
// load this module without exploding, and a test asserts exactly that.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { register } from './redact.mjs';

/** The environments the file may name, and the two D-05 proposals. */
export const ENVIRONMENTS = Object.freeze(['pdi', 'dev', 'test', 'prod']);
const PDI_URL = /^https:\/\/dev\d+\.service-now\.com\/?$/i;

export const SENTENCE = Object.freeze({
  groupReadable: (p) => `${p} is group/world-readable — run: chmod 600 ${p}`,
  tracked: 'refuse to read an instance file that git could commit — move it to .local/ or outside '
    + 'the checkout',
  environmentRequired: 'environment is required: pdi|dev|test|prod — it is never guessed for a '
    + 'non-dev host',
  authFailed: (label) => `AUTHENTICATION_FAILED for "${label}" — nothing saved`,
  stillThere: (p) => `note: ${p} still holds your credentials — delete it when you no longer need it`,
  prodNotAcknowledged: (label, preset) => `PROD_WRITE_NOT_ACKNOWLEDGED — instance "${label}" is `
    + `prod with preset ${preset}; set "prodWriteAck": true in the file only if you really mean it `
    + '(D-05)',
});

/**
 * 0600 or stricter, checked BEFORE the file is read.
 *
 * The order matters: a file the group can read has already leaked, and reading it first would put
 * the credential in this process's memory before saying so. Windows has no mode worth checking, and
 * says that rather than pretending.
 */
export function checkMode(path, plat = process.platform) {
  if (plat === 'win32') {
    return { ok: true, note: 'file modes: ACL-inherited (Windows) — delete the file after use' };
  }
  const mode = statSync(path).mode & 0o777;
  return (mode & 0o077) === 0
    ? { ok: true, note: null }
    : { ok: false, reason: SENTENCE.groupReadable(path) };
}

/**
 * The file must be somewhere git could not commit: outside the checkout, or ignored inside it.
 *
 * A credential file inside a tracked tree is one `git add -A` from being published, and the person
 * most likely to do that is the operator who just created it.
 */
export function checkLocation(path, root, { run = defaultGit } = {}) {
  const rel = relative(root, resolve(path));
  const inside = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  if (!inside) return { ok: true };
  try {
    run(['check-ignore', '-q', '--', rel], root);
    return { ok: true };
  } catch {
    return { ok: false, reason: SENTENCE.tracked };
  }
}

const defaultGit = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'ignore' });

/**
 * The D-05 proposals, applied and reported.
 *
 * A proposal is printed even when `--yes` accepted it: the operator is entitled to know what was
 * decided on their behalf, and "accepted: --yes" is the honest way to say that nobody was asked.
 */
export function proposeFor(entry, presetNames) {
  const notes = [];
  const out = { ...entry };
  // The label is the record's KEY in a store document, never a field inside it — the schema is
  // strict and would reject one.
  delete out.label;

  if (!out.environment) {
    if (PDI_URL.test(String(out.url ?? ''))) {
      out.environment = 'pdi';
      notes.push('environment: pdi (proposed from the URL — D-05; accepted: --yes)');
    } else {
      return { ok: false, reason: SENTENCE.environmentRequired };
    }
  }
  if (!ENVIRONMENTS.includes(out.environment)) {
    return { ok: false, reason: SENTENCE.environmentRequired };
  }

  if (!out.preset && !out.flags) {
    // prod is capped at the read-only preset; everything else gets the full one. The names come
    // from the contract, never from a literal here.
    const wanted = out.environment === 'prod' ? presetNames.readOnly : presetNames.full;
    out.preset = wanted;
    notes.push(`preset: ${wanted} (proposed for ${out.environment} — D-05; accepted: --yes)`);
  }
  return { ok: true, entry: out, notes };
}

/**
 * Read, validate, propose — everything before the network.
 *
 * The store module is imported here rather than at the top of the file, and the password is
 * registered with the redactor the moment it is parsed: from that point no code path can print it,
 * including one written later by someone who does not know this function exists.
 */
export async function readInstanceFile(path, { root, plat = process.platform, contract,
  gitRun = defaultGit } = {}) {
  if (!existsSync(path)) return { ok: false, reason: `${path} does not exist` };

  const mode = checkMode(path, plat);
  if (!mode.ok) return mode;
  const location = checkLocation(path, root, { run: gitRun });
  if (!location.ok) return location;

  let raw;
  try { raw = JSON.parse(readFileSync(path, 'utf8')); } catch (e) {
    return { ok: false, reason: `${path} is not valid JSON: ${e.message}` };
  }
  if (!raw || typeof raw !== 'object' || typeof raw.instances !== 'object') {
    return { ok: false, reason: `${path} is not an instance file: it has no "instances" object` };
  }

  // Registered BEFORE anything is logged, and before validation — a file that fails the schema is
  // still a file with a password in it, and the failure message is the first thing printed.
  for (const entry of Object.values(raw.instances)) {
    for (const key of ['password', 'clientSecret']) register(entry?.auth?.[key]);
  }

  const presetNames = presetsFrom(contract);

  // THE PROPOSALS COME BEFORE VALIDATION, and that order is forced rather than chosen: the store
  // schema is `.strict()` and requires both `environment` and `preset`, so a file that omits them —
  // exactly the file D-05 says to accept — cannot be parsed until they are filled in. Validating
  // first would reject the operator's file for the very fields the design says to propose.
  const notes = [];
  const completed = {};
  for (const [label, entry] of Object.entries(raw.instances)) {
    const proposal = proposeFor(entry, presetNames);
    if (!proposal.ok) return { ok: false, reason: `${label}: ${proposal.reason}` };
    notes.push(...proposal.notes.map((n) => `${label} — ${n}`));
    completed[label] = proposal.entry;
  }

  const { parseStore } = await import('../../../packages/snowarch/dist/store/schema.js');
  const parsed = parseStore({ ...raw, instances: completed });
  if (parsed.error) {
    return { ok: false, reason: `${path} is not a valid instance file: ${parsed.error.message} `
      + `(${parsed.error.code})` };
  }
  const store = parsed.store;

  const labels = Object.keys(store.instances);
  if (labels.length === 0) return { ok: false, reason: `${path} declares no instances` };

  // prod above the read-only preset needs a deliberate acknowledgement IN THE FILE. Asked of the
  // completed entry, so a proposed preset is judged by the same rule as a written one.
  for (const [label, entry] of Object.entries(store.instances)) {
    if (entry.environment === 'prod' && entry.preset !== presetNames.readOnly
      && entry.prodWriteAck !== true) {
      return { ok: false, reason: SENTENCE.prodNotAcknowledged(label, entry.preset) };
    }
  }

  return { ok: true, store, labels, notes, modeNote: mode.note ?? null,
    defaultInstance: store.defaultInstance ?? labels[0] };
}

/**
 * The two preset names D-05 proposes, taken from the contract rather than typed.
 *
 * "full" and the read-only one are roles, not spellings: the contract declares the presets and this
 * asks it which is which, so a renamed preset moves the proposal with it.
 */
export function presetsFrom(contract) {
  // Chosen by SHAPE, never by name. D-05 wants "the most permissive" for a sandbox and "the most
  // restrictive" for production; those are roles, and the contract expresses them as how many flags
  // each preset raises. Counting is also what the no-literal-names guard requires — a preset name
  // typed here is indistinguishable from one typed into a wizard — and it survives a rename, which
  // a `find(p => p === 'full')` does not.
  const entries = Object.entries(contract.presets ?? {})
    .map(([name, flags]) => [name, Object.values(flags).filter((v) => v === 'true').length])
    .sort((a, b) => a[1] - b[1]);
  if (entries.length === 0) return { full: undefined, readOnly: undefined };
  return { readOnly: entries[0][0], full: entries.at(-1)[0] };
}
