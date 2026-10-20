#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * snowarch CLI — five sub-commands.
 *
 * `start` is the only one implemented here; `instance`, `store`, `doctor` and `contract` each
 * hand off to their own module (ARC-07, ARC-09-S06, ARC-04-S12 and ARC-04-S06 respectively).
 * The command surface is what the `tools/snowarch` launcher forwards to — `dist/cli/index.js` is
 * a contract with ARC-06/ARC-07/ARC-09 and must not move.
 *
 * What is deliberately absent: the npm update check (it fetched a third party's
 * package record — P-18), the `setup`, `auth`, `instances`, `web`, `shortcuts`,
 * `capabilities`, `run` and `report` commands (D-03), and any coloured output — a
 * CLI that may be piped should not depend on a TTY library for five sub-commands.
 */
// FIRST, before anything that constructs the proxy agent. ESM evaluates every import before
// the importing module's body, so this cannot be a call in main(): `EnvHttpProxyAgent` reads
// the environment when it is constructed, and by then it would already have been built from
// the unsanitised one. Same ordering rule that bit ARC-04-S02 with dotenv.
import '../env-sanitise.js';
import { Command } from 'commander';
import { argvCarriesSecret, ARGV_SECRET, bootstrapSpelling, cliSpelling, EXIT_USAGE } from './tty.js';
import { remedyFor } from '../errors/codes.js';
import { REFUSED, refusesCommand } from '../licence/gate.js';
import { ensureIntegrity } from '../licence/integrity.js';
import { licenceStatus, projectRoot } from '../licence/state.js';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
const __cliDir = path.dirname(fileURLToPath(import.meta.url));
const __pkgJson = JSON.parse(readFileSync(path.resolve(__cliDir, '..', '..', 'package.json'), 'utf8'));
const CLI_VERSION = __pkgJson.version;
const NOT_IMPLEMENTED_EXIT = 2; // still used by `contract` when dist/ has not been built
const EXIT_LICENCE = 3; // ./snowarch's EXIT_PREREQ: a licence in force is a prerequisite
/**
 * THE ARGV GATE — before commander, before anything.
 *
 * P-34: a password on a command line is in `ps` output for every user on the machine and in the
 * shell history for ever afterwards. Refusing it here rather than in an option handler is not
 * fastidiousness about layering: commander echoes the offending argument back in its own
 * "unknown option" error, so a `--password hunter2` that reached the parser would be printed to
 * stderr — by the code refusing it.
 *
 * The value is never read, never quoted, never included in the message.
 */
if (argvCarriesSecret(process.argv.slice(2))) {
    process.stderr.write(`${ARGV_SECRET}\n`);
    process.exit(EXIT_USAGE);
}
const program = new Command();
program
    .name('snowarch')
    .description('ServiceNow MCP server')
    .version(CLI_VERSION);
/**
 * ARC-11-C6 step 4b — THE SECOND DOOR, with the first one's rule (the architect's rulings R2 and R3).
 *
 * With no valid licence in force, `./snowarch` refuses every command but the few that see, repair, install and
 * uninstall, and it forwards `instance` and `store` here. This CLI is also the npm package's `bin`, so a door with
 * a rule of its own would be the way round the first. One set and one decision, `../licence/gate.ts`, with the
 * licence read where the server reads it: CLAUDE_PROJECT_DIR, else the working directory. Of this CLI's commands
 * only `doctor` is in the set. A hook on the action, so help, the version and a command's own help are answered
 * before it, as at ./snowarch, and a refused command has run nothing when it says so. `writeSync` before the exit:
 * a write to a piped stderr is asynchronous on POSIX, and `process.exit` would drop it (ARC-09-C129).
 */
program.hook('preAction', (_program, action) => {
    const name = action.name();
    const root = projectRoot();
    const s = licenceStatus(root);
    // ARC-11-C141 — the same door for this checkout's own files: put back where they can be, with the one line saying
    // so, and refused with the licence's set where they cannot. The licence is asked first: one refusal, one reason.
    const integrity = ensureIntegrity(root, { cli: cliSpelling(), projectDir: root });
    if (integrity.state === 'restored')
        writeSync(2, `${integrity.line}\n`);
    if (!refusesCommand(name, s, [], integrity))
        return;
    if (REFUSED.includes(s.state)) {
        const { meaning, remedy } = remedyFor('LICENCE_NOT_VALID', { cli: cliSpelling(), bootstrap: bootstrapSpelling() });
        writeSync(2, `snowarch ${name}: licence ${s.state}${s.signatureValid ? ` (${s.id})` : ''} (Code: LICENCE_NOT_VALID) — `
            + `${meaning}\n${remedy}\n`);
    }
    else if (integrity.state === 'refused') {
        writeSync(2, `snowarch ${name}: this command does not run while the AI Architect's own files cannot be restored `
            + `(Code: INTEGRITY_NOT_VERIFIED)\n${integrity.line}\n`);
    }
    process.exit(EXIT_LICENCE);
});
program
    .command('start')
    .description('Start the MCP server on stdio')
    .action(() => {
    // Spawned as a child so this process never writes to the JSON-RPC stdout stream:
    // a single stray byte on stdout corrupts the protocol framing.
    const serverPath = path.resolve(__cliDir, '..', 'server.js');
    const child = spawn(process.execPath, [serverPath], { stdio: 'inherit', env: process.env });
    const forward = (sig) => { if (!child.killed)
        child.kill(sig); };
    process.on('SIGINT', () => forward('SIGINT'));
    process.on('SIGTERM', () => forward('SIGTERM'));
    child.on('exit', (code, signal) => {
        if (signal)
            process.kill(process.pid, signal);
        else
            process.exit(code ?? 0);
    });
});
program
    .command('instance')
    .description('Manage configured ServiceNow instances')
    .allowUnknownOption()
    .allowExcessArguments()
    // `--help` belongs to the sub-command's own parser, which prints the exit-code table with it.
    // Left to commander, `instance add --help` printed commander's options block — a help screen
    // that describes a different program than the one that runs.
    .helpOption(false)
    .action(async (_options, command) => {
    // The ARGUMENTS commander collected, not a scan of `process.argv`: a label that happened to
    // be the word `instance` would have made an index scan cut the line in the wrong place.
    const { runInstance } = await import('./instance-command.js');
    process.exit(await runInstance(command.args));
});
program
    .command('store')
    .description('Migrate, back up and restore the instance store')
    .allowUnknownOption()
    .allowExcessArguments()
    // The sub-command's own help, for the reason `instance` has one: commander's options block
    // describes commander's idea of the command, and this one's exit codes are the useful part.
    .helpOption(false)
    .action(async (_options, command) => {
    const { runStore } = await import('./store-command.js');
    process.exit(await runStore(command.args));
});
program
    .command('doctor')
    .description('Diagnose the installation')
    .option('--json', 'print the report object and nothing else')
    .option('--no-network', 'skip checks that contact the instance')
    .option('--section <name>', 'only this section (server)', 'server')
    .action(async (opts) => {
    // commander turns `--no-network` into `network: false`, so the flag the doctor takes is
    // the negation. Spelled out because reading `opts.network` as "network requested" is the
    // obvious misreading, and it would silently run the probes the user asked to skip.
    const { runServerDoctor, exitCodeFor, formatReport } = await import('../doctor/index.js');
    let report;
    try {
        report = await runServerDoctor({ noNetwork: opts.network === false, cwd: process.cwd() });
    }
    catch (e) {
        // Exit 3: the doctor could not run at all, which is a different thing from "checks
        // failed". A caller scripting against this needs to tell them apart.
        process.stderr.write(`snowarch doctor: could not run — ${e.message}\n`);
        process.exit(3);
    }
    process.stdout.write(opts.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
    process.exit(exitCodeFor(report));
});
program
    .command('contract')
    .description('Print the tool contract, or its sha256')
    .option('--json', 'print dist/contract.json verbatim')
    .option('--sha', 'print sha256(dist/contract.json) and nothing else')
    .action((opts) => {
    const contractPath = path.resolve(__cliDir, '..', 'contract.json');
    if (!existsSync(contractPath)) {
        // The contract is a BUILD artefact — `scripts/extract-tools.mjs` emits it from the tool
        // registrations, and this command only reads it. Saying so is the whole message: the
        // remedy is a build, not a reinstall or a missing flag.
        process.stderr.write(`snowarch contract: ${contractPath} is missing.\n`
            + 'The contract is generated at build time from the tool registrations.\n'
            + 'Run: npm run build  (in packages/snowarch)\n');
        process.exit(NOT_IMPLEMENTED_EXIT);
    }
    const text = readFileSync(contractPath, 'utf8');
    if (opts.sha) {
        // Exactly 64 hex characters and a newline. ARC-05 pins against this and ARC-06's B05
        // compares it, so anything else on stdout — a label, a prefix — breaks both.
        process.stdout.write(`${createHash('sha256').update(text).digest('hex')}\n`);
        return;
    }
    if (opts.json) {
        process.stdout.write(text);
        return;
    }
    const c = JSON.parse(text);
    const sha = createHash('sha256').update(text).digest('hex');
    process.stdout.write(`contract ${c.contractVersion} · ${c.product} ${c.version} · ${c.toolCount} tools · sha256 ${sha.slice(0, 12)}\n`);
});
program.parse();
