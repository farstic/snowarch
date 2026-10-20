import { EXIT_INTERRUPTED, EXIT_USAGE, type Io } from './tty.js';
export { EXIT_USAGE, EXIT_INTERRUPTED };
import { type Environment } from './url.js';
import { type ReviewIo } from './preset-ui.js';
import { type StoreLabel } from './format.js';
import { maskUsername } from '../store/paths.js';
import { probeReachability } from '../servicenow/reachability.js';
import { probeAll, type LastProbe, type ProbeClient } from '../servicenow/probes.js';
import { type StoreInstance } from '../store/schema.js';
import { type FlagName, type Flags } from '../utils/permissions.js';
export declare const EXIT_OK = 0;
export declare const EXIT_FAILED = 1;
export declare const EXIT_POLICY = 3;
/**
 * What each code means when THIS command produces it. One table, printed by `--help`, so the
 * help and the behaviour cannot describe different programs.
 */
export declare const EXIT_CODES: ReadonlyArray<{
    code: number;
    meaning: string;
}>;
export declare const MAX_ATTEMPTS = 3;
export declare const LABEL_RULE: RegExp;
/**
 * The label rule IN WORDS, once — ARC-07-W9.
 *
 * It was spelled twice, identically: in `parseAddArgs`' refusal and in `LABEL_EXHAUSTED`. W9's brief
 * would have added a THIRD copy to the step header, and an incomplete one — "(lower case, a-z 0-9 _
 * -)", missing *starting with a letter* and the 32-character cap. A partial rule offered up front is
 * worse than none: it is the answer ARC-07-C10 was about, where the owner typed `testPDI` and met a
 * refusal for something the prompt had not told them. So the header says what a label IS and the
 * COMPLETE rule arrives from here, at the two moments it is needed.
 */
export declare const LABEL_RULE_WORDS = "lower case, starting with a letter, up to 32 characters of a-z 0-9 _ -";
export declare const NOTHING_SAVED = "Nothing saved.";
/**
 * The duplicate-label refusal, rendered FROM the registry.
 *
 * `LABEL_EXISTS` shipped as a bare literal: a code with no registry entry, so `docs/TROUBLESHOOTING.md`
 * documented every other failure of this command and not this one, and the remedy lived only here.
 * The registry is the single source; only the label, which no registry entry can hold, is added.
 */
export declare const labelExists: (label: string) => string;
/**
 * The 401 re-entry question, with its REASON rendered from the registry.
 *
 * It used to say "wrong username or password" — narrower than the registry's "wrong, expired, or
 * the account is locked", and a second definition of one condition, which is the thing the registry
 * exists to prevent. A tester who read the wizard learned one set of causes and a tester who read
 * `docs/TROUBLESHOOTING.md` learned another, and the account-locked case — the one that matters
 * most, because retrying makes it worse — was only in the second. Ruled by the ARC-08-S10 review;
 * the pattern is `labelExists()`'s, three lines up.
 *
 * The question is the wizard's own: only the terminal is in a position to offer another attempt.
 */
/**
 * ARC-07-W10 — the question above the retry menu.
 *
 * It was `Re-enter? (attempt 2 of 3) [Y/n] ` — one question with two answers where there are three
 * things a user might want, and `[Y/n]` left what the default DID unwritten, as the cloud-sync gate's
 * did before ARC-07-W6.
 *
 * THE REASON IS UNCHANGED, and deliberately: ARC-08-S10 ruled it must be the REGISTRY's sentence
 * rather than a second, narrower one written here, and a case forbids the old narrower wording by
 * name. W10's brief proposed *"the instance rejected the credentials (wrong, expired, or locked)"* —
 * which is exactly that second sentence — so the brief is not followed on this point.
 */
export declare const authFailedRetry: (attempt: number) => string;
/**
 * What a user might want after a rejected login — ARC-07-W10.
 *
 * Three things, and `[Y/n]` could express two of them: re-enter the password for the SAME account
 * (the common case, and Enter picks it), change the account, or stop. `Y` used to mean the first and
 * then ask for the username from blank anyway.
 */
/**
 * The command that resumes this wizard — ARC-07-W11.
 *
 * The exhaustion lines said *"run the command again"* without saying which, and B06's exit-1 remedy
 * named `instance add <label>` itself, so the advice had two authors and one was guessing.
 *
 * IT EMITS WHAT IT HAS AND INVENTS NOTHING, because what is known differs by site: at the URL
 * exhaustion the environment, the auth method and the username have not been asked yet, while at the
 * login exhaustion all of them have. A `--url` printed for a URL nobody accepted would be worse than
 * no flag at all.
 *
 * THERE IS NO SECRET PARAMETER, and that is the design rather than a discipline: this signature cannot
 * carry a password, so no caller can leak one through it. P-34 — argv is forever — and a resume line
 * is the most likely thing in this wizard to be pasted into a ticket.
 */
export declare function resumeCommand(known: {
    label?: string;
    url?: string;
    environment?: string;
    auth?: string;
    username?: string;
}, cli?: string): string;
/**
 * The two lines an exhausted wizard leaves behind.
 *
 * The bootstrap is offered as the FULLER answer with the reason stated: `instance add` alone skips
 * B07 (toggles) and B08 (verify) — the MCP registration and the stdio handshake — so a user who runs
 * only the wizard has an instance in the store and a server that may be unregistered and was never
 * verified. Measured, not inferred: those two steps do not run under `instance add`.
 */
export declare const resumeLines: (known: Parameters<typeof resumeCommand>[0], cli?: string, bootstrap?: string) => string;
export declare const AUTH_RETRY_CHOICES: ReadonlyArray<Option>;
/** The registry's sentence, used by the re-entry question and by the nothing-saved line. */
export declare const authFailedReason: () => string;
/**
 * The label prompt's exhausted line (ARC-07-C10), shaped like `AUTH_EXHAUSTED` because it is the
 * same event: an interactive answer the wizard asked for, refused, re-asked, and did not get.
 */
export declare const LABEL_EXHAUSTED: string;
export declare const AUTH_EXHAUSTED: string;
/**
 * The URL prompt's exhausted line (ARC-07-W2) — the third of the family, shaped like the other two.
 *
 * The family matters more than the sentence: all three are "the wizard asked, refused, re-asked and
 * did not get an answer", all three end the run at `EXIT_FAILED`, and `EXIT_CODES` already documents
 * that as *"nothing saved — a refusal, an abort, three failed attempts"*. So no new exit code and no
 * new constant for the count; the loop the prompt beside it already had.
 */
/**
 * ARC-07-W4 — ONE NUMBERED QUESTION, for every question that has a list of answers.
 *
 * THE PERMISSIONS SCREEN'S SEMANTICS, DELIBERATELY NOT ITS CODE. `resolveFlagAnswer` and the plan
 * screen's `resolveChoice` already settle this grammar — a number, or the value's own name, and Enter
 * accepts what is marked — and the plan screen's copy lives in the ENGINE, which this package must not
 * import and which must not import this. So the rule is re-stated here and the shape is asserted to
 * match, which is the same trade this repository already makes for the review screen.
 *
 * The option list prints ONCE. A wrong answer prints WHY and returns to the `> ` prompt; it does not
 * reprint the question, which is what made the environment question look frozen (ARC-07-W5).
 */
export interface Option {
    readonly key: string;
    readonly text: string;
    readonly aliases?: readonly string[];
}
/** `"production" is not one of [1] pdi  [2] dev  [3] test  [4] prod` */
export declare const notOneOf: (answer: string, options: readonly Option[]) => string;
/**
 * A number, the option's own name, one of its aliases, or Enter when something is marked default.
 *
 * `undefined` means "not one of them" — the same three-way answer `resolveFlagAnswer` gives, so a
 * caller cannot confuse "they chose nothing" with "they chose wrongly". A question with NO default
 * treats Enter as a wrong answer on purpose: `askEnvironment` has carried that decision in a comment
 * since it was written, because the environment decides which preset a write is checked against.
 */
export declare function resolveOption<T extends Option>(input: string | null, options: readonly T[], defaultKey?: string): T | undefined;
/**
 * ARC-07-W3 — the credential prompts, and what a non-answer is told.
 *
 * `Username: ` did not say WHOSE account — the instance's, or this machine's — and an empty answer
 * ended the run. Worse, an empty answer was the prompt's ONLY exit, so abandoning the wizard and
 * pressing Enter by mistake were the same gesture and neither could be told from the other.
 *
 * `q` IS THE USERNAME'S EXIT AND NOT THE PASSWORD'S. A password may legitimately BE `q`, and the
 * prompt is invisible: a user whose password is `q` would be told nothing was saved with no way to
 * see why. So the password names Ctrl-C, which `promptSecret` already handles by ending the process.
 */
export declare const USERNAME_PROMPT = "Username (a ServiceNow user on this instance \u2014 admin on a PDI): ";
export declare const USERNAME_REQUIRED = "Username is required \u2014 type the account name, or q to abandon the wizard (nothing is saved)";
export declare const CLIENT_ID_PROMPT = "Client ID: ";
export declare const CLIENT_ID_REQUIRED = "Client ID is required for OAuth \u2014 type it, or q to abandon the wizard (nothing is saved)";
export declare const PASSWORD_PROMPT = "Password (nothing is shown while you type):";
export declare const PASSWORD_REQUIRED = "Password is required \u2014 type it, or press Ctrl-C to abandon the wizard (nothing is saved)";
/**
 * ARC-07-W2 — the prompt SAYS THE SHAPE, so the first answer is likelier to be right.
 *
 * `Instance URL: ` named the thing and not the form of it, and the two commonest wrong answers are
 * a browser URL with a path and an `http://` one. Both are refused with a good message; neither
 * needed to happen.
 */
export declare const URL_PROMPT = "Instance URL (https://<host>, no path): ";
export declare const URL_EXHAUSTED: string;
/**
 * The reachability bound's exhausted line (ARC-07-W2, at the architect's request on W1).
 *
 * ARC-07-W1 bounded the probe loop at three rounds and ended it with the bare `Nothing saved.`, which
 * says what happened and not why it stopped. It REPLACES `NOTHING_SAVED` rather than preceding it,
 * because that is what the two siblings above do — the goal was that the exhaustion paths read alike,
 * and two consecutive lines both saying "nothing saved" would not. An explicit `[3] abort` still
 * prints `NOTHING_SAVED`: that is a decision, not an exhaustion.
 */
export declare const REACH_EXHAUSTED: string;
export declare const NEXT_LINE = "Next: in Claude Code run  /snowarch setup-instance --resume  (or restart claude).";
export declare const AUTH_QUESTION = "Authentication?";
/**
 * ARC-07-W5 — what each environment MEANS, in the words a first-time reader needs.
 *
 * `pdi` is undefined to somebody who has not met ServiceNow's developer programme, and the reason the
 * answer matters — production is saved read-only — surfaced at the permissions step, where it
 * reads as a surprise rather than as the consequence of a choice already made.
 *
 * TWO LISTS, HELD TOGETHER BY A TEST. `ENVIRONMENTS` decides what exists and this decides what each
 * one means; a test asserts they are the same keys in the same order, so a fifth environment cannot
 * arrive with no words or leave one behind.
 */
export declare const ENV_CHOICES: ReadonlyArray<Option>;
export declare const ENV_QUESTION = "What is this instance?";
/**
 * ARC-07-W6 — the cloud-sync gate as a numbered question, asked before anything is typed.
 *
 * `Continue and write the store here anyway? [y/N]` hid the consequence in a convention: `[y/N]`
 * tells a reader the default is No only if they already know that convention, and the thing the
 * default DOES — abandon the run — was written nowhere. Both options are named now, and the one Enter
 * picks says what it costs.
 */
export declare const CLOUD_SYNC_CHOICES: ReadonlyArray<Option>;
export declare const AUTH_CHOICES: ReadonlyArray<{
    key: 'basic' | 'oauth_ropc';
    text: string;
    aliases?: readonly string[];
}>;
export interface AddOptions {
    label?: string;
    url?: string;
    environment?: string;
    auth?: 'basic' | 'oauth_ropc';
    username?: string;
    preset?: string;
    flags?: string;
    makeDefault?: boolean;
    global?: boolean;
    passwordStdin?: boolean;
    noProbes?: boolean;
    json?: boolean;
    yes?: boolean;
    replace?: boolean;
    fromBootstrap?: boolean;
}
export interface AddIo extends ReviewIo {
    /** S01's masked prompt, injected so a test never needs a terminal. */
    secret: (label: string) => Promise<string>;
    io?: Io;
    /**
     * Is there a terminal to ask a question on? (ARC-07-C2)
     *
     * Injected rather than read from `process.stdin` at the point of use, for the reason every other
     * terminal fact in this file is injected: a test that had to own a TTY to exercise the prompt
     * path would not be run, and the path would go unexercised — which is exactly how the missing
     * label reached an owner's machine.
     */
    isTty?: boolean;
}
export interface AddResult {
    saved: boolean;
    exitCode: number;
    entry?: MaskedEntry;
    lastProbe?: LastProbe | null;
    message?: string;
    /** The cloud-sync WARN, when there was one — kept whether the run saved or declined. */
    warnings?: string[];
}
/** What a caller may see of a saved entry: never the password, never the client secret. */
export interface MaskedEntry {
    url: string;
    environment: Environment;
    preset: string;
    flags: Flags;
    auth: {
        method: 'basic' | 'oauth_ropc';
        username: string;
    };
    toolPackage: string;
    maxRecords: number;
    prodWriteAck: boolean;
}
/**
 * ARC-04-S02's masker, re-exported rather than reimplemented.
 *
 * S05 wrote a second one here that dropped the domain — `c***` where the store's own says
 * `c***@corp.com` — so `list` and the wizard's summary would have masked the same account two
 * ways. A username is not a secret, but the full account name in a pasted summary is one more
 * thing an attacker does not have to guess, and one masker is what makes that claim checkable.
 */
export { maskUsername };
export declare function maskEntry(entry: StoreInstance): MaskedEntry;
/**
 * The probe line of the summary: enabled flags report, disabled ones read `off`.
 *
 * ARC-07-C6 — the order and the names come from `PROBE_FIELDS` now, which `instance list`'s table
 * also reads. This function kept its own copy of the flag-to-field map, and the table kept a third
 * spelling; one definition is what stops a seventh capability from reaching one surface and not
 * the other.
 *
 * What stays here is the only thing that is this line's own: a DISABLED flag reads `off` instead of
 * its probe result, because the wizard is reporting the choice just made rather than the instance.
 */
export declare function probeSummary(probe: LastProbe | null, flags: Flags, noProbes: boolean): string;
export declare const savedLine: (label: string, entry: MaskedEntry, isDefault: boolean) => string;
/**
 * `Store: ~/checkout/.local/instances.json (mode 0600, dir 0700)`
 *
 * ARC-08-C23 — MASKED, like every other path this CLI prints. It was the one that was not:
 * `precedenceNote` in `format.ts` sends its two store paths through `maskPath`, `listJson` masks
 * the store it reports, the audit writer masks the file it could not open — and this line, the one
 * in the block a user pastes when an install goes wrong, printed the absolute path with the
 * account name in it. One surface, two redaction levels, and the leakier one was on the line most
 * likely to be quoted.
 */
export declare const storeLine: (path: string, platform: NodeJS.Platform | undefined, project: string) => string;
/**
 * Why the authentication step did not ask. Named from what was actually observed, never a default sentence.
 *
 * `--auth` and `--yes` are two different reasons a question goes unasked, and a reader deciding
 * whether the answer is theirs needs to know which: one is what they typed, the other is what the
 * flag chose for them.
 */
/**
 * THE WIZARD'S STEPS, in the order they are asked — ARC-07-W9.
 *
 * `[1/6] Instance URL` … `[6/6] Permissions` were seven printed literals with the number and the
 * TOTAL spelled in each, plus eleven more in section banners and prose. Adding one step meant editing
 * every one of them and twenty assertions besides, and the programme has now paid three times for
 * exactly that shape: a page advertising a verb the tool had stopped printing (ARC-07-C22), 88
 * hand-spelled launcher names (ARC-07-C1), and a plan header nothing held to its source.
 *
 * So the number is the INDEX and the total is the LENGTH. Inserting a step is an edit to this list,
 * and every header, the total, and ARC-08-C23's skipped-step line follow from it.
 *
 * WHAT A DERIVED ASSERTION CANNOT SEE IS ORDER: `stepHeader('auth')` agrees with itself whatever
 * position `auth` holds. One literal snapshot of the whole sequence is kept for that, and it is the
 * only place the numbers are written down.
 */
export declare const STEPS: readonly [{
    readonly id: "label";
    readonly title: "Label";
}, {
    readonly id: "url";
    readonly title: "Instance URL";
}, {
    readonly id: "environment";
    readonly title: "Environment";
}, {
    readonly id: "auth";
    readonly title: "Authentication";
}, {
    readonly id: "credentials";
    readonly title: "Credentials";
}, {
    readonly id: "login";
    readonly title: "Checking the login and what this account may do (read-only, a few seconds) …";
}, {
    readonly id: "permissions";
    readonly title: "Permissions";
}];
export type StepId = typeof STEPS[number]['id'];
/**
 * `Environment`, and `Authentication … basic (from --auth)` when a suffix is given.
 *
 * It THROWS on an unknown id rather than rendering a header numbered zero: a typo'd step is a programming error, and
 * a header numbered zero is the kind of output that reaches a user before anyone notices.
 */
export declare function stepHeader(id: StepId, suffix?: string): string;
export declare const skipReason: (options: {
    auth?: string;
    yes?: boolean;
}) => string;
/** Parse and validate; every refusal here is exit 2 and happens before anything is asked. */
export declare function parseAddArgs(argv: readonly string[]): {
    ok: true;
    options: AddOptions;
} | {
    ok: false;
    message: string;
    needsLabel?: true;
};
export interface AddDeps {
    storePath?: string;
    makeClient?: (entry: {
        url: string;
        auth: StoreInstance['auth'];
    }) => ProbeClient;
    probe?: typeof probeAll;
    reachability?: typeof probeReachability;
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
}
/**
 * The probe client and its options live in `servicenow/probe-client.ts` (ARC-08-S04): the doctor
 * needs both, and it must not import a CLI to ask a question about credentials. Re-exported here
 * because `import --from-legacy` already names this module for them.
 */
export { probeOptionsFor } from '../servicenow/probe-client.js';
/**
 * The cloud-sync warning, and the question that follows it (D-04, ARC-07-S07).
 *
 * 0600 is a LOCAL permission: the sync client runs as the same user, so the mode does not stop the
 * file leaving the machine. This is a WARNING and a question rather than a refusal — where somebody
 * keeps their code is theirs to decide — but the default is NO, because the cost of being wrong is
 * a credential store on somebody else's servers and the cost of asking again is one command.
 *
 * The text is the REGISTRY's, filled with the provider and the folder; there is no second copy of
 * this sentence anywhere. When the global store is itself synced, the alternative is dropped: the
 * remedy's parenthetical would otherwise offer a place that has the same problem.
 */
export declare function cloudSyncGate(storePath: string, options: {
    yes?: boolean;
    global?: boolean;
}, io: AddIo, env?: NodeJS.ProcessEnv): Promise<{
    ok: boolean;
    warning?: string;
}>;
/**
 * The whole command. Seven steps, and every one of them can end it.
 */
export declare function runAdd(options: AddOptions, terminal: AddIo, deps?: AddDeps): Promise<AddResult>;
/**
 * The programmatic entry ARC-06-S07's `--instance-file` path can call.
 *
 * Everything is supplied, nothing is asked: `yes: true` is implied, and the `io` is whatever the
 * caller wants the lines written to. The return carries a MASKED entry — a caller that wanted the
 * password already had it.
 */
export declare function addInstance(opts: Omit<AddOptions, 'auth' | 'username'> & {
    auth: StoreInstance['auth'];
}, io: AddIo, deps?: AddDeps): Promise<AddResult>;
/** `--help`, from the same table the behaviour uses. */
export declare function addHelp(): string;
/** Exported for the forwarder's precondition test — the CLI path the engine spawns. */
export declare const CLI_RELATIVE = "packages/snowarch/dist/cli/index.js";
/** True when the server's runtime dependencies are installed beside the built CLI. */
export declare const serverDepsInstalled: (packageDir: string) => boolean;
/** `LABEL_NOT_FOUND` — registered, so `docs/TROUBLESHOOTING.md` carries its remedy. */
export declare const labelNotFound: (label: string, known: readonly string[]) => string;
export declare const MISMATCH = "Label mismatch \u2014 nothing changed.";
export declare const prodRaiseWarning: () => string;
export declare const CONFIRM_PROMPT = "Type the instance label to confirm: ";
export declare const credentialsUpdated: (label: string) => string;
export declare const removeQuestion: (label: string, storePath: string) => string;
export declare const WAS_DEFAULT: (label: string) => string;
/**
 * The `set-default` sentence, with the reload tool named from the CONTRACT's own list.
 *
 * A retyped tool token is what L01 exists to catch: the name appears in the contract, in
 * `governance/`, in the rule file and here, and four spellings of it is three chances to be
 * wrong on the day a name changes.
 */
export declare const defaultChanged: (label: string) => string;
export interface ManageOptions {
    label?: string;
    json?: boolean;
    all?: boolean;
    global?: boolean;
    verbose?: boolean;
    yes?: boolean;
    ackProd?: boolean;
    confirmLabel?: string;
    auth?: 'basic' | 'oauth_ropc';
    username?: string;
    passwordStdin?: boolean;
    preset?: string;
    pairs?: readonly string[];
    /** ARC-07-S08's `import --from-legacy`. */
    fromLegacy?: boolean;
    dryRun?: boolean;
    path?: string;
    only?: string[];
}
export interface ManageDeps extends AddDeps {
    /** The clock, injected so an audit line and a `lastProbe` are assertable to the character. */
    now?: () => string;
    /** `.local/config.json`, so the mirror can be pointed somewhere else in a test. */
    configPath?: string;
}
/**
 * The store as the SERVER would resolve it, or the sentence saying why not.
 *
 * `resolveStorePath()` answering "none" is not an error here the way it is for the server: it
 * means this checkout has no instances yet, and `list` on such a checkout prints a line and exits
 * 0. What is NOT allowed is inventing a path: a maintenance command that created a store would
 * make `set-default` on a typo produce a second, empty configuration.
 */
/**
 * WHICH FILE this command acts on, and what selected it. One resolution, shared.
 *
 * The path AND the source: `list --all` needs the second half to say which store the server reads,
 * and computing the two separately is how they came apart — a run under `SNOW_STORE` once listed
 * the global store and left out the file in use. `import` (ARC-07-S08) asks the same question, so
 * it asks this function rather than repeating the precedence.
 *
 * An injected path is named by WHERE IT POINTS, not by the fact that it was injected: the same
 * file is the project store whether the resolver found it or a caller handed it over, and calling
 * it an override would put the wrong word in the STORE column.
 */
export declare function targetStore(deps: {
    storePath?: string;
}, options?: {
    global?: boolean;
}): {
    path: string;
    source: StoreLabel;
};
export declare function runList(options: ManageOptions, io: AddIo, deps?: ManageDeps): number;
/**
 * Re-probe one instance or all of them. `lastProbe` is the only field this writes, ever.
 *
 * In `--json` the human lines are suppressed rather than interleaved: ARC-06-S08 parses this
 * command's stdout, and a network note printed above the object turns a probe result into
 * `unparsable`.
 */
export declare function runTest(options: ManageOptions, io: AddIo, deps?: ManageDeps): Promise<number>;
/**
 * New credentials for an existing instance — saved only when the instance says `ok`.
 *
 * The re-entry loop is S05's, called through the same helper, so "three attempts, one request
 * each" is one rule in one place. A run that ends any other way leaves the OLD credentials
 * exactly where they were: an entry whose password has been replaced by a wrong one is worse
 * than an entry nobody touched, because the failure arrives later and somewhere else.
 */
export declare function runSetCredentials(options: ManageOptions, io: AddIo, deps?: ManageDeps): Promise<number>;
export declare function runSetPreset(options: ManageOptions, io: AddIo, deps?: ManageDeps): Promise<number>;
/**
 * `WRITE=on` → the flag's own name mapped to the string `true`, or the sentence naming what was
 * not understood. (Spelled that way round because writing the flag constant out here would make
 * this comment a hit in the sweep that forbids flag literals in `src/cli/` — the thirteenth time
 * that lesson has been learnt in this repository.)
 */
export declare function parseFlagPairs(pairs: readonly string[]): {
    ok: true;
    changes: Map<FlagName, 'true' | 'false'>;
} | {
    ok: false;
    message: string;
};
/**
 * A PARTIAL change to the six flags — the difference from `set-preset`, which replaces all of them.
 *
 * Each requested change goes through S04's own toggle, so the dependency conversation is the one
 * the review screen has rather than a second implementation of the same rule. A change that is
 * already the current value is skipped: toggling to the state something is already in would flip
 * it the wrong way and ask a question about a change nobody requested.
 */
export declare function runSetFlags(options: ManageOptions, io: AddIo, deps?: ManageDeps): Promise<number>;
/**
 * `.local/config.json`'s `defaultInstance`, refreshed — a MIRROR, never a second source.
 *
 * Only when the file already exists (ARC-06-S05's ruling: the bootstrap owns creating it), only
 * that one key, and every other key is left byte-for-byte as it was — including `updatedAt`, which
 * belongs to the bootstrap step that writes the rest. The server package does not import the
 * engine's `.mjs`, so this is the minimal JSON update rather than a call into B07's writer.
 */
export declare function mirrorDefault(configPath: string, label: string | null): boolean;
export declare function runSetDefault(options: ManageOptions, io: AddIo, deps?: ManageDeps): number;
export declare function runRemove(options: ManageOptions, io: AddIo, deps?: ManageDeps): Promise<number>;
