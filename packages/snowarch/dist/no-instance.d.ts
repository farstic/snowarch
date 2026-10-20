/**
 * ARC-08-C7 — ONE answer, in this package, to "there is no instance configured".
 *
 * The state had six wordings across the product: the doctor's Mode line, the bootstrap's Next
 * block, B08's warning, the docs generator's sample, `/snowarch status`, and two more in the
 * server's own call paths — each offering `instance add` or `mode live` or both, in a different
 * sentence. ARC-05-S06 criterion 3 says there is one, and two remedies for one state are worse than
 * one wrong one: the reader has to work out which is THE path.
 *
 * `mode live` is that path. It is documented, and it runs the wizard as B06 with the rest of the
 * switch around it; `instance add` is the wizard alone, and a user who runs it ends one step into a
 * live mode the toggles do not yet reflect.
 *
 * This package cannot import the engine's `text.mjs` — it has no dependency on `tools/`, and
 * generating a source file into `src/` would make the server's build wait on the engine's
 * generator. So the string lives here and `tests/one-remedy.test.mjs` pins it to the engine's
 * `ADD_INSTANCE`, which is what this repository already does for server-side strings such as
 * `AUTHENTICATION_FAILED`: one definition per side, and a gate that fails when they disagree.
 */
/**
 * ARC-07-C31 slice 3 — RENDERED INTO CHAT, AND STILL THE OPERATOR'S OWN SHELL.
 *
 * This sentence leaves as a `ServiceNowError` and reaches the MCP client, which is Claude, which
 * renders it into a conversation rather than into a terminal. That invites the conclusion that no
 * shell is involved and the spelling does not matter. It is the wrong conclusion: the operator reads
 * it and types it on the machine THIS SERVER IS RUNNING ON, so `cliSpelling()` is the right source.
 *
 *
 * A FUNCTION WITH A REQUIRED SPELLING, not a const: SIX sites use its value — `tools/status.ts`,
 * `servicenow/context.ts`, `servicenow/instances.ts` twice, and `cli/format.ts` twice. I counted four
 * from a grep and the type checker found the other two, which is the same lesson this row keeps
 * learning: an exhaustive search inside a scope I chose is not exhaustive. The two in `format.ts` have
 * a spelling in scope already; the other four call `cliSpelling()` because none of them is TOLD a
 * shell — the honest position, and the one ARC-07-C38 improves.
 */
export declare const NO_INSTANCE_MESSAGE: (cli: string) => string;
