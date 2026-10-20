// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * Delete proxy and CA variables that are set to the empty string.
 *
 * This module has no exports and does its work as a side effect at import time, and both
 * entry points import it FIRST. That is deliberate and it is the only thing that makes it
 * work: `EnvHttpProxyAgent` reads the environment when it is CONSTRUCTED, and ESM evaluates
 * every import before the importing module's body — so a sanitising call in `main()` would run
 * after the agent had already been built from the unsanitised environment. The same ordering
 * rule bit ARC-04-S02 with `dotenv`, and the fix there was the same shape.
 *
 * Why an empty string needs deleting at all: ARC-06 forwards these through `.mcp.json` as
 * `${HTTPS_PROXY:-}`, which expands to an EMPTY STRING when the variable is unset in the
 * launching shell rather than omitting the entry. Undici treats `HTTPS_PROXY=""` as a proxy URL
 * and fails to parse it, so a laptop with no proxy at all would stop being able to reach
 * ServiceNow the moment the forwarding was added — a failure caused entirely by the mechanism
 * meant to help. `NODE_EXTRA_CA_CERTS=""` is ignored by Node itself, but is cleared here too so
 * that a diagnostic reading `process.env` reports "unset" rather than "set to nothing".
 *
 * S-20 is CONFIRMED on macOS (`03` §F): the shell environment reaches the spawned server
 * without any `.mcp.json` entry, so on macOS the forwarding is belt-and-braces. Windows is
 * pending, ARC-06 keeps the `${VAR:-}` hedge, and this sanitisation is what makes the hedge
 * safe rather than harmful.
 */
const PROXY_AND_CA_VARS = [
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS',
    'http_proxy', 'https_proxy', 'no_proxy',
];
/**
 * Exported for the tests, and called once below.
 *
 * Silent by design: an empty variable is not a user error, it is the expected shape of an
 * unset one after `${VAR:-}` expansion, and criterion 5 requires no warning. Returns the names
 * it cleared so a diagnostic can report them without re-deriving the list.
 */
export function sanitiseProxyEnv(env = process.env) {
    const cleared = [];
    for (const name of PROXY_AND_CA_VARS) {
        // Exactly the empty string. A value of `" "` is a real (if broken) setting and is left
        // alone, so the resulting parse error names the variable the user actually set.
        if (env[name] === '') {
            delete env[name];
            cleared.push(name);
        }
    }
    return cleared;
}
sanitiseProxyEnv();
