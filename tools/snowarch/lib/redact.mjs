// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S02 — everything the CLI prints goes through here first.
//
// P-16: the engine this replaces printed a username in clear and kept six copies of a password.
// The rule is not "be careful in the places that handle secrets" — it is that the logger has no
// path that skips redaction, so being careful is not required of anyone later.
const SECRET_KEY = /(PASSWORD|SECRET|TOKEN|_KEY)$/i;

/**
 * Does this name look like it holds a secret?
 *
 * Exported because ARC-06-S03's state file needs the same answer at WRITE time: the redactor stops
 * a secret being printed, and the state guard stops one being stored. Two regexes would be two
 * opinions about which names matter, and the pair would drift the first time either is widened.
 */
export const isSecretKey = (name) => SECRET_KEY.test(String(name));

/**
 * Second segments that make a dotted token something other than a person.
 *
 * Not exhaustive and does not need to be: a false negative here prints a username that the email
 * rule and `register()` would both have caught in the cases that matter, while a false POSITIVE
 * corrupts every log line naming a file. The list is the extensions and TLDs this project's own
 * logs are full of.
 */
const NOT_A_NAME = new Set([
  'mjs', 'js', 'ts', 'cjs', 'json', 'md', 'sh', 'ps1', 'cmd', 'yml', 'yaml', 'txt', 'log', 'lock',
  'com', 'org', 'net', 'io', 'dev', 'local', 'invalid', 'test', 'example', 'gov', 'edu', 'uk', 'de',
  // ARC-09-C207 — git's `http.proxy`, which the upgrade's and the doctor's proxy remedies name: printed as `h***.p***`.
  'proxy',
  // ARC-09-C208 — `cmd.exe`, named in a launcher error. A package id in an install command is the rule below.
  'exe',
]);

/** Values a caller has told us are secret — S07 registers what it reads from the instance store. */
const registered = new Set();

/**
 * Tell the redactor about a value it could not recognise on its own.
 *
 * A password is only a password because of where it came from; nothing about the characters says
 * so. S07 reads one from the store and registers it here, and from that moment it cannot be printed
 * by any code path, including one written afterwards by someone who did not know it existed.
 */
export function register(value) {
  if (typeof value === 'string' && value.length >= 4) registered.add(value);
  return value;
}

/** For tests: forget everything registered. Never called by the CLI. */
export function reset() { registered.clear(); }

/**
 * ARC-09-C208 — the install commands this engine prints, as measured in its remedies: what follows one of them is a
 * package id, never a person, and a user pastes the line into a shell, PowerShell among them, where a backtick is the
 * escape character and the id cannot be quoted as code. `winget install Git.Git` printed as `G***.G***` on Windows.
 * Flags between the command and the id are allowed (`brew install --cask …`).
 */
const INSTALL_COMMAND = /\b(?:winget|brew|apt|dnf) install\s+(?:-{1,2}[\w-]+\s+)*$/;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The four rules, applied in order.
 *
 * (d) runs LAST and over the already-redacted text, so a registered value that also matched an
 * earlier rule is not double-reported — and one that appears in a context no rule anticipated is
 * still caught. The length is kept because "set (len 24)" is often exactly what an operator needs
 * to know: that the value is there, and roughly what shape.
 */
export function redact(input) {
  if (typeof input !== 'string') return input;
  let out = input;

  // (a) KEY=value and "key": "value" where the key names a secret.
  out = out.replace(/\b([A-Za-z_][A-Za-z0-9_]*)=(\S+)/g,
    (m, k, v) => (SECRET_KEY.test(k) ? `${k}=set (len ${v.length})` : m));
  out = out.replace(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*"([^"]*)"/g,
    (m, k, v) => (SECRET_KEY.test(k) ? `"${k}": "set (len ${v.length})"` : m));

  // (b) an Authorization header, whatever scheme it carries.
  out = out.replace(/\b(Authorization)\s*:\s*\S.*/gi, '$1: <redacted>');

  // (c) usernames. An address keeps its DOMAIN — an operator needs to know which directory the
  // account is in — and a bare `first.last` handle keeps its shape without its letters.
  //
  // The two rules are applied with the addresses held aside, because they overlap: run naively, the
  // dotted-name rule chews the domain of an address the email rule has already handled and
  // `c***@corp.example.com` comes out as `c***@corp.e***.c***`. Which it did, on the first run.
  const held = [];
  out = out.replace(/\b([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, (m, a, d) => {
    held.push(`${a}***@${d}`);
    return `\u0000${held.length - 1}\u0000`;
  });
  // The bare `first.last` form is the dangerous one to apply broadly: `sync.mjs`, `package.json`
  // and `corp.example.com` all match it, and a logger that renders `s***.m***` for a filename makes
  // its own logs unreadable — which is a worse failure than the one it was guarding against, since
  // nobody then reads them at all. Measured on the first run: every filename in this repository.
  //
  // So it fires only where a username plausibly is: not inside a path or URL, not when the second segment is a file
  // extension or a top-level domain, and not on the package id an install command names (ARC-09-C208).
  out = out.replace(/(^|[\s([])([A-Za-z])([a-z]+)\.([A-Za-z])([a-z]+)\b(?!\.[A-Za-z])/g,
    (m, lead, a, arest, b, brest, at, text) => (NOT_A_NAME.has(`${b}${brest}`.toLowerCase())
      || INSTALL_COMMAND.test(text.slice(0, at + lead.length))
      ? m
      : `${lead}${a}***.${b}***`));
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)]);

  // (d) anything a caller registered, last and over the redacted text.
  for (const v of registered) out = out.replace(new RegExp(escape(v), 'g'), '<redacted>');
  return out;
}
