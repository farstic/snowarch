// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S01 — the `prereqs` object, whose consumer was agreed before it existed.
//
// `/snowarch setup-instance` (ARC-07-S09) is its only reader and branches on it, so the fields were
// fixed on 2026-09-10 in both stories rather than discovered later. Until this shipped, the skill
// degraded honestly — it read the bootstrap state and printed BOTH command spellings; that fallback
// is what these six fields remove.
//
// `shell` is the field the doctor did not have. It is a GUESS at the parent process, and `unknown`
// is a first-class answer: a wrong guess sends a reader a command their shell cannot run, and
// "I could not tell, here are both" is more useful than a confident mistake.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storePath as storePathOf } from '../local-paths.mjs';

import { meetsFloor } from '../versions.mjs';

export const SHELLS = Object.freeze(['bash', 'zsh', 'powershell', 'cmd', 'unknown']);

/** The parent process's name, mapped to a shell this product knows how to address. */
export function guessShell({ platform = process.platform, env = process.env, ppid = process.ppid,
  exec = execFileSync } = {}) {
  // Windows first: `%COMSPEC%` and PowerShell's own variables are more reliable there than any
  // process walk, and `ps` does not exist to walk with.
  if (platform === 'win32') {
    if (env.PSModulePath) return 'powershell';
    if (/cmd\.exe$/i.test(env.ComSpec ?? '')) return 'cmd';
    return 'unknown';
  }
  try {
    const name = String(exec('ps', ['-o', 'comm=', '-p', String(ppid)], { encoding: 'utf8' })).trim();
    const base = name.replace(/^-/, '').split('/').pop() ?? '';
    if (/^zsh$/.test(base)) return 'zsh';
    if (/^(bash|sh)$/.test(base)) return 'bash';
    if (/^pwsh$/.test(base)) return 'powershell';
    return 'unknown';
  } catch {
    // No `ps`, no permission, a container without a process table: all the same answer.
    return 'unknown';
  }
}

/**
 * The six fields, from the checkout rather than from a check.
 *
 * This is deliberately NOT a check: checks report a status a human reads, and this is a fact table
 * a program branches on. Making it a check would give it a `status` that means nothing — what is
 * the "ok" of an operating system?
 */
export function collectPrereqs({ root, config, platform = process.platform, env = process.env,
  shell = undefined, nodeVersion = process.versions.node, storePath = undefined } = {}) {
  const floor = config?.floors?.node;
  const depsInstalled = existsSync(join(root, 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'))
    || existsSync(join(root, 'packages', 'snowarch', 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'));

  // `.claude/settings.local.json` decides the toggle; its absence is `absent`, which is a third
  // answer rather than a synonym for `disabled` — a checkout that never ran the bootstrap and one
  // that deliberately turned the server off need different sentences.
  let toggle = 'absent';
  const settings = join(root, '.claude', 'settings.local.json');
  if (existsSync(settings)) {
    try {
      const parsed = JSON.parse(readFileSync(settings, 'utf8'));
      const disabled = Array.isArray(parsed.disabledMcpjsonServers) ? parsed.disabledMcpjsonServers : [];
      toggle = disabled.includes(config?.mcp?.serverKey) ? 'disabled' : 'enabled';
    } catch {
      toggle = 'absent';
    }
  }

  return {
    os: platform,
    shell: shell ?? guessShell({ platform, env }),
    node: {
      ok: floor ? meetsFloor(nodeVersion, floor).ok : true,
      version: nodeVersion,
    },
    deps: { ok: depsInstalled },
    mode: { toggle },
    store: { exists: existsSync(storePath ?? storePathOf(root)) },
  };
}
