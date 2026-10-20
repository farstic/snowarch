// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The three tools that describe the SERVER rather than a ServiceNow instance.
 *
 * They exist because an unconfigured checkout used to show a crashed MCP server: the
 * process called `process.exit(1)` when it found no instance, so the one moment a user most
 * needs the server to explain itself was the moment it was not running (P-21). These need
 * no instance, so they stay callable in that state.
 *
 * Nothing here returns a credential. `snow_core_capabilities_read` in particular is what the
 * ARC-08 doctor diffs against the store, so it names each field explicitly rather than
 * spreading an object that happens to carry an auth block.
 */
import { instanceManager } from '../servicenow/instances.js';
import { existsSync } from 'node:fs';
import { envPath, globalStorePath, maskPath, projectStorePath, resolveStorePath, } from '../store/index.js';
import { getPackageVersion } from '../utils/version.js';
/** The five tools a session has when nothing is configured. `instance_switch` is NOT among
 *  them: there is nothing to switch to, and offering it would invite an error instead of a
 *  remedy. */
export const CORE_TOOLS_UNCONFIGURED = [
    'snow_core_instances_index',
    'snow_core_instances_reload',
    'snow_core_current_instance_read',
    'snow_core_capabilities_read',
    'snow_core_status_read',
];
export { NO_INSTANCE_MESSAGE } from '../no-instance.js';
import { NO_INSTANCE_MESSAGE } from '../no-instance.js';
import { cliSpelling } from '../cli/tty.js';
/**
 * Why an instance tool is refusing, in the words of the ACTUAL reason.
 *
 * ARC-09-S06. "No instance is configured" is true whenever nothing loaded, and for a store whose
 * schema this build does not read it is the least useful true thing that can be said: the user has
 * instances, they are in the file, and the remedy is one command that the generic sentence does not
 * name. A schema `configError` therefore speaks for itself — its own code, its own message — and
 * everything else keeps the sentence it always had.
 */
export const SCHEMA_CONFIG_ERRORS = ['STORE_SCHEMA_OUTDATED', 'STORE_SCHEMA_NEWER'];
export function unconfiguredRefusal(configErrors) {
    const schema = configErrors.find((e) => SCHEMA_CONFIG_ERRORS.includes(e.code));
    return schema
        ? { code: schema.code, message: schema.message }
        : { code: 'NO_INSTANCE_CONFIGURED', message: NO_INSTANCE_MESSAGE(cliSpelling()) };
}
/** Set by the server so the status tool can report the real number without importing it. */
let advertisedCount = CORE_TOOLS_UNCONFIGURED.length;
export function setAdvertisedCount(n) { advertisedCount = n; }
export function getAdvertisedCount() { return advertisedCount; }
/** Set by the server; called after a reload changes the advertised set. */
let notifyToolListChanged = null;
export function setToolListChangedNotifier(fn) { notifyToolListChanged = fn; }
/** The precedence as a reader needs to see it: the override, then the two file locations. */
export function storeCandidates() {
    const override = envPath('SNOW_STORE');
    const resolved = resolveStorePath();
    const files = override
        // With SNOW_STORE set, resolveStorePath reports only it — the other two are still the
        // places that would have been tried, so they are named here.
        ? [{ path: projectStorePath(), exists: existsSync(projectStorePath()) },
            { path: globalStorePath(), exists: existsSync(globalStorePath()) }]
        : resolved.candidates;
    return [
        { source: 'env', path: override ? maskPath(override) : null, exists: override ? existsSync(override) : false },
        { source: 'project', path: maskPath(files[0].path), exists: files[0].exists },
        { source: 'global', path: maskPath(files[1].path), exists: files[1].exists },
    ];
}
export function serverStatus() {
    const report = instanceManager.getReport();
    const configured = instanceManager.loadedCount() > 0;
    return {
        product: 'snowarch',
        version: getPackageVersion(),
        mode: configured ? 'configured' : 'unconfigured',
        store: {
            source: report.source,
            path: report.path,
            // All THREE places, always — including SNOW_STORE when it is unset. `resolveStorePath`
            // reports only the paths it actually probes, which is right for resolution and wrong
            // for a status read: a reader looking at "none of these exist" needs to see the whole
            // precedence, not the part of it that happened to have a path today.
            candidates: storeCandidates(),
        },
        instances: {
            loaded: report.loaded,
            notLoaded: report.notLoaded.map((n) => ({ label: n.label, code: n.code, message: n.message })),
        },
        configErrors: report.configErrors.map((e) => ({ code: e.code, message: e.message })),
        configWarnings: report.warnings,
        toolsAdvertised: advertisedCount,
        node: process.version,
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        // ARC-04-S10 introduces the audit writer; until then there is no file to name, and
        // reporting a path that does not exist would be worse than reporting none.
        auditFile: null,
    };
}
export function currentCapabilities() {
    // ARC-07-C3 — RE-READ THE STORE FIRST. This is the call a session makes to confirm its state
    // after the user says "done" to a credential fix, and it reported the credentials this process
    // read at startup. So `set-credentials` succeeded in the terminal, the confirm said fine, and
    // the retry was a SECOND failed login against an account the AUTHENTICATION_FAILED remedy warns
    // can be locked by repeated failures. A confirm that reports a state the server is no longer in
    // is worse than no confirm: it is the sentence that authorises the retry.
    //
    // The reload is cheap and already exists — `load()` is idempotent and the store is a small 0600
    // file — and `reloadInstances()` is not used here because that one also re-advertises the tool
    // catalogue and notifies the client; this call only needs the credentials to be current.
    instanceManager.reload();
    const report = instanceManager.getReport();
    if (instanceManager.loadedCount() === 0) {
        return {
            instance: null,
            mode: 'unconfigured',
            remedy: '/snowarch setup-instance',
            storePath: report.path,
            configErrors: report.configErrors.map((e) => ({ code: e.code, message: e.message })),
        };
    }
    const rt = instanceManager.current();
    // Field by field, deliberately. The runtime holds a constructed client, and a spread here
    // would be one refactor away from carrying the config that built it.
    return {
        instance: rt.label,
        url: rt.url,
        environment: rt.environment,
        preset: rt.preset,
        flags: { ...rt.flags },
        effectiveFlags: { ...rt.effectiveFlags },
        toolPackage: rt.toolPackage,
        maxRecords: rt.maxRecords,
        prodWriteAck: rt.prodWriteAck,
        storePath: report.path,
        configError: report.configErrors[0]
            ? { code: report.configErrors[0].code, message: report.configErrors[0].message }
            : null,
        configWarnings: rt.warnings,
    };
}
/**
 * Re-read the store. The path is RE-RESOLVED, not remembered: the common case is a user who
 * ran `./snowarch instance add` in another terminal, so the store often did not exist when
 * the server started.
 *
 * `list_changed` is sent only when the advertised SET changed size (5 ↔ full). Sending it on
 * every reload would make a client re-fetch the catalogue for nothing.
 */
export function reloadInstances() {
    const before = advertisedCount;
    const previousLabel = instanceManager.getCurrentName();
    const report = instanceManager.reload();
    // Keep the caller where they were if that instance still exists; otherwise the store's
    // own default, which `load()` has already applied.
    if (report.loaded.includes(previousLabel))
        instanceManager.switch(previousLabel);
    const after = instanceManager.loadedCount() === 0
        ? CORE_TOOLS_UNCONFIGURED.length
        : fullCatalogueSize();
    setAdvertisedCount(after);
    let listChangedSent = false;
    if (before !== after && notifyToolListChanged) {
        notifyToolListChanged();
        listChangedSent = true;
    }
    return {
        action: 'reloaded',
        source: report.source,
        path: report.path,
        loaded: report.loaded,
        notLoaded: report.notLoaded.map((n) => ({ label: n.label, code: n.code, message: n.message })),
        configErrors: report.configErrors.map((e) => ({ code: e.code, message: e.message })),
        configWarnings: report.warnings,
        toolsAdvertised: after,
        listChangedSent,
    };
}
/** Injected by the server to avoid a cycle: tools/index.ts imports this module. */
let fullSize = 0;
export function setFullCatalogueSize(n) { fullSize = n; }
export function fullCatalogueSize() { return fullSize; }
