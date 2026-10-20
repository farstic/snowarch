// `as const satisfies` and not `: ErrorCode[]`. The annotation would widen every `code` to
// `string`, and `ErrorCodeName` — the whole point of the narrowing — would come out as `string`
// too: a union that accepts everything, compiling happily over a typo. `satisfies` keeps the
// shape checked while the literals survive.
export const ERROR_CODES = [
    {
        code: 'WRITE_NOT_ENABLED',
        meaning: "The instance's preset does not enable WRITE_ENABLED.",
        remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`",
        command: "<cli> instance set-preset <label> pdi-developer",
        showInRule: true,
    },
    {
        code: 'CMDB_WRITE_NOT_ENABLED',
        meaning: "The instance's preset does not enable CMDB_WRITE_ENABLED.",
        remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`",
        command: "<cli> instance set-preset <label> pdi-developer",
        showInRule: true,
    },
    {
        code: 'SCRIPTING_NOT_ENABLED',
        meaning: "The instance's preset does not enable SCRIPTING_ENABLED.",
        remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`",
        command: "<cli> instance set-preset <label> pdi-developer",
        showInRule: true,
    },
    {
        code: 'ATF_NOT_ENABLED',
        meaning: "The instance's preset does not enable ATF_ENABLED.",
        remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`",
        command: "<cli> instance set-preset <label> pdi-developer",
        showInRule: true,
    },
    {
        code: 'NOW_ASSIST_NOT_ENABLED',
        meaning: "The instance's preset does not enable NOW_ASSIST_ENABLED.",
        remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`",
        command: "<cli> instance set-preset <label> full",
        showInRule: true,
    },
    {
        code: 'FLUENT_NOT_ENABLED',
        meaning: "The instance's preset does not enable FLUENT_ENABLED.",
        remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`",
        command: "<cli> instance set-preset <label> full",
        showInRule: true,
    },
    {
        code: 'NO_INSTANCE_CONFIGURED',
        meaning: "The server is running and healthy; it has no instance to talk to. It stays up on purpose — an unconfigured checkout used to exit at start-up, so the moment you most needed the server to explain itself was the moment it was gone. Five tools still work: status, capabilities, reload, the instance listing and the current instance.",
        remedy: "add an instance, then call the reload tool — Claude Code does not need restarting, the server re-advertises its catalogue in the same session",
        command: "/snowarch setup-instance",
        showInRule: true,
    },
    {
        code: 'INSTANCE_NOT_LOADED',
        meaning: "The instance is in the store but was not loaded, and the store carries the reason.",
        // ARC-08-S10: rule-visible. The remedy names the listing FIRST and the prod case second,
        // because "not loaded" has more than one cause and a remedy that named only the common one
        // would send a reader to acknowledge a prod flag on an instance that is not prod.
        remedy: "read the reason in the instance listing; a `prod` instance without `prodWriteAck` needs the acknowledgement",
        command: "<cli> instance list",
        showInRule: true,
    },
    {
        code: 'UNKNOWN_INSTANCE',
        meaning: "No instance in the store carries that label.",
        remedy: "the listing prints the labels that exist",
        command: "<cli> instance list",
        showInRule: false,
    },
    {
        code: 'FLAGS_INCOMPLETE',
        meaning: "A store entry does not state all six capability flags. An absent flag is off, so the entry works — but nobody can tell an intended `false` from a forgotten one, and the next preset change starts from a guess.",
        remedy: "state every flag explicitly by re-applying a preset — the review screen shows what changes before anything is written",
        command: "<cli> instance set-preset <label> <preset>",
        showInRule: false,
    },
    {
        code: 'FLAG_DEPENDENCY_VIOLATION',
        meaning: "A flag that requires `WRITE_ENABLED` is on while `WRITE_ENABLED` is off. The tools gated on it are refused at run time and the refusal names WRITE first, so the entry promises a capability it cannot deliver.",
        remedy: "decide which one was meant: turn WRITE on, or turn the dependent flag off. Neither is guessable from the store, so this is never repaired automatically",
        command: "<cli> instance set-preset <label> <preset>",
        showInRule: false,
    },
    {
        code: 'PROD_WRITE_NOT_ACKNOWLEDGED',
        meaning: "The instance is tagged `environment: prod` and holds a write preset without `prodWriteAck: true`.",
        remedy: "A production instance is capped at read-only. Do not suggest editing the store; the user raises it with <cli> instance set-preset <label> <preset> --ack-prod in their terminal",
        showInRule: true,
    },
    {
        code: 'STORE_NOT_FOUND',
        meaning: "`SNOW_STORE` names a file that is not there — an explicit override is never a fallback.",
        remedy: "correct the variable, unset it, or create the store",
        command: "/snowarch setup-instance",
        showInRule: false,
    },
    {
        code: 'STORE_UNREADABLE',
        meaning: "The store exists but is not valid JSON.",
        remedy: "repair or recreate it; the message names the parse error",
        showInRule: false,
    },
    {
        code: 'STORE_SCHEMA_INVALID',
        meaning: "The store parsed but a field is wrong; the message names its path, for example `instances.pdi.flags.WRITE_ENABLED`.",
        remedy: "the message names the field path; correct it in the store",
        showInRule: false,
    },
    {
        // ARC-09-S06 split `STORE_SCHEMA_UNSUPPORTED` in two. One code for both directions gave one
        // remedy — "run ./snowarch upgrade" — which is right for a store from the future and useless
        // for one from the past: the checkout is already new enough, and the file that needs
        // migrating is untouched by an upgrade. Two directions, two commands.
        code: 'STORE_SCHEMA_OUTDATED',
        meaning: "The store was written by an older server and this build does not read that schema. "
            + "Nothing migrates on load — an explicit command is what rewrites a credential file.",
        remedy: "migrate it; a 0600 backup is written first and credential values are never touched",
        command: "<cli> store migrate",
        // A session must STOP here: the model's job is to tell the user to run the command, never to
        // edit the store itself. That is the whole reason this one is in the always-loaded rule file
        // and `STORE_SCHEMA_INVALID` is not.
        showInRule: true,
    },
    {
        code: 'STORE_SCHEMA_NEWER',
        meaning: "The store was written by a NEWER server than this one — a checkout left behind, "
            + "not a broken file.",
        remedy: "upgrade this checkout, rather than editing the store down; a backup can be restored "
            + "if the newer server wrote one",
        command: "<cli> upgrade",
        showInRule: true,
    },
    {
        code: 'STORE_PERMISSIONS_TOO_OPEN',
        meaning: "The store holds a password and is group/world-readable, or sits in a group/world-writable directory (D-04).",
        remedy: "tighten the mode; on Windows the check is skipped and the doctor notes it instead",
        command: "chmod 600 .local/instances.json",
        showInRule: false,
    },
    {
        code: 'AUTHENTICATION_FAILED',
        meaning: "The instance rejected the credentials — wrong, expired, or the account is locked.",
        // ARC-07-S10: the RUNTIME rule text. `showInRule: true` renders this remedy into
        // `.claude/rules/00-mode-and-mcp-gate.md`, which a session always has loaded — so the words
        // are addressed to the model that must stop, and they name the two commands inline rather
        // than through the `command` field, because the renderer appends that AFTER the sentence and
        // the paragraph has to read as one instruction. `01` §8's mapping, in the registry.
        //
        // "a ServiceNow tool", NOT the `mcp__…__` prefix the story's draft spelled: the rule file
        // states that prefix exactly ONCE, rendered from `engine.config.json`'s server key, and
        // ARC-05's own test asserts both the count and the absence of a literal. A second, hard-coded
        // copy here would fail that test and would be wrong the day the key changes.
        remedy: "If a ServiceNow tool returns AUTHENTICATION_FAILED: stop immediately. Do not retry that call or make any other call to the same instance — repeated failed logins can lock the account. Tell the user to run <cli> instance test <label> and, if it fails, <cli> instance set-credentials <label>. Continue only after the user says the credentials were fixed — and then call snow_core_instances_reload before you retry, because this server still holds the credentials it read at startup and a retry without it is a second failed login",
        showInRule: true,
        httpStatus: 401,
    },
    {
        code: 'INSUFFICIENT_PRIVILEGES',
        meaning: "The account is authenticated but lacks a ServiceNow role for that table or operation. This is not a flag.",
        remedy: "The credentials are valid but the account lacks a role for this table. Report the tool, the table and the roles the preset needs (see docs/TROUBLESHOOTING.md); do not switch instances or retry with another tool to work around it",
        showInRule: true,
        httpStatus: 403,
    },
    {
        // ARC-09-C182 — a 403 whose detail is the instance's own rule, not an access decision (the client's 403 arm).
        code: 'INSTANCE_REFUSED',
        meaning: "The instance's own rule — a data policy or a business rule — refused the record. This is not a role.",
        remedy: "the instance's own rule refused the record — read the message, correct the fields it names and send the write again, as a new write with its own approval; do not change roles",
        showInRule: true,
        httpStatus: 403,
    },
    {
        code: 'NOT_FOUND',
        meaning: "The record or table does not exist on this instance.",
        remedy: "check the sys_id and the table name",
        showInRule: false,
        httpStatus: 404,
    },
    {
        code: 'RATE_LIMITED',
        meaning: "The instance is throttling this account.",
        remedy: "retry later; reduce `maxRecords` or the call rate",
        showInRule: false,
        httpStatus: 429,
    },
    {
        code: 'DNS_FAILURE',
        meaning: "The instance host name did not resolve (`ENOTFOUND`, `EAI_AGAIN`).",
        // ARC-08-S10: rule-visible, and reworded for the two audiences it now has. It used to end in
        // two adjacent parentheticals, so with a proxy configured it read "…through a proxy (set
        // HTTPS_PROXY) (a proxy is configured — …)" — advice to set a variable that is set, in the
        // sentence that says it is. One conditional clause now, and the unconditional half states the
        // usual cause plainly enough to serve as the line a session prints.
        remedy: "the name `<host>` does not resolve. Check the instance name first — a typo is the usual cause; on a corporate network the name may resolve only over VPN, or only through a proxy, so set `HTTPS_PROXY` if there is one (there is one — `<proxyVar>=<proxy>` — and a proxy does not resolve names for you unless the request goes through it, which makes a wrong name the likelier cause)",
        showInRule: true,
    },
    {
        code: 'TLS_CA_UNTRUSTED',
        meaning: "The certificate was not signed by a CA this machine trusts — normal on a network that intercepts TLS.",
        remedy: "the certificate presented for `<host>` is not trusted by Node (issuer: `<issuer>`) — typically a TLS-intercepting gateway, or an expired certificate. Export the gateway root CA as PEM, point `NODE_EXTRA_CA_CERTS` at it for the shell that runs <cli> and in `.claude/settings.local.json` → `env` so the server gets it too, and restart — Node reads it once, at process start. Never `NODE_TLS_REJECT_UNAUTHORIZED=0`: it disables verification for the whole process, which on an intercepting network means trusting the interceptor and every other certificate with it",
        command: "export NODE_EXTRA_CA_CERTS=<path to the PEM>",
        showInRule: true,
    },
    {
        code: 'PROXY_UNREACHABLE',
        meaning: "A proxy variable is set and nothing is listening there, or the connection to it timed out.",
        remedy: "the proxy `<proxyVar>=<proxy>` did not connect to `<host>`. Check the proxy address and credentials, and that `<host>` is not excluded by `NO_PROXY` — or unset the variable if you are not behind a proxy. The proxy is printed with any credentials masked",
        showInRule: true,
    },
    {
        code: 'CONNECTION_REFUSED',
        // ARC-08-S10's review added the seventh: a hibernating PDI is the network error this product
        // meets most often, and the story's list had left it out. Retrying a refused connection wakes
        // nothing — the user has to open developer.servicenow.com — so it belongs with the family that
        // a session hands over rather than repeats.
        meaning: "The instance refused the connection and no proxy is configured.",
        remedy: "`<host>` refused the connection — the instance may be hibernated (PDIs sleep after inactivity: wake it at developer.servicenow.com) or blocked by a firewall. Check the URL and its port too",
        showInRule: true,
    },
    {
        code: 'CONNECTION_TIMEOUT',
        meaning: "The connection timed out with no proxy configured.",
        remedy: "no answer from `<host>` in time. If this network needs a proxy, set `HTTPS_PROXY=http://proxy:port` (and `NO_PROXY` for internal hosts) and run again. An idle PDI may be hibernating — wake it at developer.servicenow.com",
        showInRule: true,
    },
    {
        code: 'NETWORK_ERROR',
        meaning: "The instance was unreachable and the cause did not match a more specific classification.",
        remedy: "the message carries the underlying cause",
        showInRule: false,
    },
    {
        code: 'UNSUPPORTED_ON_THIS_INSTANCE',
        meaning: "The tool is registered, the preset let it through, and the server refused without contacting the instance: the operation has no REST endpoint on any instance. The two script-execution stubs stay registered because removing the names would turn a clear refusal into UNKNOWN_TOOL, which reads as \"you spelled it wrong\" and sends you hunting a typo that is not there. They fail before any HTTP request, so nothing reaches the instance and nothing is half-done.",
        remedy: "take the other route: run the script in System Definition > Scripts - Background, or author a Fix Script and run it from the UI. Keep `sys_script_fix.name` to 40 characters — the platform truncates it over REST without an error (see `docs/PLATFORM-NOTES.md` PN-07); a write through this server returns a `VALUE_TRUNCATED` warning",
        showInRule: false,
    },
    {
        code: 'UNKNOWN_TOOL',
        meaning: "A retired or misspelled tool name.",
        remedy: "use the `snow_*` name from `governance/mcp-protocols.md`; maintainers: `npm run lint:contract`",
        showInRule: true,
    },
    {
        code: 'INVALID_REQUEST',
        meaning: "An argument is missing or malformed.",
        remedy: "the message names the argument",
        showInRule: false,
    },
    {
        code: 'VALIDATION_ERROR',
        meaning: "An argument is present but not the expected shape.",
        remedy: "the message names the argument and the shape",
        showInRule: false,
    },
    {
        code: 'NOT_IMPLEMENTED',
        meaning: "The surface was removed.",
        remedy: "the message names what replaced it",
        showInRule: false,
    },
    {
        code: 'ENOTFOUND',
        meaning: "A DNS failure surfaced with the Node identifier rather than the classified code.",
        remedy: "as `DNS_FAILURE`: check the host in the store",
        showInRule: false,
    },
    {
        code: 'ECONNREFUSED',
        meaning: "A refused connection surfaced with the Node identifier.",
        remedy: "as `CONNECTION_REFUSED`: check the URL, the port and any proxy",
        showInRule: false,
    },
    {
        code: 'ETIMEDOUT',
        meaning: "A timeout surfaced with the Node identifier.",
        remedy: "as `CONNECTION_TIMEOUT`",
        showInRule: false,
    },
    {
        code: 'REQUEST_FAILED',
        meaning: "The request failed and the instance response is the only information there is.",
        remedy: "the message carries that response",
        showInRule: false,
    },
    {
        code: 'CREATE_FAILED',
        meaning: "The instance refused the create.",
        remedy: "the message carries the instance response",
        showInRule: false,
    },
    {
        code: 'UPDATE_FAILED',
        meaning: "The instance refused the update.",
        remedy: "the message carries the instance response",
        showInRule: false,
    },
    {
        code: 'QUERY_FAILED',
        meaning: "The instance refused the query.",
        remedy: "the message carries the instance response",
        showInRule: false,
    },
    {
        code: 'DELETE_FAILED',
        meaning: "The instance refused the delete.",
        remedy: "the message carries the instance response",
        showInRule: false,
    },
    {
        code: 'BATCH_FAILED',
        meaning: "One or more requests in the batch failed.",
        remedy: "the message lists which",
        showInRule: false,
    },
    {
        code: 'ATTACHMENT_UPLOAD_FAILED',
        meaning: "The attachment was not stored.",
        remedy: "check the file size and that the target record exists",
        showInRule: false,
    },
    {
        code: 'SCRIPT_FAILED',
        meaning: "The script ran and errored.",
        remedy: "the message carries the instance output",
        showInRule: false,
    },
    {
        code: 'DELETE_ACL_DENIED',
        meaning: "The account lacks delete access to that table. This is not a flag.",
        remedy: "use an account with the role",
        showInRule: false,
    },
    {
        code: 'DELETE_CONSTRAINT',
        meaning: "Another record references it.",
        remedy: "remove the reference first",
        showInRule: false,
    },
    {
        code: 'DELETE_NOT_FOUND',
        meaning: "Nothing exists at that sys_id to delete.",
        remedy: "check the sys_id",
        showInRule: false,
    },
    {
        code: 'FLUENT_NOT_INSTALLED',
        meaning: "The ServiceNow SDK is not on `PATH`.",
        remedy: "install it globally — the doctor checks `PATH`, so a checkout-local install would pass here and fail there",
        command: "npm i -g @servicenow/sdk",
        showInRule: true,
    },
    {
        code: 'FLUENT_ERROR',
        meaning: "The SDK ran and failed.",
        remedy: "the message carries the SDK output",
        showInRule: false,
    },
    {
        code: 'NOW_ASSIST_ERROR',
        meaning: "A Now Assist call failed.",
        remedy: "the message carries the instance response; check the Now Assist licence on the instance",
        showInRule: false,
    },
    {
        code: 'SCHEMA_NOT_CACHED',
        meaning: "A tool needed a table schema that has not been read this session.",
        remedy: "call the schema read tool for that table first",
        showInRule: false,
    },
    {
        code: 'INSTANCE_UNUSABLE',
        meaning: "The store entry parsed but no client could be built from it.",
        remedy: "the message says which field is impossible",
        showInRule: false,
    },
    {
        code: 'UNKNOWN_GATE',
        meaning: "Server defect: a tool declares a gate the evaluator does not know.",
        remedy: "report it; no user action can help",
        showInRule: false,
    },
    {
        code: 'PROXY_AUTH_REQUIRED',
        meaning: "The proxy answered 407: it wants credentials before it will forward the request.",
        // ARC-08-S10: "put them in the proxy URL" opened on a pronoun whose antecedent was in the
        // MEANING — which the rule file does not render, only the remedy. Fine in TROUBLESHOOTING,
        // where the two sit one above the other; a dangling "them" in the file a session reads.
        remedy: "the proxy is asking for credentials: put them in the proxy URL (`HTTPS_PROXY=http://user:pass@proxy:port`). NTLM and Kerberos proxies are not supported — the request has to reach the instance through a proxy that accepts basic credentials",
        showInRule: true,
        httpStatus: 407,
    },
    {
        code: 'LEGACY_STORE_NOT_FOUND',
        meaning: "There is no snow-mcp 1.x store at the path the import was pointed at.",
        remedy: "check the path, or pass `--path <file>` if the legacy store was kept somewhere else; `<cli> doctor` reports where it looked",
        command: "<cli> instance import --from-legacy --path <file> --dry-run",
        showInRule: false,
    },
    {
        code: 'LEGACY_STORE_UNREADABLE',
        meaning: "The legacy store is not JSON this reader can parse.",
        remedy: "open it and check it is a complete JSON object; a half-written file from an interrupted 1.x session cannot be migrated and its instances are re-added with `instance add`",
        showInRule: false,
    },
    {
        code: 'LABEL_NOT_FOUND',
        meaning: "No instance with that label is in the store this checkout resolves.",
        remedy: "run `instance list` to see the labels this checkout has, or `instance add <label>` to add one",
        command: "<cli> instance list",
        showInRule: false,
    },
    {
        code: 'LABEL_EXISTS',
        meaning: "An instance with that label is already in the store.",
        remedy: "use `instance set-credentials` or `instance set-preset` to change it, `instance remove` to delete it, or `--replace` to overwrite it",
        command: "<cli> instance add <label> --url <url> --env <env> --replace",
        showInRule: false,
    },
    {
        code: 'ENV_REQUIRED',
        meaning: "The environment could not be proposed and none was given, in a run that cannot ask.",
        remedy: "pass `--env pdi|dev|test|prod`. Only `devNNNNN.service-now.com` hosts are recognised as PDIs, and the environment decides the preset a write is checked against — guessing it is the one thing this wizard will not do",
        command: "<cli> instance add <label> --url <url> --env <pdi|dev|test|prod> --yes",
        showInRule: false,
    },
    {
        code: 'URL_REQUIRED',
        meaning: "The wizard needs an instance URL and none was given.",
        remedy: "enter the full https URL of the instance; non-interactively pass `--url <origin>` (a URL cannot be proposed)",
        showInRule: false,
    },
    {
        code: 'URL_INVALID',
        meaning: "The value is not a URL the server can parse.",
        remedy: "enter it as `https://<host>.service-now.com`",
        showInRule: false,
    },
    {
        code: 'URL_NOT_HTTPS',
        meaning: "The URL is not https. Credentials would cross the network in clear.",
        remedy: "use the https form of the same host",
        showInRule: false,
    },
    {
        code: 'URL_HAS_PATH',
        meaning: "The URL carries a path; only the origin is stored.",
        remedy: "drop everything after the host",
        showInRule: false,
    },
    {
        code: 'URL_HAS_CREDENTIALS',
        meaning: "The URL embeds a user name or password, which would put a secret in the store URL and in logs.",
        remedy: "remove them; the wizard asks for credentials separately",
        showInRule: false,
    },
    {
        code: 'OAUTH_ROPC_DISABLED',
        meaning: "The instance has the OAuth password grant disabled.",
        remedy: "use basic authentication, or have an administrator enable the grant type",
        showInRule: false,
    },
    {
        code: 'OAUTH_CLIENT_INVALID',
        meaning: "The OAuth client id or secret was rejected.",
        remedy: "check them against the Application Registry entry on the instance",
        showInRule: false,
    },
    {
        code: 'STORE_IN_CLOUD_SYNC_FOLDER',
        meaning: "this checkout is under <provider> (<root>). File mode 0600 does not stop synchronisation — the credential store would be uploaded to that service.",
        remedy: "move the checkout outside the synced folder, or keep credentials in the global store with `--global` (<global> is not synced by default)",
        showInRule: false,
    },
    {
        code: 'TLS_CERT_INVALID',
        meaning: "The certificate is invalid for reasons other than an untrusted root — expired, or the wrong host.",
        remedy: "check the instance URL and the certificate; this is not a CA-trust problem",
        showInRule: false,
    },
    {
        code: 'VALUE_TRUNCATED',
        meaning: "A WARNING on a write that succeeded, not an error: a string appears to have been cut at its column — the platform stored only the first part of it, without refusing. It arrives as `warnings[].code` on the tool's result (or as a note on the error of a tool that failed after it wrote) and names the field, both lengths and a limit. The limit is the dictionary's stated `max_length` when `confirmed` is true, and otherwise the stored length, which is a lower bound; a column defined on a parent table never confirms.",
        remedy: "the record exists with the stored value, so modify it with a value of at most `column_limit` characters (when `confirmed` is false that length is only known to fit); do not add it again, which would make a second record. If the record is active, set `active` to false until it is corrected",
        showInRule: true,
        warning: true,
    },
    {
        code: 'FIELD_NOT_STORED',
        meaning: "A WARNING on a write that succeeded, not an error: a field the tool sent is not shown as set in the platform's response (for `snow_scr_business_rule_add`: `filter_condition` or `advanced`), or, for the ATF authoring tools, in the record read back after the write — a step input that no row attaches to the step included. The record exists without it — a Business Rule without its filter runs on every matching operation. It arrives as `warnings[].code` on the tool's result.",
        remedy: "read the record back; if the field is not set, set it with a modify rather than adding the record again, and if the record is active set `active` to false first. If it is set, the response did not echo it: the column names are not documented in the bundled corpus, so check them on the instance",
        showInRule: true,
        warning: true,
    },
    {
        code: 'VALUE_TOO_LONG',
        meaning: "A write refused BEFORE it was sent (ARC-09-C97): a string is longer than its column's `max_length`, read fresh from `sys_dictionary` for this write — on the table that defines the column, which for an inherited one is a table it extends. Nothing was written by this write. Lengths are counted in code points, as VALUE_TRUNCATED counts them. When the same call wrote other records first, the error lists them (`details.written`).",
        remedy: "shorten the value to at most the stated length and send the write again; records the call already wrote (named in the error) exist, so do not add them again",
        showInRule: false,
    },
    {
        code: 'VALUE_NOT_AS_SENT',
        meaning: "A WARNING on a write that succeeded, not an error: a field the tool sent reads back with a different value — neither missing nor a cut prefix — once line endings are normalised (the ATF authoring tools, ARC-09-C95). It names the field, the first differing offset and both lengths, never the values. Also raised when more than one row holds a step input that should be held once.",
        remedy: "the record exists with the stored value: read it back and, if that value is wrong, correct it with a modify — do not add it again, which would make a second record",
        showInRule: true,
        warning: true,
        ruleLineWith: 'VALUE_TRUNCATED',
    },
    {
        // ARC-11-C1. Not in the always-loaded rule file: the refusal's own message names the state and
        // carries this remedy, and a code most sessions never meet is a line every session would load.
        code: 'LICENCE_NOT_VALID',
        meaning: "This checkout's licence does not cover the call: it is missing, invalid, expired or revoked, or it is a design-only licence and the server is live. Every tool is refused, the instance-free ones included, on every build.",
        remedy: "Run <cli> licence check to see why, then install a valid licence as .local/licence.json. A running Claude Code session keeps what it read at start, so restart it afterwards",
        command: "<cli> licence check",
        showInRule: false,
    },
    {
        // ARC-11-C141. Not in the always-loaded rule file, as LICENCE_NOT_VALID is not: the refusal's own message is the
        // `Integrity: cannot restore — …` line, which names the reason and carries the remedy.
        code: 'INTEGRITY_NOT_VERIFIED',
        meaning: "This checkout's own files are not the signed release's, and they could not be restored: no signed manifest is held, it does not verify, it is another release's, there is no tag to restore from, or the restore failed. Every tool is refused, as for a refused licence. A change the product could restore was restored, and is not this.",
        remedy: "Run <cli> doctor: its Integrity line names the reason. <cli> licence check --refresh fetches a missing manifest; a checkout that cannot be restored is reinstalled from a signed release tag. A running Claude Code session keeps what its server read at start, so restart it afterwards",
        command: "<cli> doctor",
        showInRule: false,
    },
];
export const ERROR_CODE_NAMES = new Set(ERROR_CODES.map((e) => e.code));
const fillLaunchers = (text, spell) => (spell ? text.replaceAll('<cli>', spell.cli).replaceAll('<bootstrap>', spell.bootstrap) : text);
export function remedyFor(code, spell) {
    const entry = ERROR_CODES.find((e) => e.code === code);
    if (!entry)
        return entry;
    // `'command' in entry` rather than `entry.command`: the table is a `const` union and not every
    // member HAS a command, so the property access does not type-check. The `in` narrowing is the
    // compiler telling me the shape honestly rather than a cast hiding it.
    const command = 'command' in entry && typeof entry.command === 'string'
        ? { command: fillLaunchers(entry.command, spell) }
        : {};
    return { ...entry, remedy: fillLaunchers(entry.remedy, spell), ...command };
}
