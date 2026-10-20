// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C1 — the revocation list, fetched by git from its explicit URL: the server's copy.
 *
 * The CLI's `tools/snowarch/lib/licence/fetch.mjs` is the other copy, synchronous and on a 15-second
 * budget for a person waiting at a terminal. This one is ASYNCHRONOUS and on a 3-second budget, because
 * it runs at a live server start, in the background, and must never block the first tool or fail
 * anything (the architect's ruling (b)). The outcomes and the cache rules are the same:
 *
 *   fetched     — the branch and the file are there; verified before anything uses it.
 *   none        — the repository answered with no branch, or no file on it: no list, silently.
 *   unreachable — offline, a wrong URL, a proxy, the budget spent: the cached list stands, or none.
 *
 * And git is denied every way of asking for a password: a background refresh that opened a credential
 * window, or waited on a prompt nobody can see, would be worse than no refresh.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newerList, readList } from './core.js';
import { PRODUCT_KEYS } from './keys.js';
import { heldList, listSource, readListCache, writeListCache } from './state.js';
/** A live start's whole budget for the refresh, across its three git calls. */
export const LIVE_BUDGET_MS = 3_000;
const NO_PROMPT_ENV = { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '', GCM_INTERACTIVE: 'never' };
const NO_HELPER = ['-c', 'credential.helper='];
function git(args, env, timeout) {
    return new Promise((resolve) => {
        if (timeout <= 0) {
            resolve({ code: null, stdout: '', stderr: 'the time budget was spent' });
            return;
        }
        execFile('git', [...NO_HELPER, ...args], { env, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
            const code = error ? (typeof error.code === 'number' ? error.code : null) : 0;
            resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr || (error ? error.message : '')) });
        });
    });
}
const firstLine = (r) => (r.stderr.trim().split('\n')[0] || 'git failed');
/** Fetch the list's text. Never rejects. */
export async function fetchListAsync({ url, ref = 'main', path = 'revocations.json', budgetMs = LIVE_BUDGET_MS, env = process.env }) {
    const deadline = Date.now() + budgetMs;
    const childEnv = { ...env, ...NO_PROMPT_ENV };
    const left = () => deadline - Date.now();
    const heads = await git(['ls-remote', url, `refs/heads/${ref}`], childEnv, left());
    if (heads.code !== 0)
        return { status: 'unreachable', detail: firstLine(heads) };
    if (heads.stdout.trim() === '')
        return { status: 'none', detail: `no ${ref} branch yet` };
    const tmp = mkdtempSync(join(tmpdir(), 'snowarch-licences-'));
    try {
        const dest = join(tmp, 'list');
        const clone = await git(['clone', '--quiet', '--depth', '1', '--branch', ref, '--single-branch', '--no-tags',
            '--no-checkout', url, dest], childEnv, left());
        if (clone.code !== 0)
            return { status: 'unreachable', detail: firstLine(clone) };
        const show = await git(['-C', dest, 'show', `HEAD:${path}`], childEnv, left());
        // No exit code: the deadline killed it, or left it no time to run. The repository never answered, so
        // nothing was checked (ARC-11-C11). An exit code means git answered: the file is not on the branch.
        if (show.code === null)
            return { status: 'unreachable', detail: firstLine(show) };
        if (show.code !== 0)
            return { status: 'none', detail: `no ${path} on ${ref} yet` };
        return { status: 'fetched', text: show.stdout };
    }
    finally {
        rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
    }
}
/** Fetch, verify and cache, as the CLI's `refreshList` does. Never rejects. */
export async function refreshList(root, { config, keys = PRODUCT_KEYS, now = new Date(), env = process.env, budgetMs = LIVE_BUDGET_MS, fetcher = fetchListAsync }) {
    const source = listSource(config);
    if (!source)
        return { outcome: 'unconfigured', version: null };
    const cache = readListCache(root);
    const held = heldList(cache, keys);
    let result;
    try {
        result = await fetcher({ ...source, budgetMs, env });
    }
    catch (e) {
        result = { status: 'unreachable', detail: e instanceof Error ? e.message : 'the fetch failed' };
    }
    const write = (list) => writeListCache(root, { list, checkedAt: now.toISOString(),
        source: `${source.url} ${source.ref}:${source.path}` });
    if (result.status === 'unreachable')
        return { outcome: 'unreachable', version: held?.version ?? null, detail: result.detail };
    if (result.status === 'none') {
        write(held ? cache?.list ?? null : null);
        return { outcome: 'none', version: held?.version ?? null };
    }
    const fetched = readList(result.text, { keys });
    if (!fetched.ok)
        return { outcome: 'refused', version: held?.version ?? null, reason: fetched.reason };
    if (newerList(held, fetched) === fetched) {
        write(JSON.parse(result.text));
        return { outcome: 'updated', version: fetched.version, previous: held?.version ?? null };
    }
    write(cache?.list ?? null);
    return { outcome: fetched.version === held?.version ? 'unchanged' : 'older', version: held?.version ?? null,
        fetchedVersion: fetched.version };
}
