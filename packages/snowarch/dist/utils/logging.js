const LEVEL_ORDER = { error: 0, warn: 1, info: 2, debug: 3 };
/**
 * A level pinned for one call, ahead of the environment — ARC-07-C44.
 *
 * The doctor's probe runs the ordinary query path, which logs `Querying ServiceNow table: …` at
 * INFO, so a `doctor` run printed seven of those lines into the operator's terminal and B08 printed
 * them again during verify. The report is the doctor's output; the query log is not.
 *
 * NOT `process.env.SNOW_LOG_LEVEL = 'error'` around the call, which is how it would have to be done
 * without this: the doctor calls the probe IN-PROCESS, so that would mutate the environment of
 * whatever is hosting it and would have to be restored in a `finally` that a throw between the two
 * could still skip. An override this module owns cannot leak into anyone else's environment.
 *
 * The level itself is the one `doctor/checks.ts` already pins for the handshake child it spawns, so
 * a quiet probe and a quiet handshake are one decision spelled once rather than two.
 */
let override = null;
export async function withLogLevel(level, fn) {
    const previous = override;
    override = level;
    try {
        return await fn();
    }
    finally {
        override = previous;
    }
}
function activeLevel() {
    if (override)
        return LEVEL_ORDER[override];
    const lvl = (process.env.SNOW_LOG_LEVEL || process.env.LOG_LEVEL || 'info').toLowerCase();
    return LEVEL_ORDER[lvl] ?? LEVEL_ORDER.info;
}
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|api[_-]?key|client[_-]?secret|credential|cookie/i;
/**
 * A credential-shaped string, wherever it appears.
 *
 * Scrubbing by KEY alone missed the case that matters most: `{ headers: { Authorization:
 * 'Basic <base64>' } }` is caught by the key, but the same string reached the log unscrubbed
 * whenever it arrived under an innocent key — inside an array, an error's `config`, a nested
 * request dump. The value is recognisable on its own, so it is matched on its own.
 */
const CREDENTIAL_VALUE = /^(Basic|Bearer)\s+\S+/i;
function redactValue(value, depth = 0) {
    if (value === null || value === undefined)
        return value;
    if (value instanceof Error)
        return value; // keep message/stack intact
    if (depth > 6)
        return value;
    if (Array.isArray(value))
        return value.map((v) => redactValue(v, depth + 1));
    if (typeof value === 'string')
        return CREDENTIAL_VALUE.test(value) ? '***' : value;
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = SENSITIVE_KEY.test(k) ? '***' : redactValue(v, depth + 1);
        }
        return out;
    }
    return value;
}
function scrub(data) {
    // On unless explicitly turned off. `!== 'false'` rather than `=== 'true'`: the previous form
    // meant an unset variable — the normal case — printed credentials.
    return process.env.REDACT_SENSITIVE_DATA !== 'false' ? redactValue(data) : data;
}
function emit(level, tag, message, data) {
    if (LEVEL_ORDER[level] > activeLevel())
        return;
    if (data === undefined || data === '') {
        console.error(`[${tag}] ${message}`);
    }
    else {
        console.error(`[${tag}] ${message}`, scrub(data));
    }
}
export const logger = {
    debug(message, data) { emit('debug', 'DEBUG', message, data); },
    info(message, data) { emit('info', 'INFO', message, data); },
    warn(message, data) { emit('warn', 'WARN', message, data); },
    error(message, error) { emit('error', 'ERROR', message, error); },
};
