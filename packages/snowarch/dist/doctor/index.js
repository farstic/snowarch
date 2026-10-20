// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The server doctor: run every check, return one JSON object, print one line each.
 *
 * ARC-08 imports `runServerDoctor` through the package `exports` map and merges this report
 * with its engine checks. That hand-off is the reason the runner returns data rather than
 * printing: a doctor that only prints has to be re-implemented to be composed.
 */
import { instanceManager } from '../servicenow/instances.js';
import { maskUsername } from '../store/paths.js';
import { getPackageVersion } from '../utils/version.js';
import { ALL_CHECKS, resetHandshakeCache } from './checks.js';
import { makeProbes, storeEntry } from './probes-binding.js';
import { stubProbesFor } from './types.js';
export * from './types.js';
export { ALL_CHECKS, pollutingAncestors, resetHandshakeCache } from './checks.js';
export async function runServerDoctor(opts = {}) {
    resetHandshakeCache();
    // The store is read once, here, so every check sees the same state. Re-reading per check
    // would let a report contradict itself if a file changed mid-run — rare, but the resulting
    // "SV-02 ok, SV-03 fail" is the kind of output nobody can act on.
    instanceManager.reload();
    // The real probes once there is something to probe; the stub is the answer to "no instance
    // configured", which is a state rather than an absence — ARC-08-S04 is the story that chooses,
    // because it is the story that owns what the doctor renders.
    const configured = instanceManager.loadedCount() > 0;
    const platform = opts.platform ?? process.platform;
    const env = opts.env ?? process.env;
    const ctx = {
        noNetwork: opts.noNetwork === true,
        cwd: opts.cwd ?? process.cwd(),
        platform,
        env,
        probes: opts.probes ?? (configured ? makeProbes({ platform, env }) : stubProbesFor({ platform, env })),
        ...(opts.fluent ? { fluent: opts.fluent } : {}),
    };
    const checks = [];
    for (const check of ALL_CHECKS) {
        try {
            checks.push(await check.run(ctx));
        }
        catch (e) {
            // A check that throws is a defect in the doctor, not in the installation — and reporting
            // it as a failed check would send the user to fix their machine. Named as such.
            checks.push({
                id: check.id,
                title: check.title,
                status: 'fail',
                detail: `the check itself threw: ${e.message}`,
                remedy: 'this is a defect in snowarch; please report it with this line',
                fixable: false,
            });
        }
    }
    const summary = { ok: 0, warn: 0, fail: 0, skip: 0 };
    for (const c of checks)
        summary[c.status] += 1;
    return {
        product: 'snowarch',
        version: getPackageVersion(),
        ranAt: new Date().toISOString(),
        mode: instanceManager.loadedCount() > 0 ? 'configured' : 'unconfigured',
        checks,
        summary,
        // `label · environment · preset · status`, plus the MASKED username and the store's own
        // `lastProbe` — the four fields ARC-07-S09's `--resume` branches on. The username is masked
        // HERE as well as by the engine's runner: this report is returned to callers that are not the
        // engine, and a shape that is only safe downstream is not a safe shape.
        instances: instanceManager.listAll().map((i) => {
            const stored = storeEntry(i.name);
            return {
                label: i.name,
                environment: i.environment,
                preset: i.preset,
                status: i.status,
                ...(stored?.auth?.username ? { username: maskUsername(stored.auth.username) } : {}),
                ...(stored?.lastProbe ? { lastProbe: stored.lastProbe } : {}),
                ...(i.reason ? { reason: i.reason } : {}),
            };
        }),
    };
}
/** 0 = nothing failed, 1 = at least one FAIL, 3 = the run itself could not complete. */
export function exitCodeFor(report) {
    return report.summary.fail > 0 ? 1 : 0;
}
/** The human rendering: one aligned line per check, then a summary. */
export function formatReport(report) {
    const lines = report.checks.map((c) => {
        const status = c.status.padEnd(4);
        const remedy = c.remedy ? `\n            → ${c.remedy}` : '';
        return `${c.id} ${status} ${c.detail}${remedy}`;
    });
    const s = report.summary;
    lines.push('');
    lines.push(`SERVER DOCTOR: ${s.ok} ok, ${s.warn} warn, ${s.fail} fail, ${s.skip} skip `
        + `(mode: ${report.mode})`);
    return `${lines.join('\n')}\n`;
}
