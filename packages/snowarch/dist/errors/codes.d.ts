/**
 * Every error code the server throws: one meaning, one remedy, one command.
 *
 * The rule file, `docs/TROUBLESHOOTING.md`, `governance/mcp-protocols.md`, the wizard and the doctor
 * all render from this table. There is no second remedy text anywhere, which is the point: a remedy
 * repeated in five documents is five things to correct and four that will not be.
 *
 * `ServiceNowError` takes `ErrorCodeName`, so an unregistered literal is a compile error rather than
 * a string that reaches a user with no remedy attached. `tests/errors/codes.test.ts` scans `src/`
 * for thrown literals as the second, independent check — a type can be widened by accident, and the
 * scan notices when it has been.
 *
 * Four fields carry the load:
 *   meaning      what happened, in the reader's terms, not the thrower's
 *   remedy       what to do; prose, because most remedies are a judgement rather than a command
 *   command      set ONLY when there is something runnable; renderers set it as code, and they
 *                never parse `remedy` looking for one
 *   showInRule   the code appears in the always-loaded rule file. The rule-visible subset is every
 *                entry with showInRule; the generator derives the list, so no count is kept here.
 *                The flag gates share one wildcard line; the rest are codes a session can act on
 *                mid-task, the network family among them (ARC-08-S10), because a session that meets
 *                DNS, TLS or a refused connection must stop and hand over as it does for a wrong
 *                password
 *   httpStatus   the status the instance returned, where the code maps to one
 *   warning      a warning on a write that succeeded, not an error; with `showInRule` it gets its own
 *                section in the rule file, apart from the runtime errors (ARC-09-C101)
 */
/**
 * THE LAUNCHER IS A PLACEHOLDER HERE — ARC-07-C32, and `<cli>` rather than `{cli}` on purpose.
 *
 * This table is read by three things that render for three different audiences: the generated rules
 * page `.claude/rules/00-mode-and-mcp-gate.md`, which is COMMITTED and so must be one spelling on
 * every machine; the server at runtime, printing to whoever is reading; and the engine's doctor
 * through `packages/contract/lib/contract.mjs`. A literal served the page and lied to the other two —
 * a Windows user who met `STORE_SCHEMA_NEWER` was told `run ./snowarch upgrade`.
 *
 * `<cli>` AND NOT `{cli}` because this file already has a placeholder convention and it is `<…>`:
 * `fillRemedy` substitutes `<host>`, `<proxy>`, `<proxyVar>` and `<issuer>` today. ARC-07-W17's first
 * attempt at this used `{cli}`, which was a second convention AND printed literally to users because
 * the engine's reader substituted nothing — the reason C32 became a row instead of a fix.
 *
 * Note the two KINDS of `<…>` here, because they read alike and behave oppositely: `<cli>` and
 * `<bootstrap>` are substituted by the code, while `<label>` and `<preset>` are meant to SURVIVE for
 * the reader to fill in. A new placeholder belongs to one group or the other, never both.
 */
export interface ErrorCode {
    code: string;
    /** What happened, in the reader's terms. */
    meaning: string;
    /** What the caller does next. Prose; empty only where nothing they could do would help. */
    remedy: string;
    /** A runnable command, when one exists. Rendered as code; never parsed out of `remedy`. */
    command?: string;
    /** Shown in `.claude/rules/00-mode-and-mcp-gate.md`, which is always loaded and must stay short. */
    showInRule: boolean;
    /**
     * A WARNING on a write that succeeded, not an error: it arrives as `warnings[].code` on a tool's
     * result and never as `(Code: X)` on a failure. The rule file lists it under its own heading — the
     * 'Runtime errors' section says stop, never retry, wait, and a write that already happened is none
     * of those (ARC-09-C101).
     */
    warning?: true;
    /**
     * A warning rendered on another warning's line in the rule file, after that code's remedy, rather
     * than on a line of its own (ARC-09-C95): the file stands on its line cap, and a remedy that belongs
     * beside another's costs no line there.
     */
    ruleLineWith?: string;
    /** The HTTP status the instance returned, where this code maps to one. */
    httpStatus?: number;
}
export declare const ERROR_CODES: readonly [{
    readonly code: "WRITE_NOT_ENABLED";
    readonly meaning: "The instance's preset does not enable WRITE_ENABLED.";
    readonly remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`";
    readonly command: "<cli> instance set-preset <label> pdi-developer";
    readonly showInRule: true;
}, {
    readonly code: "CMDB_WRITE_NOT_ENABLED";
    readonly meaning: "The instance's preset does not enable CMDB_WRITE_ENABLED.";
    readonly remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`";
    readonly command: "<cli> instance set-preset <label> pdi-developer";
    readonly showInRule: true;
}, {
    readonly code: "SCRIPTING_NOT_ENABLED";
    readonly meaning: "The instance's preset does not enable SCRIPTING_ENABLED.";
    readonly remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`";
    readonly command: "<cli> instance set-preset <label> pdi-developer";
    readonly showInRule: true;
}, {
    readonly code: "ATF_NOT_ENABLED";
    readonly meaning: "The instance's preset does not enable ATF_ENABLED.";
    readonly remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`";
    readonly command: "<cli> instance set-preset <label> pdi-developer";
    readonly showInRule: true;
}, {
    readonly code: "NOW_ASSIST_NOT_ENABLED";
    readonly meaning: "The instance's preset does not enable NOW_ASSIST_ENABLED.";
    readonly remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`";
    readonly command: "<cli> instance set-preset <label> full";
    readonly showInRule: true;
}, {
    readonly code: "FLUENT_NOT_ENABLED";
    readonly meaning: "The instance's preset does not enable FLUENT_ENABLED.";
    readonly remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`";
    readonly command: "<cli> instance set-preset <label> full";
    readonly showInRule: true;
}, {
    readonly code: "NO_INSTANCE_CONFIGURED";
    readonly meaning: "The server is running and healthy; it has no instance to talk to. It stays up on purpose — an unconfigured checkout used to exit at start-up, so the moment you most needed the server to explain itself was the moment it was gone. Five tools still work: status, capabilities, reload, the instance listing and the current instance.";
    readonly remedy: "add an instance, then call the reload tool — Claude Code does not need restarting, the server re-advertises its catalogue in the same session";
    readonly command: "/snowarch setup-instance";
    readonly showInRule: true;
}, {
    readonly code: "INSTANCE_NOT_LOADED";
    readonly meaning: "The instance is in the store but was not loaded, and the store carries the reason.";
    readonly remedy: "read the reason in the instance listing; a `prod` instance without `prodWriteAck` needs the acknowledgement";
    readonly command: "<cli> instance list";
    readonly showInRule: true;
}, {
    readonly code: "UNKNOWN_INSTANCE";
    readonly meaning: "No instance in the store carries that label.";
    readonly remedy: "the listing prints the labels that exist";
    readonly command: "<cli> instance list";
    readonly showInRule: false;
}, {
    readonly code: "FLAGS_INCOMPLETE";
    readonly meaning: "A store entry does not state all six capability flags. An absent flag is off, so the entry works — but nobody can tell an intended `false` from a forgotten one, and the next preset change starts from a guess.";
    readonly remedy: "state every flag explicitly by re-applying a preset — the review screen shows what changes before anything is written";
    readonly command: "<cli> instance set-preset <label> <preset>";
    readonly showInRule: false;
}, {
    readonly code: "FLAG_DEPENDENCY_VIOLATION";
    readonly meaning: "A flag that requires `WRITE_ENABLED` is on while `WRITE_ENABLED` is off. The tools gated on it are refused at run time and the refusal names WRITE first, so the entry promises a capability it cannot deliver.";
    readonly remedy: "decide which one was meant: turn WRITE on, or turn the dependent flag off. Neither is guessable from the store, so this is never repaired automatically";
    readonly command: "<cli> instance set-preset <label> <preset>";
    readonly showInRule: false;
}, {
    readonly code: "PROD_WRITE_NOT_ACKNOWLEDGED";
    readonly meaning: "The instance is tagged `environment: prod` and holds a write preset without `prodWriteAck: true`.";
    readonly remedy: "A production instance is capped at read-only. Do not suggest editing the store; the user raises it with <cli> instance set-preset <label> <preset> --ack-prod in their terminal";
    readonly showInRule: true;
}, {
    readonly code: "STORE_NOT_FOUND";
    readonly meaning: "`SNOW_STORE` names a file that is not there — an explicit override is never a fallback.";
    readonly remedy: "correct the variable, unset it, or create the store";
    readonly command: "/snowarch setup-instance";
    readonly showInRule: false;
}, {
    readonly code: "STORE_UNREADABLE";
    readonly meaning: "The store exists but is not valid JSON.";
    readonly remedy: "repair or recreate it; the message names the parse error";
    readonly showInRule: false;
}, {
    readonly code: "STORE_SCHEMA_INVALID";
    readonly meaning: "The store parsed but a field is wrong; the message names its path, for example `instances.pdi.flags.WRITE_ENABLED`.";
    readonly remedy: "the message names the field path; correct it in the store";
    readonly showInRule: false;
}, {
    readonly code: "STORE_SCHEMA_OUTDATED";
    readonly meaning: string;
    readonly remedy: "migrate it; a 0600 backup is written first and credential values are never touched";
    readonly command: "<cli> store migrate";
    readonly showInRule: true;
}, {
    readonly code: "STORE_SCHEMA_NEWER";
    readonly meaning: string;
    readonly remedy: string;
    readonly command: "<cli> upgrade";
    readonly showInRule: true;
}, {
    readonly code: "STORE_PERMISSIONS_TOO_OPEN";
    readonly meaning: "The store holds a password and is group/world-readable, or sits in a group/world-writable directory (D-04).";
    readonly remedy: "tighten the mode; on Windows the check is skipped and the doctor notes it instead";
    readonly command: "chmod 600 .local/instances.json";
    readonly showInRule: false;
}, {
    readonly code: "AUTHENTICATION_FAILED";
    readonly meaning: "The instance rejected the credentials — wrong, expired, or the account is locked.";
    readonly remedy: "If a ServiceNow tool returns AUTHENTICATION_FAILED: stop immediately. Do not retry that call or make any other call to the same instance — repeated failed logins can lock the account. Tell the user to run <cli> instance test <label> and, if it fails, <cli> instance set-credentials <label>. Continue only after the user says the credentials were fixed — and then call snow_core_instances_reload before you retry, because this server still holds the credentials it read at startup and a retry without it is a second failed login";
    readonly showInRule: true;
    readonly httpStatus: 401;
}, {
    readonly code: "INSUFFICIENT_PRIVILEGES";
    readonly meaning: "The account is authenticated but lacks a ServiceNow role for that table or operation. This is not a flag.";
    readonly remedy: "The credentials are valid but the account lacks a role for this table. Report the tool, the table and the roles the preset needs (see docs/TROUBLESHOOTING.md); do not switch instances or retry with another tool to work around it";
    readonly showInRule: true;
    readonly httpStatus: 403;
}, {
    readonly code: "INSTANCE_REFUSED";
    readonly meaning: "The instance's own rule — a data policy or a business rule — refused the record. This is not a role.";
    readonly remedy: "the instance's own rule refused the record — read the message, correct the fields it names and send the write again, as a new write with its own approval; do not change roles";
    readonly showInRule: true;
    readonly httpStatus: 403;
}, {
    readonly code: "NOT_FOUND";
    readonly meaning: "The record or table does not exist on this instance.";
    readonly remedy: "check the sys_id and the table name";
    readonly showInRule: false;
    readonly httpStatus: 404;
}, {
    readonly code: "RATE_LIMITED";
    readonly meaning: "The instance is throttling this account.";
    readonly remedy: "retry later; reduce `maxRecords` or the call rate";
    readonly showInRule: false;
    readonly httpStatus: 429;
}, {
    readonly code: "DNS_FAILURE";
    readonly meaning: "The instance host name did not resolve (`ENOTFOUND`, `EAI_AGAIN`).";
    readonly remedy: "the name `<host>` does not resolve. Check the instance name first — a typo is the usual cause; on a corporate network the name may resolve only over VPN, or only through a proxy, so set `HTTPS_PROXY` if there is one (there is one — `<proxyVar>=<proxy>` — and a proxy does not resolve names for you unless the request goes through it, which makes a wrong name the likelier cause)";
    readonly showInRule: true;
}, {
    readonly code: "TLS_CA_UNTRUSTED";
    readonly meaning: "The certificate was not signed by a CA this machine trusts — normal on a network that intercepts TLS.";
    readonly remedy: "the certificate presented for `<host>` is not trusted by Node (issuer: `<issuer>`) — typically a TLS-intercepting gateway, or an expired certificate. Export the gateway root CA as PEM, point `NODE_EXTRA_CA_CERTS` at it for the shell that runs <cli> and in `.claude/settings.local.json` → `env` so the server gets it too, and restart — Node reads it once, at process start. Never `NODE_TLS_REJECT_UNAUTHORIZED=0`: it disables verification for the whole process, which on an intercepting network means trusting the interceptor and every other certificate with it";
    readonly command: "export NODE_EXTRA_CA_CERTS=<path to the PEM>";
    readonly showInRule: true;
}, {
    readonly code: "PROXY_UNREACHABLE";
    readonly meaning: "A proxy variable is set and nothing is listening there, or the connection to it timed out.";
    readonly remedy: "the proxy `<proxyVar>=<proxy>` did not connect to `<host>`. Check the proxy address and credentials, and that `<host>` is not excluded by `NO_PROXY` — or unset the variable if you are not behind a proxy. The proxy is printed with any credentials masked";
    readonly showInRule: true;
}, {
    readonly code: "CONNECTION_REFUSED";
    readonly meaning: "The instance refused the connection and no proxy is configured.";
    readonly remedy: "`<host>` refused the connection — the instance may be hibernated (PDIs sleep after inactivity: wake it at developer.servicenow.com) or blocked by a firewall. Check the URL and its port too";
    readonly showInRule: true;
}, {
    readonly code: "CONNECTION_TIMEOUT";
    readonly meaning: "The connection timed out with no proxy configured.";
    readonly remedy: "no answer from `<host>` in time. If this network needs a proxy, set `HTTPS_PROXY=http://proxy:port` (and `NO_PROXY` for internal hosts) and run again. An idle PDI may be hibernating — wake it at developer.servicenow.com";
    readonly showInRule: true;
}, {
    readonly code: "NETWORK_ERROR";
    readonly meaning: "The instance was unreachable and the cause did not match a more specific classification.";
    readonly remedy: "the message carries the underlying cause";
    readonly showInRule: false;
}, {
    readonly code: "UNSUPPORTED_ON_THIS_INSTANCE";
    readonly meaning: "The tool is registered, the preset let it through, and the server refused without contacting the instance: the operation has no REST endpoint on any instance. The two script-execution stubs stay registered because removing the names would turn a clear refusal into UNKNOWN_TOOL, which reads as \"you spelled it wrong\" and sends you hunting a typo that is not there. They fail before any HTTP request, so nothing reaches the instance and nothing is half-done.";
    readonly remedy: "take the other route: run the script in System Definition > Scripts - Background, or author a Fix Script and run it from the UI. Keep `sys_script_fix.name` to 40 characters — the platform truncates it over REST without an error (see `docs/PLATFORM-NOTES.md` PN-07); a write through this server returns a `VALUE_TRUNCATED` warning";
    readonly showInRule: false;
}, {
    readonly code: "UNKNOWN_TOOL";
    readonly meaning: "A retired or misspelled tool name.";
    readonly remedy: "use the `snow_*` name from `governance/mcp-protocols.md`; maintainers: `npm run lint:contract`";
    readonly showInRule: true;
}, {
    readonly code: "INVALID_REQUEST";
    readonly meaning: "An argument is missing or malformed.";
    readonly remedy: "the message names the argument";
    readonly showInRule: false;
}, {
    readonly code: "VALIDATION_ERROR";
    readonly meaning: "An argument is present but not the expected shape.";
    readonly remedy: "the message names the argument and the shape";
    readonly showInRule: false;
}, {
    readonly code: "NOT_IMPLEMENTED";
    readonly meaning: "The surface was removed.";
    readonly remedy: "the message names what replaced it";
    readonly showInRule: false;
}, {
    readonly code: "ENOTFOUND";
    readonly meaning: "A DNS failure surfaced with the Node identifier rather than the classified code.";
    readonly remedy: "as `DNS_FAILURE`: check the host in the store";
    readonly showInRule: false;
}, {
    readonly code: "ECONNREFUSED";
    readonly meaning: "A refused connection surfaced with the Node identifier.";
    readonly remedy: "as `CONNECTION_REFUSED`: check the URL, the port and any proxy";
    readonly showInRule: false;
}, {
    readonly code: "ETIMEDOUT";
    readonly meaning: "A timeout surfaced with the Node identifier.";
    readonly remedy: "as `CONNECTION_TIMEOUT`";
    readonly showInRule: false;
}, {
    readonly code: "REQUEST_FAILED";
    readonly meaning: "The request failed and the instance response is the only information there is.";
    readonly remedy: "the message carries that response";
    readonly showInRule: false;
}, {
    readonly code: "CREATE_FAILED";
    readonly meaning: "The instance refused the create.";
    readonly remedy: "the message carries the instance response";
    readonly showInRule: false;
}, {
    readonly code: "UPDATE_FAILED";
    readonly meaning: "The instance refused the update.";
    readonly remedy: "the message carries the instance response";
    readonly showInRule: false;
}, {
    readonly code: "QUERY_FAILED";
    readonly meaning: "The instance refused the query.";
    readonly remedy: "the message carries the instance response";
    readonly showInRule: false;
}, {
    readonly code: "DELETE_FAILED";
    readonly meaning: "The instance refused the delete.";
    readonly remedy: "the message carries the instance response";
    readonly showInRule: false;
}, {
    readonly code: "BATCH_FAILED";
    readonly meaning: "One or more requests in the batch failed.";
    readonly remedy: "the message lists which";
    readonly showInRule: false;
}, {
    readonly code: "ATTACHMENT_UPLOAD_FAILED";
    readonly meaning: "The attachment was not stored.";
    readonly remedy: "check the file size and that the target record exists";
    readonly showInRule: false;
}, {
    readonly code: "SCRIPT_FAILED";
    readonly meaning: "The script ran and errored.";
    readonly remedy: "the message carries the instance output";
    readonly showInRule: false;
}, {
    readonly code: "DELETE_ACL_DENIED";
    readonly meaning: "The account lacks delete access to that table. This is not a flag.";
    readonly remedy: "use an account with the role";
    readonly showInRule: false;
}, {
    readonly code: "DELETE_CONSTRAINT";
    readonly meaning: "Another record references it.";
    readonly remedy: "remove the reference first";
    readonly showInRule: false;
}, {
    readonly code: "DELETE_NOT_FOUND";
    readonly meaning: "Nothing exists at that sys_id to delete.";
    readonly remedy: "check the sys_id";
    readonly showInRule: false;
}, {
    readonly code: "FLUENT_NOT_INSTALLED";
    readonly meaning: "The ServiceNow SDK is not on `PATH`.";
    readonly remedy: "install it globally — the doctor checks `PATH`, so a checkout-local install would pass here and fail there";
    readonly command: "npm i -g @servicenow/sdk";
    readonly showInRule: true;
}, {
    readonly code: "FLUENT_ERROR";
    readonly meaning: "The SDK ran and failed.";
    readonly remedy: "the message carries the SDK output";
    readonly showInRule: false;
}, {
    readonly code: "NOW_ASSIST_ERROR";
    readonly meaning: "A Now Assist call failed.";
    readonly remedy: "the message carries the instance response; check the Now Assist licence on the instance";
    readonly showInRule: false;
}, {
    readonly code: "SCHEMA_NOT_CACHED";
    readonly meaning: "A tool needed a table schema that has not been read this session.";
    readonly remedy: "call the schema read tool for that table first";
    readonly showInRule: false;
}, {
    readonly code: "INSTANCE_UNUSABLE";
    readonly meaning: "The store entry parsed but no client could be built from it.";
    readonly remedy: "the message says which field is impossible";
    readonly showInRule: false;
}, {
    readonly code: "UNKNOWN_GATE";
    readonly meaning: "Server defect: a tool declares a gate the evaluator does not know.";
    readonly remedy: "report it; no user action can help";
    readonly showInRule: false;
}, {
    readonly code: "PROXY_AUTH_REQUIRED";
    readonly meaning: "The proxy answered 407: it wants credentials before it will forward the request.";
    readonly remedy: "the proxy is asking for credentials: put them in the proxy URL (`HTTPS_PROXY=http://user:pass@proxy:port`). NTLM and Kerberos proxies are not supported — the request has to reach the instance through a proxy that accepts basic credentials";
    readonly showInRule: true;
    readonly httpStatus: 407;
}, {
    readonly code: "LEGACY_STORE_NOT_FOUND";
    readonly meaning: "There is no snow-mcp 1.x store at the path the import was pointed at.";
    readonly remedy: "check the path, or pass `--path <file>` if the legacy store was kept somewhere else; `<cli> doctor` reports where it looked";
    readonly command: "<cli> instance import --from-legacy --path <file> --dry-run";
    readonly showInRule: false;
}, {
    readonly code: "LEGACY_STORE_UNREADABLE";
    readonly meaning: "The legacy store is not JSON this reader can parse.";
    readonly remedy: "open it and check it is a complete JSON object; a half-written file from an interrupted 1.x session cannot be migrated and its instances are re-added with `instance add`";
    readonly showInRule: false;
}, {
    readonly code: "LABEL_NOT_FOUND";
    readonly meaning: "No instance with that label is in the store this checkout resolves.";
    readonly remedy: "run `instance list` to see the labels this checkout has, or `instance add <label>` to add one";
    readonly command: "<cli> instance list";
    readonly showInRule: false;
}, {
    readonly code: "LABEL_EXISTS";
    readonly meaning: "An instance with that label is already in the store.";
    readonly remedy: "use `instance set-credentials` or `instance set-preset` to change it, `instance remove` to delete it, or `--replace` to overwrite it";
    readonly command: "<cli> instance add <label> --url <url> --env <env> --replace";
    readonly showInRule: false;
}, {
    readonly code: "ENV_REQUIRED";
    readonly meaning: "The environment could not be proposed and none was given, in a run that cannot ask.";
    readonly remedy: "pass `--env pdi|dev|test|prod`. Only `devNNNNN.service-now.com` hosts are recognised as PDIs, and the environment decides the preset a write is checked against — guessing it is the one thing this wizard will not do";
    readonly command: "<cli> instance add <label> --url <url> --env <pdi|dev|test|prod> --yes";
    readonly showInRule: false;
}, {
    readonly code: "URL_REQUIRED";
    readonly meaning: "The wizard needs an instance URL and none was given.";
    readonly remedy: "enter the full https URL of the instance; non-interactively pass `--url <origin>` (a URL cannot be proposed)";
    readonly showInRule: false;
}, {
    readonly code: "URL_INVALID";
    readonly meaning: "The value is not a URL the server can parse.";
    readonly remedy: "enter it as `https://<host>.service-now.com`";
    readonly showInRule: false;
}, {
    readonly code: "URL_NOT_HTTPS";
    readonly meaning: "The URL is not https. Credentials would cross the network in clear.";
    readonly remedy: "use the https form of the same host";
    readonly showInRule: false;
}, {
    readonly code: "URL_HAS_PATH";
    readonly meaning: "The URL carries a path; only the origin is stored.";
    readonly remedy: "drop everything after the host";
    readonly showInRule: false;
}, {
    readonly code: "URL_HAS_CREDENTIALS";
    readonly meaning: "The URL embeds a user name or password, which would put a secret in the store URL and in logs.";
    readonly remedy: "remove them; the wizard asks for credentials separately";
    readonly showInRule: false;
}, {
    readonly code: "OAUTH_ROPC_DISABLED";
    readonly meaning: "The instance has the OAuth password grant disabled.";
    readonly remedy: "use basic authentication, or have an administrator enable the grant type";
    readonly showInRule: false;
}, {
    readonly code: "OAUTH_CLIENT_INVALID";
    readonly meaning: "The OAuth client id or secret was rejected.";
    readonly remedy: "check them against the Application Registry entry on the instance";
    readonly showInRule: false;
}, {
    readonly code: "STORE_IN_CLOUD_SYNC_FOLDER";
    readonly meaning: "this checkout is under <provider> (<root>). File mode 0600 does not stop synchronisation — the credential store would be uploaded to that service.";
    readonly remedy: "move the checkout outside the synced folder, or keep credentials in the global store with `--global` (<global> is not synced by default)";
    readonly showInRule: false;
}, {
    readonly code: "TLS_CERT_INVALID";
    readonly meaning: "The certificate is invalid for reasons other than an untrusted root — expired, or the wrong host.";
    readonly remedy: "check the instance URL and the certificate; this is not a CA-trust problem";
    readonly showInRule: false;
}, {
    readonly code: "VALUE_TRUNCATED";
    readonly meaning: "A WARNING on a write that succeeded, not an error: a string appears to have been cut at its column — the platform stored only the first part of it, without refusing. It arrives as `warnings[].code` on the tool's result (or as a note on the error of a tool that failed after it wrote) and names the field, both lengths and a limit. The limit is the dictionary's stated `max_length` when `confirmed` is true, and otherwise the stored length, which is a lower bound; a column defined on a parent table never confirms.";
    readonly remedy: "the record exists with the stored value, so modify it with a value of at most `column_limit` characters (when `confirmed` is false that length is only known to fit); do not add it again, which would make a second record. If the record is active, set `active` to false until it is corrected";
    readonly showInRule: true;
    readonly warning: true;
}, {
    readonly code: "FIELD_NOT_STORED";
    readonly meaning: "A WARNING on a write that succeeded, not an error: a field the tool sent is not shown as set in the platform's response (for `snow_scr_business_rule_add`: `filter_condition` or `advanced`), or, for the ATF authoring tools, in the record read back after the write — a step input that no row attaches to the step included. The record exists without it — a Business Rule without its filter runs on every matching operation. It arrives as `warnings[].code` on the tool's result.";
    readonly remedy: "read the record back; if the field is not set, set it with a modify rather than adding the record again, and if the record is active set `active` to false first. If it is set, the response did not echo it: the column names are not documented in the bundled corpus, so check them on the instance";
    readonly showInRule: true;
    readonly warning: true;
}, {
    readonly code: "VALUE_TOO_LONG";
    readonly meaning: "A write refused BEFORE it was sent (ARC-09-C97): a string is longer than its column's `max_length`, read fresh from `sys_dictionary` for this write — on the table that defines the column, which for an inherited one is a table it extends. Nothing was written by this write. Lengths are counted in code points, as VALUE_TRUNCATED counts them. When the same call wrote other records first, the error lists them (`details.written`).";
    readonly remedy: "shorten the value to at most the stated length and send the write again; records the call already wrote (named in the error) exist, so do not add them again";
    readonly showInRule: false;
}, {
    readonly code: "VALUE_NOT_AS_SENT";
    readonly meaning: "A WARNING on a write that succeeded, not an error: a field the tool sent reads back with a different value — neither missing nor a cut prefix — once line endings are normalised (the ATF authoring tools, ARC-09-C95). It names the field, the first differing offset and both lengths, never the values. Also raised when more than one row holds a step input that should be held once.";
    readonly remedy: "the record exists with the stored value: read it back and, if that value is wrong, correct it with a modify — do not add it again, which would make a second record";
    readonly showInRule: true;
    readonly warning: true;
    readonly ruleLineWith: "VALUE_TRUNCATED";
}, {
    readonly code: "LICENCE_NOT_VALID";
    readonly meaning: "This checkout's licence does not cover the call: it is missing, invalid, expired or revoked, or it is a design-only licence and the server is live. Every tool is refused, the instance-free ones included, on every build.";
    readonly remedy: "Run <cli> licence check to see why, then install a valid licence as .local/licence.json. A running Claude Code session keeps what it read at start, so restart it afterwards";
    readonly command: "<cli> licence check";
    readonly showInRule: false;
}, {
    readonly code: "INTEGRITY_NOT_VERIFIED";
    readonly meaning: "This checkout's own files are not the signed release's, and they could not be restored: no signed manifest is held, it does not verify, it is another release's, there is no tag to restore from, or the restore failed. Every tool is refused, as for a refused licence. A change the product could restore was restored, and is not this.";
    readonly remedy: "Run <cli> doctor: its Integrity line names the reason. <cli> licence check --refresh fetches a missing manifest; a checkout that cannot be restored is reinstalled from a signed release tag. A running Claude Code session keeps what its server read at start, so restart it afterwards";
    readonly command: "<cli> doctor";
    readonly showInRule: false;
}];
export declare const ERROR_CODE_NAMES: ReadonlySet<string>;
/**
 * The union of registered codes.
 *
 * `ServiceNowError` narrows its `code` to this, so an unregistered literal at a throw site is a
 * compile error. Derived from the array rather than declared beside it: two lists would
 * disagree. (Stated without writing out an example call — the completeness scan greps source
 * for thrown literals and cannot tell a comment from code, so an illustration here would
 * register as an unregistered code.)
 */
export type ErrorCodeName = (typeof ERROR_CODES)[number]['code'];
/**
 * The remedy for a code, for anything that shows one. There is no other source.
 *
 * Overloaded so a REGISTERED name resolves to an `ErrorCode` rather than `ErrorCode | undefined`:
 * a caller passing a literal key would otherwise need a `??` fallback for an arm that cannot run,
 * and an unreachable branch fails the 100% gate (ARC-07-S04 hit exactly that with `?? []`).
 * `ErrorCodeName` makes a removed key a compile error at the call site first, which is what makes
 * the narrower signature true rather than convenient.
 */
/**
 * The launcher placeholders, filled in for the reader asking — ARC-07-C32.
 *
 * THE SPELLINGS ARRIVE AS STRINGS, and that is forced rather than chosen. This module may have NO
 * static imports at all: `probe-auth` loads the error registry before B04 has installed anything, so
 * an import here would make `./snowarch bootstrap --mode design` fail on a fresh clone —
 * `tools/snowarch/tests/b04-deps.test.mjs` asserts `dist/errors/codes.js` has zero imports, and it
 * is what caught my first version importing `cli/tty.js`. So the caller resolves the shell with
 * `cliSpelling`/`bootstrapSpelling` and hands the answers in; this does pure string work.
 *
 * ABSENT means unfilled rather than guessed: a caller that supplies nothing gets the placeholder
 * back and `tests/contract/launcher-placeholder.test.mjs` fails on it, which is better than this
 * module inventing a shell it has no way to know.
 */
export interface LauncherSpelling {
    cli: string;
    bootstrap: string;
}
export declare function remedyFor(code: ErrorCodeName, spell?: LauncherSpelling): ErrorCode;
export declare function remedyFor(code: string, spell?: LauncherSpelling): ErrorCode | undefined;
