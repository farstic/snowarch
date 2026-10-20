// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S05 — the rules the two committed registration files must satisfy, as functions.
//
// ARC-06-S01 wrote these as assertions inside `tests/registration-files.test.mjs`, which proves the
// committed files are right at COMMIT time. B01 has to ask the same questions at RUN time, because
// a user can edit `.mcp.json` before running the bootstrap — or commit an edit, which the
// `git diff` check cannot see. Two copies of "what a correct .mcp.json looks like" would be two
// answers, so the rules live here and both callers import them; the test keeps its negatives and
// the value assertions that are documentary rather than structural.
//
// `node:` only. B01 runs in a design-only checkout with no `node_modules`.

/** Every string at any depth, with the path that reached it. */
export function strings(value, path = '', out = []) {
  if (typeof value === 'string') out.push({ path: path.replace(/^\./, ''), value });
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out);
  }
  return out;
}

/** Every key at any depth. */
export function keys(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => keys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.push(k); keys(v, out); }
  }
  return out;
}

const CREDENTIAL_KEY = /PASSWORD|SECRET|TOKEN|_KEY$/i;
const CREDENTIAL_VALUE = (v) => /^[0-9a-f]{32,}$/i.test(v) || /^Basic\s/.test(v)
  || /^Bearer\s/.test(v) || /^https?:\/\/[^/]*@/.test(v);

/**
 * What is wrong with `.mcp.json`, as sentences. Empty means nothing is.
 *
 * Sentences rather than booleans: B01 prints them, and a rule that can only say "false" makes the
 * caller invent the explanation — which is how two descriptions of one problem appear.
 */
export function checkMcpJson(mcp, config) {
  const problems = [];
  const key = config.mcp.serverKey;
  const server = mcp?.mcpServers?.[key];
  if (!server) return [`.mcp.json has no "${key}" server — the key in engine.config.json is not registered`];

  if (server.type !== 'stdio') problems.push(`.mcp.json: ${key}.type is "${server.type}", not stdio`);
  if (server.command !== 'node') problems.push(`.mcp.json: ${key}.command is "${server.command}", not node`);
  if (!Array.isArray(server.args) || server.args.length !== 1) {
    problems.push(`.mcp.json: ${key}.args must be exactly one path`);
  } else {
    const arg = server.args[0];
    if (!arg.startsWith('${CLAUDE_PROJECT_DIR:-.}')) {
      problems.push('.mcp.json: the server path does not start from ${CLAUDE_PROJECT_DIR:-.}');
    }
    if (!arg.endsWith(`/${config.mcp.packageDir}/dist/server.js`)) {
      problems.push(`.mcp.json: the server path does not end at ${config.mcp.packageDir}/dist/server.js`);
    }
    // Node accepts forward slashes on Windows, and a backslash in JSON is an escape waiting to be
    // got wrong.
    if (arg.includes('\\')) problems.push('.mcp.json: the server path uses backslashes');
  }

  // A `${VAR}` without `:-` is passed through as literal characters, handing the server the text
  // `${SNOW_STORE}` as a path.
  for (const { path, value } of strings(mcp)) {
    for (const p of value.match(/\$\{[^}]*\}/g) ?? []) {
      if (!/^\$\{[A-Z_][A-Z0-9_]*:-[^}]*\}$/.test(p)) {
        problems.push(`.mcp.json: ${path} has a placeholder with no default (${p})`);
      }
    }
  }
  problems.push(...credentialProblems('.mcp.json', mcp));
  return problems;
}

/** What is wrong with `.claude/settings.json`. */
export function checkSettingsJson(settings) {
  const problems = [];
  // A SessionStart hook in the COMMITTED file runs before Node is known to exist (S-05 variant B);
  // it belongs in the gitignored local file, written once Node ≥ 20 is confirmed.
  if (settings?.hooks !== undefined) {
    problems.push('.claude/settings.json declares hooks — they would run before Node is proven');
  }
  for (const { path, value } of strings(settings)) {
    if (value.includes('${')) problems.push(`.claude/settings.json: ${path} carries a placeholder`);
  }
  problems.push(...credentialProblems('.claude/settings.json', settings));
  return problems;
}

function credentialProblems(name, obj) {
  const out = [];
  for (const k of keys(obj)) {
    if (CREDENTIAL_KEY.test(k)) out.push(`${name}: "${k}" is a credential-shaped key`);
  }
  for (const { path, value } of strings(obj)) {
    if (CREDENTIAL_VALUE(value)) out.push(`${name}: ${path} is a credential-shaped value`);
  }
  return out;
}
