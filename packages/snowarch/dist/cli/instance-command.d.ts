import { SUB_COMMANDS, type SubCommand } from './help-tables.js';
import { type AddIo, type ManageOptions } from './instance.js';
export { SUB_COMMANDS };
export type { SubCommand };
/** The real terminal, wired to S01's prompts. Tests pass their own. */
export declare const terminalIo: () => AddIo;
/** The label the prompt proposes. ADR-0005: propose, do not impose — Enter accepts, typing wins. */
export declare const DEFAULT_LABEL = "pdi";
/**
 * The label prompt — ARC-07-W9, after five matchers were bound to its old text.
 *
 * It read `Label for this instance [pdi]: ` until the step header started saying what a label is, and
 * **five assertions in `b06-wizard-argv.test.mjs` matched that sentence**. They read the built `dist`,
 * not `src`, so `tests/cli` could not see them and my push would have gone red on nine cells — the
 * fifth matcher-bound-to-text this programme has met, and the first where the bound matchers were
 * tests rather than a guard. Exported so a case can state the prompt instead of quoting it.
 */
export declare const LABEL_PROMPT = "Label [pdi]: ";
/** `instance --help` — every sub-command, then the exit table. ARC-06-S08's B08 reads this. */
export declare function instanceHelp(): string;
/**
 * The options for one maintenance sub-command, or the sentence that says what was not understood.
 *
 * Secrets are refused HERE, before any sub-command sees an argument list: `--password` on a
 * command line reaches `ps` for every user on the machine, and the refusal has to be earlier than
 * anything that might echo it back.
 */
export declare function parseManageArgs(sub: SubCommand, argv: readonly string[]): {
    ok: true;
    options: ManageOptions;
} | {
    ok: false;
    message: string;
};
export declare function runInstance(argv: readonly string[], io?: AddIo): Promise<number>;
