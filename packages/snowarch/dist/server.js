#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// FIRST, before anything that constructs the proxy agent. ESM evaluates every import before
// the importing module's body, so this cannot be a call in main(): `EnvHttpProxyAgent` reads
// the environment when it is constructed, and by then it would already have been built from
// the unsanitised one. Same ordering rule that bit ARC-04-S02 with dotenv.
import './env-sanitise.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
import { instanceManager } from './servicenow/instances.js';
import { runWithInstance } from './servicenow/context.js';
import { CORE_TOOLS_UNCONFIGURED, setAdvertisedCount, setFullCatalogueSize, unconfiguredRefusal, setToolListChangedNotifier, } from './tools/status.js';
import { isUnderCloudSyncFolder, maskPath } from './store/index.js';
import { collectToolCatalog } from './tools/index.js';
import { getResources, readResource } from './resources/index.js';
import { logger } from './utils/logging.js';
import { toolErrorText } from './utils/tool-error.js';
import { summariseWarnings, warningsOfResult } from './audit/warnings.js';
import { carriedWarnings } from './servicenow/stored-values.js';
import { ServiceNowError } from './utils/errors.js';
import { getPackageVersion } from './utils/version.js';
import { capResult, resolveCap } from './utils/result-size.js';
import { appendAudit, auditDisabled, resolveAuditPath } from './audit/writer.js';
import { currentLicence, initIntegrity, integrityRefusalFields, licenceAuditField, licenceRefusalFields, startLicence, takeIntegrityNotice, takeLicenceNotice, } from './licence/session.js';
import { licenceLine } from './licence/state.js';
// dotenv ONLY when asked, and only for a file that exists. A bare `dotenv.config()` reads
// the .env of whatever directory the server happens to start in — for an MCP server that is
// the user's project, so an unrelated `WRITE_ENABLED=true` in their repo would arm writes on
// this server without anyone choosing it (P-22).
const envFile = process.env.SNOW_ENV_FILE;
if (envFile && existsSync(envFile)) {
    dotenv.config({ path: envFile });
}
// ─── Create MCP Server ───────────────────────────────────────────────────────
/**
 * What `tools/list` returns. The full catalogue once an instance is loaded; the five
 * instance-free core tools before that.
 */
function advertisedTools() {
    const all = collectToolCatalog();
    if (instanceManager.loadedCount() > 0)
        return all;
    return all.filter((t) => CORE_TOOLS_UNCONFIGURED.includes(t.name));
}
export function createServer() {
    const server = new Server({
        name: 'snowarch',
        version: getPackageVersion(),
    }, {
        capabilities: {
            // listChanged: the server re-advertises its tool set after
            // snow_core_instances_reload, so a user who runs `./snowarch instance add` in
            // another terminal does not have to restart Claude Code (S-02, CONFIRMED).
            tools: { listChanged: true },
            resources: {},
        },
    });
    const tools = collectToolCatalog();
    // ─── Tools ──────────────────────────────────────────────────────────────────
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        // Unconfigured, only the five tools that need no instance are advertised. Offering the
        // full catalogue would put ~397 tools in front of a session where every one of them
        // fails — the list is the honest statement of what can actually be called.
        const advertised = advertisedTools();
        setAdvertisedCount(advertised.length);
        return { tools: advertised };
    });
    /**
     * ARC-11-C1 — the session's first answer carries the licence notice as a SECOND block, once, whatever
     * the answer is; `content[0]` is never touched, so a caller that parses it reads what it always read.
     * Nothing is added when a live licence is in force.
     */
    const withNotice = (content) => {
        // ARC-11-C141 — and a restore's line, once, the same way: the start put the signed files back, and the session's
        // first answer is where a reader of this server learns it.
        const notices = [takeLicenceNotice(), takeIntegrityNotice()].filter((n) => n !== null);
        return [...content, ...notices.map((text) => ({ type: 'text', text }))];
    };
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        logger.info(`Tool called: ${name}`);
        // Audit state, gathered as the call proceeds and written once at the end. Declared out here
        // because a REFUSAL is as audit-worthy as a success — arguably more so, since "a write was
        // attempted under read-only" is exactly what an after-the-fact reviewer looks for — and
        // refusals leave through the catch block below.
        const started = performance.now();
        let auditTool;
        let auditResult = 'ok';
        let auditSysId = null;
        // What the call came back with besides its result (ARC-09-C101): a write that stored a cut value
        // is not a plain `ok`. Codes, table, field names and a count, summarised by `audit/warnings.ts`.
        let auditWarnings = [];
        // The instance as it was when the call STARTED. It matters for exactly one tool: after
        // snow_core_instance_switch has run, `current()` is the destination, so reading it at the
        // end produced `instance: "other", note: "switch -> other"` — which says the same thing
        // twice and loses the one fact a reviewer needs, namely what it switched FROM. Every other
        // tool leaves it unchanged, so taking it here costs nothing and is right in both cases.
        const startInstance = instanceManager.loadedCount() > 0 ? instanceManager.current() : null;
        const writeAudit = () => {
            // Only declared mutating tools. `mutates` is the ServiceNow-write claim; `sessionMutates`
            // is snow_core_instance_switch, which writes nothing but redirects where every subsequent
            // write lands — the one line a reviewer most needs when a later entry names a different
            // instance. A read appends nothing at all: a trail that logged everything would be a
            // request log, and nobody reads a request log to answer "was this write approved".
            if (!auditTool || !(auditTool.mutates || auditTool.sessionMutates))
                return;
            const a = (args ?? {});
            const str = (v) => (typeof v === 'string' && v !== '' ? v : null);
            const rt = startInstance;
            const session = auditTool.sessionMutates === true;
            appendAudit({
                ts: new Date().toISOString(),
                // The label, never the URL: this file gets pasted into tickets.
                instance: rt?.label ?? '(none)',
                environment: rt?.environment ?? '(none)',
                tool: name,
                gate: auditTool.gate,
                // `table` from the argument, else the tool's FIXED declaration. Never a guess — a table
                // name invented for an audit record is worse than a null.
                table: session ? null : (str(a.table) ?? auditTool.table ?? null),
                sysId: session ? null : (str(a.sys_id) ?? auditSysId),
                // A query is a filter, not a payload. It can carry personal data and is recorded
                // knowingly — see the writer's header and the README.
                query: session ? null : (str(a.query) ?? str(a.sysparm_query)),
                result: auditResult,
                ...(auditWarnings.length > 0 ? { warnings: auditWarnings } : {}),
                ms: Math.round(performance.now() - started),
                source: 'mcp',
                // Free text built from SERVER-side state, never from the arguments.
                //
                // This first read `args.name`, and the no-secrets sweep — which passes the payload
                // marker as every argument, including `name` — found the marker in the audit file
                // through it. A caller-supplied string in an audit line is a payload channel however
                // innocuous the field sounds. On success the destination is read back from the manager
                // as a store-defined label; on a refusal nothing is echoed at all, because the result
                // code already says what happened.
                ...(session
                    ? { note: auditResult === 'ok'
                            ? `switch → ${instanceManager.loadedCount() > 0 ? instanceManager.current().label : '(none)'}`
                            : 'switch refused' }
                    : {}),
                // ARC-11-C1 — the licence id, LAST and only from a licence whose signature holds, so a checkout
                // without one writes exactly the line it always wrote.
                ...licenceAuditField(),
            });
        };
        // ARC-11-C1 polish 2 — the router's licence refusal, for a read and a write alike, in place of the line
        // above: the call reached no instance, so it records no argument and no value, only what was refused
        // and why. A name no tool declares never gets here (UNKNOWN_TOOL is thrown first), so `name` is a
        // declared tool's.
        const writeLicenceRefusal = () => {
            if (!auditTool)
                return;
            appendAudit({
                ts: new Date().toISOString(),
                instance: startInstance?.label ?? '(none)',
                tool: name,
                gate: 'licence',
                result: 'LICENCE_NOT_VALID',
                ...licenceRefusalFields(),
            });
        };
        // ARC-11-C141 — the router's integrity refusal, in the licence refusal's shape (Q8): what was refused, the tree's
        // state and the release it claims, and nothing that was sent.
        const writeIntegrityRefusal = () => {
            if (!auditTool)
                return;
            appendAudit({
                ts: new Date().toISOString(),
                instance: startInstance?.label ?? '(none)',
                tool: name,
                gate: 'integrity',
                result: 'INTEGRITY_NOT_VERIFIED',
                ...integrityRefusalFields(),
            });
        };
        try {
            const tool = tools.find(t => t.name === name);
            if (!tool) {
                // Left un-audited on purpose: a name that exists in no configuration reached no
                // instance and changed nothing, and there is no declaration to say what it would have
                // done. An audit line for it would record a typo as an attempted write.
                throw new ServiceNowError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
            }
            auditTool = tool;
            // A tool that exists but needs an instance we do not have. UNKNOWN_TOOL is reserved
            // for names that exist in no configuration — telling a user their tool does not exist,
            // when it does and is merely unusable right now, sends them looking in the wrong place.
            if (instanceManager.loadedCount() === 0
                && !CORE_TOOLS_UNCONFIGURED.includes(name)) {
                // The refusal carries the STORE's reason when the store had one (ARC-09-S06): a v1 file
                // against a v2 build is not "no instance configured", it is one command away from working.
                const refusal = unconfiguredRefusal(instanceManager.getReport().configErrors);
                throw new ServiceNowError(refusal.message, refusal.code);
            }
            const { routeToolInvocation } = await import('./tools/index.js');
            // The instance-free core tools are dispatched WITHOUT resolving a client or entering a
            // runtime. Resolving one first would throw "no instance is configured" from inside the
            // very tools whose job is to report that — which is what happened the first time this
            // ran, and is why the probe exercises them rather than trusting the guard above.
            // The client's own ceiling, if it named one, else SNOW_MAX_RESULT_CHARS, else 100000.
            const cap = resolveCap(request.params._meta);
            if (CORE_TOOLS_UNCONFIGURED.includes(name)) {
                const result = await routeToolInvocation(null, name, args || {});
                writeAudit();
                return { content: withNotice([{ type: 'text', text: capResult(result, cap).text }]) };
            }
            // The CURRENT instance, always. A per-call `instance` argument used to route here, and
            // no tool's inputSchema declares one — so it was an undocumented side channel that could
            // send a write to a different instance than the session believed it was addressing.
            // `snow_core_instance_switch` is the only way to change instance, and it is visible.
            // ARC-04-S08 ignored an `instance` argument silently, because it was never advertised.
            // ARC-09-C121 refuses it in the router, with its own message: a write the caller believes
            // goes to another instance would land on this one, which is worse than a refusal.
            const runtime = instanceManager.current();
            const client = instanceManager.getClient();
            const result = await runWithInstance(runtime, () => routeToolInvocation(client, name, args || {}));
            // P-27: capped HERE rather than in each tool. A per-tool cap is a rule 397 authors have
            // to remember; this is the single place every result already passes through, so a new
            // tool is capped by existing, not by its author having read this comment.
            // The sys_id the instance assigned, for a create that did not carry one in. Read from
            // the result rather than the arguments, and only this one field — the rest of the
            // response body never reaches the line.
            const created = result?.sys_id;
            if (typeof created === 'string')
                auditSysId = created;
            auditWarnings = summariseWarnings(warningsOfResult(result));
            writeAudit();
            const capped = capResult(result, cap);
            if (capped.truncated) {
                logger.warn(`${name}: result truncated to ${cap} chars (${capped.strategy})`);
            }
            return { content: withNotice([{ type: 'text', text: capped.text }]) };
        }
        catch (error) {
            logger.error(`Tool execution error: ${name}`, error);
            auditResult = error instanceof ServiceNowError ? error.code : 'ERROR';
            // A tool that wrote and then failed: the failure is the headline, the cut it left is the rest.
            auditWarnings = summariseWarnings(carriedWarnings(error));
            // Only the router's `assertLicensed` raises LICENCE_NOT_VALID, so this is the refusal and nothing else.
            if (auditResult === 'LICENCE_NOT_VALID')
                writeLicenceRefusal();
            // ...and only its `assertIntegrity` raises INTEGRITY_NOT_VERIFIED.
            else if (auditResult === 'INTEGRITY_NOT_VERIFIED')
                writeIntegrityRefusal();
            else
                writeAudit();
            // Includes a sentence about cut values when the tool had already written some before it threw
            // (ARC-09-C93); the text itself is built, and tested, in utils/tool-error.ts.
            return {
                content: withNotice([{ type: 'text', text: toolErrorText(error) }]),
                isError: true,
            };
        }
    });
    // ─── Resources (@ mentions) ─────────────────────────────────────────────────
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return { resources: getResources() };
    });
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;
        try {
            if (instanceManager.loadedCount() === 0) {
                const refusal = unconfiguredRefusal(instanceManager.getReport().configErrors);
                throw new ServiceNowError(refusal.message, refusal.code);
            }
            const client = instanceManager.getClient();
            // Resource reads need an instance for the same reason tool calls do.
            const result = await runWithInstance(instanceManager.current(), () => readResource(client, uri));
            const mimeType = uri === 'servicenow://query-syntax' ? 'text/markdown' : 'application/json';
            const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            return {
                contents: [{ uri, mimeType, text }],
            };
        }
        catch (error) {
            logger.error(`Resource read error: ${uri}`, error);
            throw error;
        }
    });
    return server;
}
// ─── Start ────────────────────────────────────────────────────────────────────
/**
 * The startup line (01 §5). It names the store that was used and the instances that came
 * out of it, so "which file configured this" is answerable from the log rather than by
 * guessing. Every path is masked — a log reaches screen shares and bug reports.
 *
 * It does NOT exit when nothing is configured. The old guard exited on missing env vars,
 * which is wrong now that a store can configure the server, and unconfigured start is
 * ARC-04-S04's subject; until then the server runs and individual tools fail with a
 * reason, which is more useful than a process that vanishes.
 */
function logStartup() {
    // Reload before reporting. `instanceManager` is a module-level singleton, and ESM
    // evaluates imports BEFORE the importing module's body — so its constructor ran before
    // the dotenv branch above. Without this, a store or instance named by SNOW_ENV_FILE
    // would be read too late to matter, and the startup line would describe a state the
    // server is not in. Caught by tests/store/dotenv.test.ts.
    const report = instanceManager.reload();
    const version = getPackageVersion();
    // The ADVERTISED count, not the catalogue's. Unconfigured, five tools can be called and
    // 397 exist; printing 397 beside "mode: unconfigured" invites the reader to try one.
    const toolCount = advertisedTools().length;
    for (const note of report.notes)
        logger.info(note);
    for (const err of report.configErrors)
        logger.error(`${err.code}: ${err.message}`);
    for (const w of report.warnings)
        logger.warn(w);
    for (const nl of report.notLoaded)
        logger.warn(`instance ${nl.label} not loaded — ${nl.code}: ${nl.message}`);
    if (process.platform === 'win32')
        logger.info('file modes: ACL-inherited (Windows)');
    if (report.path && isUnderCloudSyncFolder(report.path)) {
        logger.warn('store is under a cloud-sync folder; 0600 does not prevent synchronisation');
    }
    const where = report.path ? `${report.source} (${report.path})` : `${report.source}`;
    const instances = report.loaded.length > 0
        ? report.loaded.map((label) => {
            const e = instanceManager.getEntry(label);
            return `${label} (${e?.environment ?? '?'}, ${e?.preset ?? '?'}${label === instanceManager.getCurrentName() ? ', default' : ''})`;
        }).join(', ')
        : 'none';
    const mode = report.loaded.length > 0 ? '' : ' — mode: unconfigured';
    logger.info(`snowarch ${version} — store: ${where} — instances: ${instances}${mode} — tools: ${toolCount}`);
    // Said ONCE, at start-up, and never again. A per-call notice would be noise; complete silence
    // would mean an operator who set SNOW_AUDIT_FILE=off months ago discovers there is no trail
    // at the moment they go looking for one.
    if (auditDisabled()) {
        logger.warn('audit trail disabled');
    }
    else {
        const p = resolveAuditPath();
        if (p)
            logger.info(`audit trail: ${maskPath(p)}`);
    }
}
async function main() {
    logStartup();
    // ARC-11-C1 — the licence, read once for this process. A LIVE server with a licence installed refreshes
    // the revocation list at every start, in the background, on a 3-second budget: never awaited here, never
    // failing, and the state it lands applies from the next call. Without a licence it fetches nothing.
    const refresh = startLicence({ live: instanceManager.loadedCount() > 0 });
    // ARC-11-C141 — this checkout's own files, in full and once, before the first call: restored where they can be,
    // and every tool refused where they cannot. Synchronous and offline, about 7 ms warm; the transport is not open yet.
    initIntegrity();
    const licence = currentLicence();
    logger.info(`licence: ${licenceLine(licence)}`);
    if (refresh)
        void refresh.then((r) => logger.info(`licence: revocation list ${r.outcome}`));
    const server = createServer();
    // The reload tool re-advertises the tool set through the server it is running in; giving
    // it a callback keeps tools/status.ts free of an import back into the server module.
    setFullCatalogueSize(collectToolCatalog().length);
    setAdvertisedCount(advertisedTools().length);
    setToolListChangedNotifier(() => { void server.sendToolListChanged(); });
    // stdio is the only transport. The HTTP/SSE transport, the REST API, the A2A routes
    // and the dashboard were removed with D-03 item 6; nothing else can be mounted here.
    const transport = new StdioServerTransport();
    // Exit when the client closes the transport (stdin EOF), with code 0.
    //
    // A signal is deliberately NOT used: Windows has no SIGTERM delivery, and on POSIX a
    // process killed by an unhandled SIGTERM reports a signal rather than an exit code — so a
    // test asserting "exited 0" could not pass on either.
    //
    // ARC-04-S10's answer to the audit-writer flush that was TODO'd here: there is nothing to
    // flush. `appendAudit` uses `appendFileSync` per line, so every line is already on disk
    // before its tool call returns — chosen for exactly this reason. Writes are rare enough that
    // durability beats throughput, and a buffered writer would lose the last few lines on the one
    // occasion an audit matters most: an abrupt exit. Stated here rather than left silent, so
    // nobody adds a flush that has nothing to do.
    transport.onclose = () => {
        logger.info('stdio closed by the client — exiting');
        process.exit(0);
    };
    await server.connect(transport);
    logger.info(`snowarch ${getPackageVersion()} ready on stdio (${advertisedTools().length} tools advertised, `
        + `${collectToolCatalog().length} in the catalogue)`);
}
main().catch((error) => {
    logger.error('Server startup failed', error);
    process.exit(1);
});
