/**
 * ARC-09-C95 — ATF authoring: a test, a step and the step's inputs, each written and then read back.
 *
 * The owner's R2: a session wrote `sys_atf_test`, `sys_atf_step` and `sys_variable_value` by hand and
 * could not confirm the script was attached. These tools write the same records and say what the
 * instance kept: after each write the record is read back by sys_id and every field sent is compared,
 * value by value, in the warnings model of ARC-09-C92/C93 —
 *   not shown          FIELD_NOT_STORED
 *   a shorter prefix   VALUE_TRUNCATED (the C93 detector; reported here only when the write's own
 *                      answer hid the cut, because the router's check reports a cut the answer showed)
 *   anything else      VALUE_NOT_AS_SENT, with the first differing offset and both lengths, never the
 *                      values — a script in a warning is noise
 * Line endings are normalised (\r\n → \n) on both sides before comparing, and nothing else is. The
 * transport shape comes off first: a reference arrives as `{ link, value }`, `true` as `"true"`.
 *
 * What the corpus gives (vendor/ServiceNowDocs/markdown/application-development/automated-test-framework-atf/):
 *   automated-test-framework.md   a test step is "a record in the Test Step [sys_atf_step] table that
 *                                 specifies a test action, the step configuration, and an execution
 *                                 order"; a step configuration is a record in the Test Step Config
 *                                 [sys_atf_step_config] table that "specifies the input variables"
 *   atf-test-record-form.md       a test has a Name, a Description and Active
 *   atf-step-config-record.md     a step config has a Name, Active and an "Input Variables related list"
 *   atf-edit-step-order.md        "the system assigns it the next-highest available integer value"
 *   test-steps-server-category.md Run Server Side Script: "The javascript for the server to execute"
 *   atf-move-test.md              tests move "using update sets": these are configuration writes (§2.2)
 * What it does not give: every column name below, and where a step's input VALUES are kept. That is the
 * design's assumption — one `sys_variable_value` row per input (`document`, `document_key`, `variable`,
 * `value`), its variable an `atf_input_variable` row (`model` = the step config, `element` = the input's
 * name) — which the live run reads (R3, R4) before its first write. A wrong guess shows up here as a
 * read-back warning or a refusal, never as a write the tool claims it made.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ServiceNowRecord } from '../servicenow/types.js';
type Row = Record<string, unknown>;
export type AuthorWarning = Row & {
    code: string;
    table: string;
    field: string;
    message: string;
};
/** A value with its transport shape taken off: a reference's `value`, every scalar as its string. Also ai-agents.ts's (ARC-09-C165). */
export declare function plain(v: unknown): string | undefined;
/**
 * ARC-09-C174 — where a call that writes several records is: the step it is at, and every record it has created. A
 * failure is rethrown naming both, so a refusal can be placed. `write` keeps it current, and a record whose read-back
 * fails is already among `created`.
 */
export interface Progress {
    step: string;
    created: Array<{
        table: string;
        sysId: string;
    }>;
}
/** Write one record and read it back. Also ai-agents.ts's, for the sn_aia_* records (ARC-09-C165). */
export declare function write(client: ServiceNowClient, table: string, sent: Row, live: boolean, sysId?: string, progress?: Progress): Promise<{
    sysId: string;
    stored: ServiceNowRecord;
    warnings: AuthorWarning[];
}>;
export declare function addTest(client: ServiceNowClient, args: Row): Promise<Row>;
export declare function addStep(client: ServiceNowClient, args: Row): Promise<Row>;
export {};
