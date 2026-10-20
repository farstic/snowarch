/**
 * ARC-08-C22 — the sub-command tables, and the one function that lays them out.
 *
 * A DEPENDENCY-FREE MODULE, and that is the whole reason it exists rather than a tidiness
 * argument. `./snowarch instance --help` used to list one sub-command of nine, because the frame
 * in `tools/snowarch/lib/instance.mjs` keeps its own text: the frame runs in design-only, where
 * `node_modules` is absent, and `cli/instance-command.js` reaches `zod` and `undici` through its
 * import graph. So the lines are generated into the frame by `scripts/gen-cli-help.mjs` — and that
 * generator has to run on a clone with no dependencies too, which `tests/gen-all.test.mjs` asserts.
 *
 * This file imports nothing. Both dispatchers read their table from here, both help texts lay it
 * out with the same function, and the generator reads the same two tables — one definition, four
 * readers, and none of them can drag a dependency into a place that has none.
 */
/** How many positional arguments each `instance` sub-command takes after its name. */
export declare const SUB_COMMANDS: {
    readonly list: {
        readonly positionals: 0;
        readonly summary: "the instances this checkout can reach, and their last probe";
    };
    readonly test: {
        readonly positionals: 1;
        readonly summary: "re-probe one instance (or --all --json); writes only lastProbe";
    };
    readonly 'set-credentials': {
        readonly positionals: 1;
        readonly summary: "new username/password; saved only if the instance says ok";
    };
    readonly 'set-preset': {
        readonly positionals: 2;
        readonly summary: "change the preset (production needs --ack-prod)";
    };
    readonly 'set-flags': {
        readonly positionals: -1;
        readonly summary: "change individual flags: WRITE=on CMDB_WRITE=off …";
    };
    readonly 'set-default': {
        readonly positionals: 1;
        readonly summary: "which instance the server starts with";
    };
    readonly remove: {
        readonly positionals: 1;
        readonly summary: "delete an instance and its stored credentials";
    };
    readonly import: {
        readonly positionals: 0;
        readonly summary: "migrate a snow-mcp 1.x store (--from-legacy), plan first";
    };
};
export type SubCommand = keyof typeof SUB_COMMANDS;
/**
 * `add` is not in the table above because the dispatcher does not route it — the wizard runs
 * before the switch, and its argument shape is its own. It is still a sub-command a reader needs
 * to see, so it is named here, next to the others, rather than in the renderer.
 */
export declare const INSTANCE_WIZARD_LINE: Readonly<{
    usage: "add <label>";
    summary: "add an instance (the wizard)";
}>;
/**
 * The `store` sub-commands. They were written three times — in `storeHelp()`, in `runStore`'s
 * `switch`, and in the "unknown command" message that lists them back to a user who typed
 * something else. `usage` carries the arguments, which a help line has to show and a dispatcher
 * does not know.
 */
export declare const STORE_SUB_COMMANDS: {
    readonly migrate: {
        readonly usage: "migrate [--dry-run] [--yes]";
        readonly summary: "bring the store up to the schema this build reads";
    };
    readonly backups: {
        readonly usage: "backups";
        readonly summary: "the backups beside the store, newest first";
    };
    readonly restore: {
        readonly usage: "restore <file> [--yes]";
        readonly summary: "put one of them back";
    };
};
export type StoreSubCommand = keyof typeof STORE_SUB_COMMANDS;
/** `migrate, backups or restore` — for the message a user who typed something else reads. */
export declare const storeSubCommandList: () => string;
/**
 * The padded `  <usage>  <summary>` lines, laid out once for both commands.
 *
 * `gap` differs between the two only because their existing output does, and this row is not the
 * place to change how either looks: a help text that moved a column would make every reviewer
 * check whether anything else had moved with it.
 */
export declare function subCommandLines(entries: ReadonlyArray<{
    usage: string;
    summary: string;
}>, gap?: number): string[];
/** The `instance` sub-command lines: the wizard first, then everything the dispatcher routes. */
export declare const instanceSubCommandLines: () => string[];
/** The `store` sub-command lines. */
export declare const storeSubCommandLines: () => string[];
