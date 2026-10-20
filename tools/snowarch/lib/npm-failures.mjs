// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S07 — npm's log → the sentence the operator needs.
//
// `npm ci` fails in a handful of ways that all look the same from outside ("it didn't install"),
// and four of them have completely different fixes. The mapping is a module rather than a switch
// inside B04 because ARC-08's doctor reports the same failures and must say the same words.
//
// The network cases lean on ARC-03-S05's shared vocabulary where the SUBJECT is the same, and
// diverge where it is not: npm reaches the registry, not github.com, and its CA setting is its own.
import { NOTFOUND } from 'node:dns';
import * as SENTENCE from './net-sentences.mjs';

export const REGISTRY = 'registry.npmjs.org';

export const NPM_SENTENCE = Object.freeze({
  dns: `cannot reach ${REGISTRY} (DNS) — check your network or proxy `
    + '(npm config set https-proxy <url>, or HTTPS_PROXY) and re-run',
  tls: 'TLS interception detected — export NODE_EXTRA_CA_CERTS=<corporate CA .pem> (npm honours it) '
    + 'and re-run',
  integrity: 'lockfile integrity mismatch — this checkout is inconsistent; run: git status && '
    + 'git checkout -- package-lock.json, then re-run',
  eacces: 'permission denied under node_modules — remove it (rm -rf node_modules) and re-run; '
    + 'never use sudo',
  disk: SENTENCE.noDiskSpace,
  missing: 'npm is not on PATH — install Node.js 20+ (which bundles npm) and re-run',
});

/**
 * Classify by the code npm printed, and fall back to showing the log.
 *
 * The fallback matters more than the cases: an unmapped failure that printed nothing useful is how
 * an installer earns "it just says it failed". So the last lines and the log's path go to the
 * operator, and the log is the one the S02 logger already wrote.
 */
export function classifyNpmFailure(log, { logPath = null, tail = 20 } = {}) {
  const text = String(log ?? '');
  const up = text.toUpperCase();

  // The resolver codes come from Node's own table, not from quoted copies: one of these is also a
  // name the MCP contract owns, and a literal here is indistinguishable from a contract name typed
  // into engine tooling. `EAI_AGAIN` is written out because Node publishes no constant for it.
  if (up.includes(NOTFOUND) || up.includes('EAI_AGAIN')) return NPM_SENTENCE.dns;
  if (up.includes('UNABLE_TO_GET_ISSUER_CERT_LOCALLY') || up.includes('SELF_SIGNED_CERT_IN_CHAIN')
    || up.includes('CERT_HAS_EXPIRED') || up.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE')) {
    return NPM_SENTENCE.tls;
  }
  if (up.includes('EINTEGRITY')) return NPM_SENTENCE.integrity;
  if (up.includes('EACCES') || up.includes('EPERM')) return NPM_SENTENCE.eacces;
  if (up.includes('ENOSPC') || up.includes('NO SPACE LEFT')) return NPM_SENTENCE.disk;

  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
  const shown = lines.slice(-tail);
  return `npm ci failed. Last ${shown.length} line(s) of its output:\n${shown.join('\n')}`
    + (logPath ? `\nFull log: ${logPath}` : '');
}
