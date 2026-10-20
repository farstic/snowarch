// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-S06 — `snowarch store migrate | backups | restore`.
 *
 * The one door through which a store's SHAPE changes, and it is a door a person opens. Nothing
 * here runs on load, on start-up, or as a side effect of anything else: the server refuses to
 * start configured against a schema it does not read and names this command, and that refusal is
 * the whole user interface for "your file is from an older build".
 *
 * Principle 10 all the way through — the plan is printed BEFORE anything is written, every line
 * of it is something a reader can check (which versions, which migrations, where the backup goes,
 * and that credentials are untouched), and `n` leaves the tree exactly as it was.
 *
 * Composition like `instance-command.ts`: every path RETURNS a code and only the CLI entry turns
 * one into `process.exit`, so the whole surface is testable twice in one process.
 */
import { statSync } from 'node:fs';
import { cliSpelling, needCli, promptLine } from './tty.js';
import { EXIT_OK, EXIT_FAILED, EXIT_USAGE } from './instance.js';
import { maskPath, resolveStorePath } from '../store/paths.js';
import { STORE_SUB_COMMANDS, storeSubCommandLines, storeSubCommandList } from './help-tables.js';
import { CURRENT_SCHEMA_VERSION, listBackups, migrateStore, restoreBackup, } from '../store/migrations/index.js';
export const defaultStoreIo = () => ({
    write: (text) => { process.stdout.write(text); },
    error: (text) => { process.stderr.write(text); },
    ask: (prompt) => promptLine(prompt, {}),
});
export const NOTHING_CHANGED = 'store: nothing changed';
// ARC-08-C22 — re-exported from the dependency-free table module, where the generator reads them.
export { STORE_SUB_COMMANDS, storeSubCommandList };
export function storeHelp() {
    return [
        `usage: ${cliSpelling()} store <command> [options]`,
        '',
        ...storeSubCommandLines(),
        '',
        '  A migration writes a 0600 backup first and never changes a credential value.',
        '  Backups are never pruned automatically — delete them yourself when you no longer want them.',
        '',
        'exit codes:',
        `  ${EXIT_OK}  done, or nothing to do`,
        `  ${EXIT_FAILED}  refused — a schema from the future, an unreadable file, or a failed migration`,
        `  ${EXIT_USAGE}  usage — an unknown sub-command or a missing argument`,
    ].join('\n');
}
/** Where the store is, or the reason there is nothing to act on. */
/**
 * ARC-07-C31 slice 3 — `cli` REQUIRED: three callers (lines 90, 141 and 163 below), so the narrow
 * rule this row settled applies — a default only where there is literally one caller and the comment
 * names it. `cliSpelling()` comes from `cli/tty.ts`, the SERVER's own definition: the server never
 * imports the engine, so the two share the semantics and not the code.
 */
function storePath(io, cli) {
    needCli(cli, 'storePath');
    const res = resolveStorePath();
    if (res.path === null) {
        io.error(`store: no store found — run ${cli} instance add <label> first\n`);
        return null;
    }
    return res.path;
}
/** `[Y/n]`, defaulting to yes, with anything but a no meaning yes. */
async function confirm(io, question) {
    const answer = (await io.ask(`${question} [Y/n]`)).trim().toLowerCase();
    return answer !== 'n' && answer !== 'no';
}
/**
 * `chain` is the same seam `migrateStore` exposes, passed through rather than re-invented.
 *
 * The shipped registry is empty at v1, so without it the plan screen, the `n` path and `--yes`
 * would have no migration to be about and AC 5 would be asserted against a program that took the
 * "nothing to do" branch every time. A test supplying its own chain exercises the real code with
 * a real pending migration; production passes nothing and gets `MIGRATIONS`.
 */
export async function runStoreMigrate(argv, io = defaultStoreIo(), chain = {}) {
    // ARC-07-C31 slice 3 — resolved ONCE for this command and threaded into both `migrateStore` calls,
    // so the plan and the applied run cannot render two different shells in one invocation.
    const cli = cliSpelling();
    const dryRun = argv.includes('--dry-run');
    const yes = argv.includes('--yes');
    const path = storePath(io, cliSpelling());
    if (path === null)
        return EXIT_FAILED;
    let plan;
    try {
        plan = migrateStore(path, { ...chain, dryRun: true, cli });
    }
    catch (e) {
        // Every refusal this can produce is a NAMED code with a remedy of its own, and printing the
        // code is what lets a user find it in TROUBLESHOOTING. A stack trace here would be the tool
        // telling a person their credential file crashed it.
        const err = e;
        io.error(`${err.code ?? 'STORE_UNREADABLE'}: ${err.message}\n`);
        return EXIT_FAILED;
    }
    if (!plan.dryRun && !plan.migrated && plan.from === plan.to) {
        io.write(`store: schema v${plan.from} is current — nothing to do\n`);
        return EXIT_OK;
    }
    io.write([
        `Store schema v${plan.from} → v${plan.to} · ${plan.steps.length} migration`
            + `${plan.steps.length === 1 ? '' : 's'}:`,
        ...plan.steps.map((s) => `  ${s}`),
        `  backup: ${maskPath(path)}.bak-<timestamp> (0600)`,
        '  credentials: untouched',
        '',
    ].join('\n'));
    if (dryRun) {
        io.write('store: --dry-run, nothing was written\n');
        return EXIT_OK;
    }
    if (!yes && !(await confirm(io, 'Proceed?'))) {
        io.write(`${NOTHING_CHANGED}\n`);
        return EXIT_OK;
    }
    try {
        const result = migrateStore(path, { ...chain, cli });
        io.write(`store: migrated schema v${result.from} → v${result.to}`
            + `${result.backup ? ` (backup ${maskPath(result.backup)})` : ''}\n`);
        return EXIT_OK;
    }
    catch (e) {
        const err = e;
        io.error(`${err.code ?? 'STORE_UNREADABLE'}: ${err.message}\n`);
        return EXIT_FAILED;
    }
}
export function runStoreBackups(io = defaultStoreIo()) {
    const path = storePath(io, cliSpelling());
    if (path === null)
        return EXIT_FAILED;
    const backups = listBackups(path);
    if (backups.length === 0) {
        io.write('store: no backups\n');
        return EXIT_OK;
    }
    for (const b of backups) {
        io.write(`${b.at.toISOString()}  ${String(b.size).padStart(7)} B  ${maskPath(b.path)}\n`);
    }
    io.write(`\n${backups.length} backup${backups.length === 1 ? '' : 's'} — `
        + 'never pruned automatically; delete the ones you no longer want\n');
    return EXIT_OK;
}
/**
 * ARC-07-C31 slice 3 — the spelling is resolved ONCE at the top of this command and threaded, the
 * shape `runDocs` uses in the engine: a command is the boundary where reading the process is right,
 * and resolving it once means three lines below cannot render three different shells in one run.
 */
export async function runStoreRestore(argv, io = defaultStoreIo()) {
    const cli = cliSpelling();
    const file = argv.find((a) => !a.startsWith('--'));
    if (!file) {
        io.error(`store restore: name a backup file (${cli} store backups lists them)\n`);
        return EXIT_USAGE;
    }
    const path = storePath(io, cliSpelling());
    if (path === null)
        return EXIT_FAILED;
    let size = 0;
    try {
        size = statSync(file).size;
    }
    catch {
        io.error(`store restore: ${maskPath(file)} is not there\n`);
        return EXIT_FAILED;
    }
    io.write(`Restore ${maskPath(file)} (${size} B) over ${maskPath(path)}.\n`
        + '  the current store is REPLACED; take a copy first if you want one\n\n');
    if (!argv.includes('--yes') && !(await confirm(io, 'Proceed?'))) {
        io.write(`${NOTHING_CHANGED}\n`);
        return EXIT_OK;
    }
    try {
        const { version } = restoreBackup(path, file);
        io.write(`store: restored schema v${version} from ${maskPath(file)}\n`);
        // Restoring a backup can legitimately put an OLDER schema back — that is what a rescue is —
        // so the next step is named rather than left to be discovered on the next server start.
        if (version !== CURRENT_SCHEMA_VERSION) {
            io.write(`store: schema v${version} is not this build's v${CURRENT_SCHEMA_VERSION} — `
                + `run ${cli} store migrate\n`);
        }
        return EXIT_OK;
    }
    catch (e) {
        const err = e;
        io.error(`${err.code ?? 'STORE_UNREADABLE'}: ${err.message}\n`);
        return EXIT_FAILED;
    }
}
export async function runStore(args, io = defaultStoreIo()) {
    const [name, ...rest] = args;
    if (!name || name === '--help' || name === 'help') {
        io.write(`${storeHelp()}\n`);
        return name ? EXIT_OK : EXIT_USAGE;
    }
    // `store migrate --help` is a request for HELP, not a migration with a flag it does not know.
    // The help is one screen for the three sub-commands, so it is answered here rather than three
    // times — and answered before dispatch, so no sub-command has to remember to.
    if (rest.includes('--help')) {
        io.write(`${storeHelp()}\n`);
        return EXIT_OK;
    }
    switch (name) {
        case 'migrate': return runStoreMigrate(rest, io); // the shipped chain, always
        case 'backups': return runStoreBackups(io);
        case 'restore': return runStoreRestore(rest, io);
        default:
            // The list comes from the table, so a sub-command added tomorrow is offered here the day it
            // exists rather than the day somebody notices.
            io.error(`store: unknown command "${name}" — ${storeSubCommandList()}\n`);
            return EXIT_USAGE;
    }
}
