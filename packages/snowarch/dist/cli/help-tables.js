// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
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
export const SUB_COMMANDS = {
    list: { positionals: 0, summary: 'the instances this checkout can reach, and their last probe' },
    test: { positionals: 1, summary: 're-probe one instance (or --all --json); writes only lastProbe' },
    'set-credentials': { positionals: 1, summary: 'new username/password; saved only if the instance says ok' },
    'set-preset': { positionals: 2, summary: 'change the preset (production needs --ack-prod)' },
    'set-flags': { positionals: -1, summary: 'change individual flags: WRITE=on CMDB_WRITE=off …' },
    'set-default': { positionals: 1, summary: 'which instance the server starts with' },
    remove: { positionals: 1, summary: 'delete an instance and its stored credentials' },
    import: { positionals: 0, summary: 'migrate a snow-mcp 1.x store (--from-legacy), plan first' },
};
/**
 * `add` is not in the table above because the dispatcher does not route it — the wizard runs
 * before the switch, and its argument shape is its own. It is still a sub-command a reader needs
 * to see, so it is named here, next to the others, rather than in the renderer.
 */
export const INSTANCE_WIZARD_LINE = Object.freeze({
    usage: 'add <label>',
    summary: 'add an instance (the wizard)',
});
/**
 * The `store` sub-commands. They were written three times — in `storeHelp()`, in `runStore`'s
 * `switch`, and in the "unknown command" message that lists them back to a user who typed
 * something else. `usage` carries the arguments, which a help line has to show and a dispatcher
 * does not know.
 */
export const STORE_SUB_COMMANDS = {
    migrate: {
        usage: 'migrate [--dry-run] [--yes]',
        summary: 'bring the store up to the schema this build reads',
    },
    backups: { usage: 'backups', summary: 'the backups beside the store, newest first' },
    restore: { usage: 'restore <file> [--yes]', summary: 'put one of them back' },
};
/** `migrate, backups or restore` — for the message a user who typed something else reads. */
export const storeSubCommandList = () => {
    const names = Object.keys(STORE_SUB_COMMANDS);
    return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
};
/**
 * The padded `  <usage>  <summary>` lines, laid out once for both commands.
 *
 * `gap` differs between the two only because their existing output does, and this row is not the
 * place to change how either looks: a help text that moved a column would make every reviewer
 * check whether anything else had moved with it.
 */
export function subCommandLines(entries, gap = 2) {
    const width = Math.max(...entries.map((e) => e.usage.length));
    return entries.map((e) => `  ${e.usage.padEnd(width)}${' '.repeat(gap)}${e.summary}`);
}
/** The `instance` sub-command lines: the wizard first, then everything the dispatcher routes. */
export const instanceSubCommandLines = () => subCommandLines([
    INSTANCE_WIZARD_LINE,
    ...Object.entries(SUB_COMMANDS).map(([usage, meta]) => ({ usage, summary: meta.summary })),
]);
/** The `store` sub-command lines. */
export const storeSubCommandLines = () => subCommandLines(Object.values(STORE_SUB_COMMANDS), 3);
