/**
 * What a tool registration must declare.
 *
 * Before ARC-04-S06 a manifest entry carried only name, description and inputSchema, and
 * which flag gated a tool lived in prose — so the §2.1 approval list, the §2.2 update-set
 * protocol and the doctor each had their own idea of it (P-36). `gate` and `mutates` are
 * required fields, so a new tool that omits them does not compile.
 *
 * The declaration and the runtime cannot drift: `tests/contract.test.ts` (a) calls every
 * tool with all flags false and asserts the thrown code is the one its `gate` implies.
 */
export type Gate = 'none' | 'write' | 'cmdb_write' | 'scripting' | 'atf' | 'now_assist' | 'fluent';
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    /** Which flag family gates this tool. `none` means callable on any configured instance. */
    gate: Gate;
    /** True when a successful call changes state on the instance. Drives §2.1's ask list. */
    mutates: boolean;
    /**
     * True when a successful call changes SESSION state — which instance subsequent calls
     * address — without changing anything on any instance.
     *
     * `snow_core_instance_switch` is the only one, and it needs its own field rather than
     * `mutates: true` for two reasons that pull in opposite directions. It must appear in §2.1's
     * ask list (`03` S-23 names it): redirecting where every following write lands is precisely
     * the decision a user should be asked about. But it is not a write, so `mutates: true` would
     * fail the "a tool that mutates is never ungated" invariant unless it also gained a write
     * gate — and gating it would stop a READ-ONLY session switching instances to read another
     * one.
     *
     * So `mutates` keeps meaning "changes ServiceNow records", and the ask-list generator
     * (ARC-05-S07) unions the two: `mutates || sessionMutates`. Overloading one field to mean
     * both would have quietly changed what that invariant enforces.
     *
     * `snow_core_instances_reload` is deliberately NOT declared here: ARC-07's `--resume` depends
     * on it not prompting.
     */
    sessionMutates?: boolean;
    /**
     * A SECOND gate the tool enforces after `gate` has passed.
     *
     * Six tools have a module-wide gate plus a case-level one — `now_assist` then `write`, or
     * `fluent` then `write`. `gate` is the outer one, because that is what refuses first and
     * therefore what a consumer needs in order to predict the refusal; without this field the
     * write requirement would simply be absent from the contract, and §2.1's ask list would
     * under-report what those tools need. Additive: a consumer that ignores it still gets a
     * correct prediction of the FIRST refusal.
     */
    alsoRequires?: Gate;
    /**
     * The table this tool writes, where it is FIXED by the tool rather than passed in. The
     * audit writer (ARC-04-S10) records it. Absent when the table comes from the arguments —
     * naming a table the caller chose would put a guess in an audit record.
     */
    table?: string;
    /**
     * The tool is registered but no REST endpoint backs it: it always refuses with
     * `UNSUPPORTED_ON_THIS_INSTANCE`, naming the UI route that does work.
     *
     * Declared rather than inferred because a caller reaching for a server-side script FINDS these
     * two and assumes they work — that is why they stay registered instead of being removed. The
     * generated rule file names them in its "not a substitute" line, and before this field it had to
     * name them from a literal, which is a claim about the server kept outside the contract.
     */
    unsupported?: boolean;
}
