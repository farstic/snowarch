/**
 * Exported for the tests, and called once below.
 *
 * Silent by design: an empty variable is not a user error, it is the expected shape of an
 * unset one after `${VAR:-}` expansion, and criterion 5 requires no warning. Returns the names
 * it cleared so a diagnostic can report them without re-deriving the list.
 */
export declare function sanitiseProxyEnv(env?: NodeJS.ProcessEnv): string[];
