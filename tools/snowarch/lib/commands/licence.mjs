// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C1 — `./snowarch licence`: the licensee's three commands and the owner's five.
 *
 *   show                   the installed licence: its fields, its signature, its term, the list it was
 *                          judged against, enforcement, and the product's public keys
 *   verify <file>          the same judgement of any licence file
 *   check [--refresh]      what the start-up check finds; `--refresh` fetches the revocation list first, and this
 *                          release's signed manifest (ARC-11-C7)
 *   keygen                 the owner's two key pairs, the creator's licence and the issue ledger
 *   issue                  a signed licence, numbered from the ledger beside the key
 *   init-list              the first revocation list: version 1, empty, signed
 *   revoke <id>            the list with one more entry and a higher version
 *   sign-release <tag>     a release's build-integrity manifest, signed into the licences repository (ARC-11-C7)
 *
 * PRIVATE KEYS LIVE OUTSIDE THE CHECKOUT, AND ONLY THERE. Every path a private key is written to or
 * read from is refused when it resolves — symlinks followed — inside this checkout or its `.local/`.
 * A key inside a working tree is one `git add -A` from a public repository, and the private keys are
 * the whole of what makes a licence mean anything. Nothing this command prints contains one.
 *
 * THE PRODUCT NEVER PUSHES. `init-list`, `revoke` and `sign-release` write into the owner's clone of the list
 * repository and print the git commands; the owner runs them.
 *
 * Exit codes: the three read commands exit 0 when the licence is in force (`ok` or `expiring`) and 1
 * otherwise, so a script can ask; the owner's five exit 0 when they wrote what they said; 2 is usage.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { loadConfig } from '../config.mjs';
import { EXIT_FAIL, EXIT_OK, EXIT_USAGE } from '../exit.mjs';
import { localDir, licencePath } from '../local-paths.mjs';
import { isWindowsShell, spellings } from '../text.mjs';
import {
  checkLicence, fingerprint, ID_PATTERN, licenceProblem, publicKeyOf, readList, REASONS, SCOPES, signLicence,
  signList, utcDate,
} from '../licence/core.mjs';
import { PRODUCT_KEYS } from '../licence/keys.mjs';
import { listSource, manifestSays, manifestSource, refreshList, refreshManifest, refreshSays } from '../licence/fetch.mjs';
import {
  MANIFESTS_FROM, manifestFromArchive, readManifest, releaseTagOf, signManifest, signedRelease,
} from '../licence/manifest.mjs';
import {
  allowedPhrase, bannerLine, heldList, licenceStatus, listStale, readListCache, REFUSED, renewalSentence,
} from '../licence/state.mjs';

export const USAGE = (where) => {
  const cli = spellings(where).cli;
  return [
    `usage: ${cli} licence <command> …`,
    '',
    '  show                     the installed licence, its signature and term, and the product\'s keys',
    '  verify <file>            the same for any licence file',
    '  check [--refresh]        what the start-up check finds; --refresh fetches the revocation list first,',
    '                           and this release\'s signed manifest',
    '',
    '  the owner\'s, with private keys kept outside this checkout:',
    '  keygen --out <file> --recovery-out <file> --to <name> --org <org>',
    '  issue --to <name> --org <org> --scope live|design-only (--valid-until YYYY-MM-DD | --perpetual)',
    '        --key <file> [--notes <text>] [--id LIC-YYYY-NNNN] [--issuer <name>] [--out <file>]',
    '  init-list --list <dir> --key <file>',
    `  revoke <LIC-YYYY-NNNN> --reason ${REASONS.join('|')} --key <file> --list <dir>`,
    '  sign-release <vX.Y.Z> --key <file> --list <dir>',
  ].join('\n');
};

/** A usage problem: printed with the usage, exit 2. */
class Usage extends Error {}

/** One value of a value flag, or `undefined`; a flag given twice is a usage error, never a guess. */
function one(flags, name) {
  const v = flags[name];
  if (Array.isArray(v)) throw new Usage(`--${name} was given more than once`);
  if (v === true) throw new Usage(`--${name} needs a value`);
  return v;
}

function required(flags, sub, names) {
  const missing = names.filter((n) => one(flags, n) === undefined);
  if (missing.length > 0) throw new Usage(`licence ${sub} needs ${missing.map((n) => `--${n}`).join(', ')}`);
  return names.map((n) => one(flags, n));
}

/**
 * A value pasted as it stood from an example, `<your name>`, rather than typed (the architect's ruling,
 * 2026-10-11). The owner's keygen took `--org "<фирма или твоето име>"` that way, and the creator licence
 * carries it: a licence is signed, so a placeholder in one stays there. Refused for `--to` and `--org`,
 * once trimmed, before anything is written; a value that only CONTAINS a bracket is a value.
 */
function realValue(flag, value) {
  const trimmed = String(value).trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    throw new Usage(`--${flag} ${JSON.stringify(value)} is a placeholder, not a value — type the real `
      + `${flag === 'to' ? 'name' : 'company, or the name again'}, without angle brackets`);
  }
  return value;
}

/** The real path of `p`, following symlinks through the nearest part of it that exists. */
function realish(p) {
  let head = resolve(p);
  const tail = [];
  while (!existsSync(head)) {
    const up = dirname(head);
    if (up === head) break;
    tail.unshift(basename(head));
    head = up;
  }
  let real = head;
  try { real = realpathSync.native(head); } catch { /* keep the resolved spelling */ }
  return join(real, ...tail);
}

const within = (child, parent) => {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
};

/** Is `path` inside this checkout or its `.local/` (which a state root may have moved elsewhere)? */
export const insideCheckout = (path, root) => [root, localDir(root)].some((dir) => within(realish(path), realish(dir)));

function outsideOnly(path, root, what) {
  if (insideCheckout(path, root)) {
    throw new Usage(`${path} is inside this checkout — ${what} is kept only outside it, and never under .local/`);
  }
}

/** Write a new file and never replace one: `wx` fails if it exists, after the check that says why. */
function writeNew(path, text, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, text, { mode, flag: 'wx' });
}

/** Replace a file whole: written beside it, then renamed over it. */
function replace(path, text, mode = 0o600) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text, { mode });
  renameSync(tmp, path);
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function readPrivateKey(path) {
  let pem;
  try { pem = readFileSync(path, 'utf8'); } catch { throw new Usage(`cannot read ${path}`); }
  try { publicKeyOf(pem); } catch { throw new Usage(`${path} is not a private key this command can sign with`); }
  return pem;
}

/** The next free id for `year` in a ledger: one past the highest issued that year. */
function nextId(ledger, year) {
  const nums = (ledger.issued ?? []).map((e) => new RegExp(`^LIC-${year}-(\\d{4})$`).exec(e.id)?.[1]).filter(Boolean).map(Number);
  return `LIC-${year}-${String((nums.length > 0 ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`;
}

/**
 * ARC-11-C6 step 7 — the `valid until:` line that show, verify and check print. The date is a UTC day
 * (docs/USER-GUIDE.md), and the line says so, with what is left of it: "(UTC, 10 days)", "(UTC, 1 day)",
 * "(UTC, last day)". An expired licence's says the day alone: its `why:` line says when it ended.
 */
function validUntilLine(s) {
  if (s.perpetual) return '  valid until:  perpetual';
  const days = s.daysLeft;
  const left = days < 0 ? '' : `, ${days === 0 ? 'last day' : `${days} day${days === 1 ? '' : 's'}`}`;
  return `  valid until:  ${s.validUntil} (UTC${left})`;
}

function describe(log, s) {
  if (s.state === 'missing') return;
  if (s.signatureValid) {
    log.step(`  id:           ${s.id}`);
    log.step(`  licensee:     ${s.licensee}`);
    log.step(`  org:          ${s.org}`);
    log.step(`  scope:        ${s.scope}`);
    log.step(`  issued:       ${s.issued}`);
    log.step(validUntilLine(s));
    log.step(`  signature:    valid — ${s.key} key`);
  }
  if (s.reason && s.state !== 'ok' && s.state !== 'expiring') log.step(`  why:          ${s.reason}`);
}

function enforcementLines(log, s) {
  log.step(REFUSED.includes(s.state)
    ? `  every command but ${allowedPhrase()} is refused, and every MCP tool`
    : '  nothing is refused while the licence is in force');
  if (s.scope === 'design-only' && !REFUSED.includes(s.state)) {
    log.step(`  scope: licence ${s.id} covers design-only; live needs a live-scope licence, so a live server refuses every tool`);
  }
}

/**
 * The list's line. One checked more than a day ago says so: a live server start refreshes it, but a
 * design-only checkout fetches it only when somebody asks.
 */
const listLine = (s, now) => {
  if (!s.list) return '  revocation list: none held';
  const stale = listStale({ checkedAt: s.list.checkedAt }, now) ? ' — more than a day old; --refresh fetches it now' : '';
  return `  revocation list: version ${s.list.version}, checked ${s.list.checkedAt}${stale}`;
};

const inForce = (s) => (s.state === 'ok' || s.state === 'expiring' ? EXIT_OK : EXIT_FAIL);

function show({ log, root, keys, now, flags }) {
  const s = licenceStatus(root, { keys, now: now() });
  if (flags.json) {
    log.json({ ...s, path: licencePath(root), keys: keys.map(({ role, fingerprint: fp }) => ({ role, fingerprint: fp })) });
    return inForce(s);
  }
  log.step(bannerLine(s));
  if (s.state === 'missing') log.step(`  no licence is installed at ${licencePath(root)}`);
  describe(log, s);
  log.step(listLine(s, now()));
  enforcementLines(log, s);
  log.step('');
  if (keys.length === 0) {
    log.step('Product keys: none ship in this build, so every licence reads invalid until they do.');
  } else {
    log.step('Product keys:');
    for (const k of keys) {
      log.step(`  ${k.role.padEnd(9)} ${fingerprint(k.publicKey)}`);
      for (const line of k.publicKey.trim().split('\n')) log.step(`    ${line}`);
    }
  }
  return inForce(s);
}

function verifyFile({ positional, log, root, keys, now }) {
  const file = positional[1];
  if (!file) throw new Usage('licence verify needs the licence file to check');
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { throw new Usage(`cannot read ${file}`); }
  const s = checkLicence(text, { keys, list: heldList(readListCache(root), keys), now: now() });
  log.step(bannerLine(s));
  describe(log, s);
  return inForce(s);
}

/**
 * ARC-09-C156 — the licences in `.local/` under any name but the one the product reads.
 *
 * The Windows colleague's 2.1.0 install (2026-10-15) copied the file into `.local/` under the name it was sent with,
 * and every surface said `Licence: missing`. A JSON there counts only when it verifies as a licence under a key this
 * product ships, so the product's own files (the store, the caches) are never named. Read, never printed: the caller
 * names the file and nothing in it.
 */
function strayLicences(root, { keys, now }) {
  const dir = localDir(root);
  const own = basename(licencePath(root));
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter((name) => name.endsWith('.json') && name !== own).sort().filter((name) => {
    try {
      const path = join(dir, name);
      if (statSync(path).size > 64 * 1024) return false;
      return checkLicence(readFileSync(path, 'utf8'), { keys, now }).signatureValid === true;
    } catch {
      return false;
    }
  });
}

function check({ flags, log, root, keys, now, env, config, where }) {
  if (flags.refresh) {
    const r = refreshList(root, { config: config(), keys, now: now(), env });
    log.step(refreshSays(r));
    // ARC-11-C7 — and the manifest E-32 reads, the remedy E-32 names for a missing, invalid or other one.
    const tag = releaseTagOf(root);
    if (tag) log.step(manifestSays(refreshManifest(root, { config: config(), tag, keys, now: now(), env })));
  }
  const s = licenceStatus(root, { keys, now: now() });
  if (flags.json) {
    log.json(s);
    return inForce(s);
  }
  log.step(bannerLine(s));
  // The command every remedy names says what the day means too (ruling B): a term, from a signature that holds.
  if (s.signatureValid && !s.perpetual) log.step(validUntilLine(s));
  // ARC-09-C159 — E-31's remedy for a licence in force that is expiring, in the same words.
  if (s.state === 'expiring') log.step(`  ${renewalSentence(s)}`);
  if (s.reason && s.state !== 'ok' && s.state !== 'expiring') log.step(`  why: ${s.reason}`);
  if (s.state === 'missing') {
    const dir = localDir(root);
    const cli = spellings(where).cli;
    for (const name of strayLicences(root, { keys, now: now() })) {
      log.step(`  found: ${name} in .local/ is a licence under another name, and only licence.json is read. `
        + `Rename it, then run ${cli} licence check again:`);
      log.step(isWindowsShell(where)
        ? `    Move-Item "${dir}\\${name}" "${dir}\\licence.json"`
        : `    mv "${dir}/${name}" "${dir}/licence.json"`);
    }
  }
  log.step(listLine(s, now()));
  enforcementLines(log, s);
  return inForce(s);
}

function keygen({ flags, log, root, now, where }) {
  const [out, rec, to, org] = required(flags, 'keygen', ['out', 'recovery-out', 'to', 'org']);
  realValue('to', to);
  realValue('org', org);
  outsideOnly(out, root, 'a private key');
  outsideOnly(rec, root, 'a private key');
  if (realish(out) === realish(rec)) throw new Usage('the primary and the recovery key need two different paths');
  const dir = dirname(resolve(out));
  const year = now().getUTCFullYear();
  const id = `LIC-${year}-0001`;
  const creator = join(dir, `${id}.json`);
  const ledger = join(dir, 'issued.json');
  const pub = join(dir, 'public-keys.json');
  for (const p of [out, rec]) if (existsSync(p)) throw new Usage(`${p} exists — keygen never overwrites a key`);
  for (const p of [creator, ledger, pub]) {
    if (existsSync(p)) throw new Usage(`${p} exists — it belongs to another set of keys; choose an empty directory`);
  }

  const pair = () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return { publicKey: publicKey.export({ type: 'spki', format: 'pem' }), privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  };
  const primary = pair();
  const recovery = pair();
  writeNew(out, primary.privateKey);
  writeNew(rec, recovery.privateKey);
  const keys = [
    { role: 'primary', fingerprint: fingerprint(primary.publicKey), publicKey: primary.publicKey },
    { role: 'recovery', fingerprint: fingerprint(recovery.publicKey), publicKey: recovery.publicKey },
  ];
  const issued = utcDate(now());
  const payload = { id, licensee: to, org, scope: 'live', issued, issuer: to, notes: 'creator licence, issued by keygen' };
  writeNew(creator, json(signLicence(payload, primary.privateKey)));
  writeNew(ledger, json({ issuer: to, issued: [{ id, licensee: to, org, scope: 'live', issued, valid_until: null }] }));
  writeNew(pub, json({ keys }), 0o644);

  const cli = spellings(where).cli;
  log.step('licence keygen: two key pairs, the creator licence and the issue ledger');
  log.step(`  primary key     ${out}`);
  log.step(`  recovery key    ${rec}`);
  log.step(`  creator licence ${creator} — ${id}, live, perpetual`);
  log.step(`  ledger          ${ledger}`);
  log.step(`  public keys     ${pub}`);
  log.step('');
  log.step('The two PUBLIC keys, to be committed into the product (public — safe to send):');
  for (const k of keys) {
    log.step(`  ${k.role.padEnd(9)} ${k.fingerprint}`);
    for (const line of k.publicKey.trim().split('\n')) log.step(`    ${line}`);
  }
  log.step('');
  log.step('Back up both private keys offline now, and keep the recovery key off this machine: it signs only when '
    + 'the primary is lost. With both lost, every licence has to be issued again under new keys, in a new release.');
  log.step(`Send ${basename(pub)} — never a private key — to have the public keys committed into the product.`);
  log.step(`Install the creator licence by copying ${creator} to .local/licence.json in your checkout, `
    + `then run ${cli} licence check.`);
  return EXIT_OK;
}

function issue({ flags, log, root, keys, now }) {
  const [to, org, scope, keyPath] = required(flags, 'issue', ['to', 'org', 'scope', 'key']);
  realValue('to', to);
  realValue('org', org);
  const validUntil = one(flags, 'valid-until');
  const perpetual = flags.perpetual === true;
  if ((validUntil === undefined) === !perpetual) {
    throw new Usage('licence issue needs exactly one of --valid-until YYYY-MM-DD and --perpetual');
  }
  if (!SCOPES.includes(scope)) throw new Usage(`--scope is one of ${SCOPES.join(', ')}`);
  outsideOnly(keyPath, root, 'a private key');
  const key = readPrivateKey(keyPath);
  const ledgerPath = join(dirname(resolve(keyPath)), 'issued.json');
  let ledger = null;
  if (existsSync(ledgerPath)) {
    try { ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')); } catch { throw new Usage(`${ledgerPath} is not JSON`); }
  }
  const idFlag = one(flags, 'id');
  if (idFlag !== undefined && !ID_PATTERN.test(idFlag)) throw new Usage('--id is LIC-YYYY-NNNN');
  if (idFlag === undefined && !ledger) {
    throw new Usage(`there is no issued.json beside ${keyPath} to number from — pass --id LIC-YYYY-NNNN, `
      + 'checked against the ledger beside the primary key, so no two licences share an id');
  }
  const id = idFlag ?? nextId(ledger, now().getUTCFullYear());
  if (ledger?.issued?.some((e) => e.id === id)) throw new Usage(`${id} is already in ${ledgerPath}`);
  const issuer = one(flags, 'issuer') ?? ledger?.issuer;
  if (!issuer) throw new Usage('licence issue needs --issuer when the ledger does not name one');

  const payload = { id, licensee: to, org, scope, issued: utcDate(now()), ...(perpetual ? {} : { valid_until: validUntil }),
    issuer, notes: one(flags, 'notes') ?? '' };
  const problem = licenceProblem(payload);
  if (problem) throw new Usage(`licence issue: ${problem}`);
  const outPath = one(flags, 'out') ?? join(dirname(resolve(keyPath)), `${id}.json`);
  if (existsSync(outPath)) throw new Usage(`${outPath} exists — issue never replaces a licence`);

  const fp = fingerprint(publicKeyOf(key));
  if (!keys.some((k) => fingerprint(k.publicKey) === fp)) {
    log.warn(`the signing key ${fp} is not one this build ships, so this licence verifies only in a build that ships it`);
  }
  writeNew(outPath, json(signLicence(payload, key)));
  if (ledger) {
    const entry = { id, licensee: to, org, scope, issued: payload.issued, valid_until: payload.valid_until ?? null };
    replace(ledgerPath, json({ ...ledger, issued: [...(ledger.issued ?? []), entry] }));
  } else {
    log.warn(`no ledger beside ${keyPath}: record ${id} in the ledger beside the primary key yourself`);
  }
  log.step(`licence issue: ${id} for ${to} (${org}), ${scope}, ${perpetual ? 'perpetual' : `until ${validUntil}`}`);
  log.step(`  written to ${outPath}`);
  log.step('Send this file to the licensee, who installs it by copying it to .local/licence.json in their checkout.');
  // ARC-09-C156 — the two commands, with the file's real name, because "copying it to .local/licence.json" was read
  // as "into .local/" on the Windows colleague's install (2026-10-15). From the checkout folder, as every other
  // command there runs; Downloads is where a sent file lands, and the line after says what to change if not.
  const name = basename(outPath);
  const posixName = /^[\w.@%+=:,-]+$/.test(name) ? name : `'${name.replace(/'/g, "'\\''")}'`;
  log.step('  It must be named licence.json there: a copy under its own name is not read. From their checkout folder, '
    + 'with the file in Downloads:');
  log.step(`    macOS or Linux:      cp ~/Downloads/${posixName} .local/licence.json`);
  log.step(`    Windows PowerShell:  Copy-Item "$HOME\\Downloads\\${name}" .local\\licence.json`);
  log.step('  Saved somewhere else, that folder replaces Downloads. Then they restart Claude Code, whose banner names the licence.');
  return EXIT_OK;
}

/** The git commands that publish the list; the product never runs them. */
function pushCommands(log, dir, source, { first }) {
  const q = `"${dir}"`;
  const url = source?.url ?? '<the list repository\'s URL>';
  const ref = source?.ref ?? 'main';
  const file = source?.path ?? 'revocations.json';
  const lines = [];
  if (!existsSync(join(dir, '.git'))) {
    lines.push(`git -C ${q} init -b ${ref}`, `git -C ${q} remote add origin ${url}`);
  }
  lines.push(`git -C ${q} add ${file}`, `git -C ${q} commit -m "${first ? 'Revocation list, version 1' : 'Revocation list'}"`,
    `git -C ${q} push ${first ? '-u ' : ''}origin ${ref}`);
  log.step('');
  log.step('Publish it — the product never pushes, so run these yourself:');
  for (const l of lines) log.step(`  ${l}`);
}

function listDir(flags, root, sub) {
  const [dir, keyPath] = required(flags, sub, ['list', 'key']);
  outsideOnly(dir, root, 'the revocation list repository');
  outsideOnly(keyPath, root, 'a private key');
  if (!existsSync(dir)) throw new Usage(`${dir} does not exist — clone the list repository there first`);
  return { dir, key: readPrivateKey(keyPath) };
}

function initList({ flags, log, root, config }) {
  const { dir, key } = listDir(flags, root, 'init-list');
  const source = listSource(config());
  const file = join(dir, source?.path ?? 'revocations.json');
  if (existsSync(file)) throw new Usage(`${file} exists — init-list writes the first list only; revoke adds to it`);
  writeNew(file, json(signList({ version: 1, revoked: [] }, key)), 0o644);
  log.step(`licence init-list: ${file} — version 1, empty, signed`);
  pushCommands(log, dir, source, { first: true });
  return EXIT_OK;
}

function revoke({ positional, flags, log, root, keys, now, config, where }) {
  const id = positional[1];
  if (!id || !ID_PATTERN.test(id)) throw new Usage('licence revoke takes a licence id, LIC-YYYY-NNNN — never a name');
  const reason = one(flags, 'reason');
  if (!REASONS.includes(reason)) {
    throw new Usage(`--reason is one of ${REASONS.join(', ')}: the list carries no names and no free text`);
  }
  const { dir, key } = listDir(flags, root, 'revoke');
  const source = listSource(config());
  const file = join(dir, source?.path ?? 'revocations.json');
  let held = null;
  if (existsSync(file)) {
    // The signing key is trusted for its own list as well as the shipped keys, so the owner can manage
    // the list with a key a given build does not ship yet.
    // owner key from path: the owner's own list file, checked before it is re-signed; no licensee's state reads it
    const trust = [...keys, { role: 'signing', publicKey: publicKeyOf(key) }];
    held = readList(readFileSync(file, 'utf8'), { keys: trust });
    if (!held.ok) {
      log.fail(`licence revoke: ${file} does not verify (${held.reason}) — nothing was changed`);
      return EXIT_FAIL;
    }
    if (held.revoked.some((e) => e.id === id)) throw new Usage(`${id} is already revoked in version ${held.version}`);
  }
  const next = { version: (held?.version ?? 0) + 1,
    revoked: [...(held?.revoked ?? []), { id, revokedAt: utcDate(now()), reason }] };
  if (held) replace(file, json(signList(next, key)), 0o644);
  else writeNew(file, json(signList(next, key)), 0o644);
  log.step(`licence revoke: ${id} (${reason}) — ${file} is now version ${next.version}`);
  pushCommands(log, dir, source, { first: !held });
  const cli = spellings(where).cli;
  log.step('');
  log.step('A machine with that licence reads it as revoked at its next refresh: its next live server start, '
    + `${cli} upgrade, ${cli} upgrade --check, or ${cli} licence check --refresh.`);
  return EXIT_OK;
}

/**
 * ARC-11-C7 — `sign-release <tag>`: the owner signs a release's build-integrity manifest into the licences repository.
 *
 * It runs between the tag and its push (CONTRIBUTING's release checklist, step 3a). The manifest is the tag's tree as
 * a checkout writes it, read from `git archive <tag>` in this checkout, and it is written to `<dir>/<tag>.json` in the
 * clone `--list` names, beside the revocation list. An rc tag is signed as a final is.
 *
 * VERIFIED WITH THE SHIPPED KEYS before it is written. A manifest signed by a key no build ships verifies nowhere, so
 * it is refused here, where the owner can still pick the right key, rather than on every machine that fetches it. The
 * private key is only ever a signer: nothing is checked with it.
 *
 * A TAG IS SIGNED ONCE. An existing record is refused rather than replaced: a re-cut tag is a new release, and the old
 * record is removed in the licences repository by hand, where its history keeps it.
 */
function signRelease({ positional, flags, log, root, keys, config }) {
  const tag = positional[1];
  if (!tag || !/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Usage('licence sign-release takes a release tag, v<major>.<minor>.<patch>');
  }
  if (!signedRelease(tag)) throw new Usage(`${tag} is before ${MANIFESTS_FROM}: manifests are signed from ${MANIFESTS_FROM} on`);
  const { dir, key } = listDir(flags, root, 'sign-release');
  let manifest;
  try { manifest = manifestFromArchive(root, tag); } catch (e) { throw new Usage(e.message); }
  const count = Object.keys(manifest.files).length;
  if (count === 0) throw new Usage(`${tag} has none of the files a manifest covers`);
  const doc = signManifest(manifest, key);
  const read = readManifest(doc, { keys });
  if (!read.ok) {
    log.fail(`licence sign-release: the manifest does not verify with the keys this product ships (${read.reason}) `
      + '— nothing was written');
    return EXIT_FAIL;
  }
  const where = manifestSource(config()) ?? { url: null, ref: 'main', dir: 'releases' };
  const rel = `${where.dir}/${tag}.json`;
  const file = join(dir, ...rel.split('/'));
  if (existsSync(file)) {
    throw new Usage(`${file} exists — a tag is signed once; a re-cut tag's old record is removed in the licences `
      + 'repository first');
  }
  writeNew(file, json(doc), 0o644);
  log.step(`licence sign-release: ${tag} (${manifest.commit.slice(0, 7)}, ${count} files, the ${read.key} key) — ${file}`);
  const q = `"${dir}"`;
  const lines = [];
  if (!existsSync(join(dir, '.git'))) {
    lines.push(`git -C ${q} init -b ${where.ref}`,
      `git -C ${q} remote add origin ${where.url ?? '<the licences repository\'s URL>'}`);
  }
  lines.push(`git -C ${q} add ${rel}`, `git -C ${q} commit -m "Release manifest, ${tag}"`, `git -C ${q} push origin ${where.ref}`);
  log.step('');
  log.step('Publish it before the tag is pushed — the product never pushes, so run these yourself:');
  for (const l of lines) log.step(`  ${l}`);
  return EXIT_OK;
}

const SUBCOMMANDS = { show, verify: verifyFile, check, keygen, issue, 'init-list': initList, revoke, 'sign-release': signRelease };

export async function licenceCommand({ flags = {}, positional = [], log, root, env = process.env,
  now = () => new Date(), keys = PRODUCT_KEYS, config = undefined, platform = process.platform } = {}) {
  const where = { platform, env };
  const sub = SUBCOMMANDS[positional[0]];
  const configOf = () => {
    if (config !== undefined) return config;
    try { return loadConfig(root); } catch { return null; }
  };
  try {
    if (!sub) throw new Usage(positional[0] ? `licence has no "${positional[0]}" command` : 'licence needs a command');
    return sub({ flags, positional, log, root, env, now, keys, config: configOf, where });
  } catch (e) {
    if (!(e instanceof Usage)) throw e;
    log.fail(e.message);
    log.step(USAGE(where));
    return EXIT_USAGE;
  }
}
