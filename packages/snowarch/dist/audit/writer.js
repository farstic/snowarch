// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * One JSON line per mutating call, in a file inside the checkout, and one per call the licence refused
 * (`LicenceRefusalEntry`).
 *
 * §2.1 says a write needs "write approved" from the user. Before this, that was provable only
 * from a conversation transcript — which the reviewer asking the question does not have. The
 * audit file is what makes the claim checkable afterwards by someone who was not there.
 *
 * A write that succeeded but came back with warnings (a value the platform stored cut, a field it did
 * not keep) carries them as `warnings` — the codes, the table, the field names and a count, built by
 * `audit/warnings.ts` and never a value (ARC-09-C101).
 *
 * What a line may NOT contain is the whole design. Never a payload: `fields`, `data`, `script`
 * and the response body are all excluded, because an audit trail that records what was written
 * becomes a second copy of client data sitting in a git checkout. Never a credential. Never an
 * instance URL — the label is enough to identify which instance, and a URL in a file that gets
 * pasted into a ticket is an unnecessary disclosure.
 *
 * `query` IS recorded, and that is a deliberate exception: a query is the filter that selected
 * the records, it can contain personal data (`caller_id=…`), and without it a line saying
 * "updated some incidents" answers nothing. The engine already had that string in its
 * transcript. The README says so.
 */
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, unlinkSync, } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { logger } from '../utils/logging.js';
import { maskPath, projectStorePath, resolveStorePath } from '../store/paths.js';
/** Rotate at 10 MB, keeping three older files. */
export const MAX_BYTES = 10 * 1024 * 1024;
export const KEEP = 3;
/**
 * Where the file lives: beside the store in use, so the audit sits with the configuration it
 * records. `SNOW_AUDIT_FILE` overrides; `off` disables it entirely.
 *
 * Returns `null` when disabled. With no store on disk (env-defined instances) it falls back to
 * the project path — `<CLAUDE_PROJECT_DIR ?? cwd>/.local/` — rather than giving up, because an
 * env-configured instance is exactly the setup most likely to be doing something ad hoc.
 */
export function resolveAuditPath() {
    const override = process.env.SNOW_AUDIT_FILE;
    if (override !== undefined && override !== '') {
        if (override.toLowerCase() === 'off')
            return null;
        return resolve(override);
    }
    const store = resolveStorePath();
    const dir = dirname(store.path ?? projectStorePath());
    return join(dir, 'audit.jsonl');
}
/** True when the trail is switched off, so start-up can say so once. */
export const auditDisabled = () => (process.env.SNOW_AUDIT_FILE ?? '').toLowerCase() === 'off';
/**
 * Warned at most once per process.
 *
 * A read-only filesystem fails on every single call, and a warning per call would bury the
 * server's real output under thousands of identical lines — which is its own denial of the
 * information the operator needs.
 */
let warned = false;
/** Test seam: the module-level "already warned" latch, reset between cases. */
export function resetAuditWarning() { warned = false; }
function rotate(file) {
    // Oldest first, so nothing is overwritten before it has been shifted along. `.3` falls off
    // the end deliberately: three older files bound the disk cost of a trail nobody prunes.
    const oldest = `${file}.${KEEP}`;
    if (existsSync(oldest))
        unlinkSync(oldest);
    for (let i = KEEP - 1; i >= 1; i -= 1) {
        const from = `${file}.${i}`;
        if (existsSync(from))
            renameSync(from, `${file}.${i + 1}`);
    }
    renameSync(file, `${file}.1`);
}
/**
 * Append one line. Never throws.
 *
 * A tool call that succeeded against the instance must not be reported as failed because the
 * local disk was full or read-only — the write already happened, and telling the caller
 * otherwise would be worse than losing the audit line.
 */
export function appendAudit(entry) {
    const file = resolveAuditPath();
    if (file === null)
        return;
    try {
        mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
        // Does the file end mid-line? A crash between the record and its newline leaves a partial
        // line, and appending straight onto it produces `{"ts":"tru{"ts":"2026-…}` — ONE corrupt
        // line that swallows the new record as well as the old. Found by the tailAudit test, which
        // expected to lose the truncated line and lose the following good one too.
        //
        // Reading one byte is cheap next to the append itself, and it makes the trail self-healing:
        // the damaged line stays damaged and is skipped by `tailAudit`, and everything after it is
        // intact.
        let prefix = '';
        if (existsSync(file)) {
            const size = statSync(file).size;
            if (size >= MAX_BYTES)
                rotate(file);
            else if (size > 0) {
                const fd = openSync(file, 'r');
                try {
                    const last = Buffer.alloc(1);
                    readSync(fd, last, 0, 1, size - 1);
                    if (last[0] !== 0x0a)
                        prefix = '\n';
                }
                finally {
                    closeSync(fd);
                }
            }
        }
        // 0600 at creation rather than a chmod afterwards: between the two there is a window in
        // which the file is world-readable, and the whole point of the mode is that nobody else
        // reads it.
        appendFileSync(file, `${prefix}${JSON.stringify(entry)}\n`, { mode: 0o600 });
    }
    catch (e) {
        if (!warned) {
            warned = true;
            logger.warn(`audit trail unavailable: ${e.message}`, { file: maskPath(file) });
        }
    }
}
/** The last `n` lines, parsed. Unparseable lines are skipped rather than throwing. */
export function tailAudit(n = 50) {
    const file = resolveAuditPath();
    if (file === null || !existsSync(file))
        return [];
    try {
        const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '');
        return lines.slice(-n).flatMap((l) => {
            // A truncated last line is normal after a crash mid-append. One bad line must not make
            // the whole trail unreadable — which is what a `map(JSON.parse)` would do.
            try {
                return [JSON.parse(l)];
            }
            catch {
                return [];
            }
        });
    }
    catch {
        return [];
    }
}
/** The name ARC-07/08's `snowarch audit tail` calls. Same function, story's spelling. */
export const readAuditTail = tailAudit;
