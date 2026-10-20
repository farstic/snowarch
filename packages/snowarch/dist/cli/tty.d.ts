/** The two streams every function takes, so a test never needs a terminal. */
export interface Io {
    stdin: NodeJS.ReadStream;
    stdout: NodeJS.WriteStream;
}
/** Injected so a test can assert the code without ending its own process. */
export type ExitFn = (code: number) => never;
export declare const EXIT_USAGE = 2;
export declare const EXIT_INTERRUPTED = 130;
export declare const CANCELLED = "Cancelled \u2014 nothing saved.";
/** The argv rule's sentence. Exported so the CLI and its test cannot paraphrase it. */
export declare const ARGV_SECRET: string;
/**
 * The refusal a sentence with a REQUIRED spelling shares — ARC-07-C31 slice 3, and a control is why.
 *
 * TypeScript makes a required parameter unomittable, so the compiler already stops a caller forgetting
 * one. What it does NOT stop is somebody later relaxing the parameter to `cli = cliSpelling()`, which
 * is backwards-compatible, breaks nothing, and quietly lets the process answer for a caller that knew
 * better. Measured: adding exactly that default to `NO_INSTANCE_MESSAGE` left the whole package suite
 * green — the control was INERT, which is how this function came to exist.
 *
 * With the guard, one case can call each of these with no spelling and require a named throw, so the
 * relaxation fails a test rather than passing review. It is the engine's `needSpell`, in the language
 * that needed a different reason for it.
 */
export declare const needCli: (cli: string | undefined, who: string) => string;
export declare const cliSpelling: (platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv) => string;
/**
 * The bootstrap's spelling — ARC-07-W11, needed because the resume line offers it as the fuller
 * answer. One predicate with `cliSpelling`, so the two cannot disagree about which shell this is.
 */
export declare const bootstrapSpelling: (platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv) => string;
export declare function noTtyMessage(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string;
/**
 * Windows console combinations where raw mode is known NOT to work.
 *
 * EMPTY, and that is a statement about evidence rather than about Windows: S-04 (the 8-cell
 * matrix — Windows Terminal and conhost × PowerShell 5.1 and cmd × with and without Git Bash)
 * has not been run, because it needs a Windows machine with a human at it. It is a row in
 * `docs/spikes/OWNER-SITTING.md`.
 *
 * When a cell comes back FAILED, it is one entry here: the module then prints the
 * `--password-stdin` fallback for that combination instead of attempting raw mode and hanging.
 * The branch below is wired and tested against a planted entry, so the day the spike returns,
 * the change is data and not code.
 */
export interface KnownBad {
    /** What the spike recorded, for the message and for whoever reads this next. */
    readonly id: string;
    /** True when the current console is that combination. */
    readonly matches: (env: NodeJS.ProcessEnv) => boolean;
}
export declare const WINDOWS_KNOWN_BAD: readonly KnownBad[];
/** The recorded combination this console is, or null. Windows only, by construction. */
export declare function knownBadConsole(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, table?: readonly KnownBad[]): KnownBad | null;
/**
 * Read one secret, echoing nothing.
 *
 * Byte by byte, because a paste arrives as ONE chunk: a reader that treated a chunk as a line
 * would submit a pasted password that had no newline, and would swallow the newline of one that
 * did. Every byte goes through the same table either way.
 */
export declare function promptSecret(text: string, { io, exit, env, platform, passwordStdin, knownBad, }?: Partial<{
    io: Io;
    exit: ExitFn;
    env: NodeJS.ProcessEnv;
    platform: NodeJS.Platform;
    passwordStdin: boolean;
    knownBad: readonly KnownBad[];
}>): Promise<string>;
/** What a prompt says when stdin ran out before it was answered. */
export declare const INPUT_ENDED = "no more input \u2014 nothing answered:";
/**
 * A visible line, with an optional default and a validator that repeats the prompt.
 *
 * Read through ONE interface's async iterator rather than repeated `rl.question()` calls.
 * `readline` closes the moment its input stream ends, so on a PIPED stdin — which is every
 * non-interactive caller, and every test — the second `question()` rejects with the internal
 * `readline was closed`, even when the answer it wanted was sitting in the buffer. A validator
 * loop is exactly the case that asks twice, so that failure would have shown up the first time
 * anybody typed something invalid into a piped run.
 *
 * When the input really has ended, the error names the prompt that went unanswered instead.
 */
export declare function promptLine(text: string, { io, fallback, validate, }?: Partial<{
    io: Io;
    fallback: string;
    validate: (value: string) => string | null;
}>): Promise<string>;
export interface Choice {
    key: string;
    text: string;
}
/**
 * A numbered list, in one of two modes.
 *
 * WITH a default (`fallback`, or the first choice), Enter accepts it — the common path costs one
 * keystroke. WITH `required: true` there is NO default and Enter repeats the question, which is
 * what ARC-07-S02's environment question needs: `pdi` is right often enough to be a tempting
 * default and wrong in exactly the case that matters, because the environment decides which
 * preset a write is checked against. A second prompt function would be a second set of key
 * handling; this is one flag.
 */
export declare function promptChoice(text: string, choices: readonly Choice[], { io, fallback, required, }?: Partial<{
    io: Io;
    fallback: string;
    required: boolean;
}>): Promise<string>;
/**
 * Everything on stdin, as lines — `--password-stdin`.
 *
 * Line 1 is the password; line 2 is the client secret, and only `--auth oauth_ropc` reads it.
 * A trailing `\r` is stripped PER LINE, because a Windows pipe delivers CRLF and a password
 * with an invisible carriage return at the end fails authentication with no way to see why.
 */
export declare function readSecretFromStdin({ io, }?: Partial<{
    io: Io;
}>): Promise<string[]>;
/**
 * The argv scan, as a function so `cli/index.ts` and its test share one definition.
 *
 * `--password=x` and `--password x` both match, and so does `--client-secret` and `--secret`.
 * The VALUE is never echoed, quoted or included in the return: this function answers "was a
 * secret flag present", and the caller prints a fixed sentence.
 */
export declare function argvCarriesSecret(argv: readonly string[]): boolean;
