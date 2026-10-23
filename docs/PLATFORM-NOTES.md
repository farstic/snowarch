# Platform notes

Platform behaviour learned on real instances, each with the corpus page it is grounded in. These are
facts about **ServiceNow**, not about this repository's server — a bug in a tool is a failing test in
`packages/snowarch`, and the server's changelog carries the ones not yet fixed (in the engineering checkout).

Ids are stable and chronological. Where the corpus has no page stating the behaviour the `Grounding:`
line says so and names the nearest page for the baseline concept — never an invented path.

**This file is one of four homes, not the home for everything.** A finding about this repository's
own server is a failing test in the server's suite; an install or Claude Code behaviour is
`docs/TROUBLESHOOTING.md` or a rule in the contributor guide; anything instance-specific is never
committed at all. The guide's table *Where a finding goes* is the authority (the guide and the suite are in the
engineering checkout), and `CLAUDE.md` § 11 is the short form a session reads.

## PN-01 — REST capture follows the user preference, not the "current" update set

**Applies to:** `sys_user_preference`, `sys_update_set` · Australia family · confirmed on PDI 2026-05-27
**Behaviour:** Update-set capture over the REST API follows the authenticated user's
`sys_user_preference` row with `name=sys_update_set`; its `value` is the update set that subsequent
writes are captured into. The `is_default` flag on an update set is a UI concept and does not change
what REST captures — setting it looks like success and captures nothing. A direct POST to
`sys_update_xml` is refused with `INSUFFICIENT_PRIVILEGES`, admin included, so capture cannot be
applied retroactively.
**Grounding:** none in ServiceNowDocs (`markdown/application-development/system-update-sets/` for the
baseline concept); observed behaviour
**Evidence:** observed on PDI; regression test — none (platform, not server)
**Engine consequence:** governance §2.2 is this behaviour written as a four-call protocol — ensure the
set by name, point capture at it, write, then preview to confirm. The preview step exists because
capture cannot be verified any other way and cannot be repaired afterwards.

## PN-02 — On a PDI, an email is visible only if the row is inserted directly

**Applies to:** `sys_email` · Australia family · confirmed on PDI 2026-05-28
**Behaviour:** On a Personal Developer Instance, `gs.sendEmail()` goes to SMTP directly and leaves no
`sys_email` row; `GlideEmailOutbound` with `.save()` does not persist; and an event-driven
notification processes without creating one. Inserting a `sys_email` record with `type=send-ready`
and `state=ready` does create a visible, queryable row. The row then shows `state=ignored` — a PDI
suppresses delivery but keeps the record, which is the correct outcome for a test.
**Grounding:** none in ServiceNowDocs (`markdown/platform-administration/activate-email-service.md`
for the baseline concept); observed behaviour
**Evidence:** observed on PDI; regression test — none (platform, not server)
**Engine consequence:** designs keep baseline Notifications and events (§1.1). The Developer skill and
the ATF Author put the PDI limitation in the **test strategy**: on a PDI, neither `gs.sendEmail()` nor
an event-driven notification leaves a `sys_email` row, so a test plan that says "check `sys_email`" is
untestable there — verify on a non-PDI instance, or insert a `sys_email` row as an explicit test
fixture, never as the implementation.

## PN-03 — `action=DELETE` rows in an update set are normal and cannot be removed

**Applies to:** `sys_update_xml` · Australia family · observed on PDI
**Behaviour:** Deleting a tracked object while an update set is active captures an `action=DELETE`
entry in `sys_update_xml`. The entry cannot be deleted over REST (the ACL refuses), and it is not a
defect: it is the instruction that removes the same object on the target instance at promote time. It
does not affect the `INSERT_OR_UPDATE` entries in the same set.
**Grounding:** none in ServiceNowDocs
(`markdown/application-development/system-update-sets/customizations-tracked-update-sets.md` for what
is tracked); observed behaviour
**Evidence:** observed on PDI; regression test — none (platform, not server)
**Engine consequence:** the DevOps / Release Manager consult treats DELETE rows in an update-set
preview as expected content, and never proposes "cleaning" a set before promotion.

## PN-04 — Incident state 6 (Resolved) requires a `close_code` from the instance's own choice list

**Applies to:** `incident`, `sys_choice` · Australia family · confirmed on PDI 2026-06-26
**Behaviour:** Setting `state=6` over REST is rejected unless `close_code` holds a value that is an
active choice for `incident.close_code` **on that instance**. Instances carry customised choice
lists, so a value that is standard elsewhere — including `Solved (Permanently)` — may not exist on
the instance in front of you. Query the choices first:
`sys_choice` filtered by `name=incident`, `element=close_code`, `inactive=false`. On success
`resolved_by` and `resolved_at` are set by the baseline business rule.
**Grounding:**
`markdown/it-service-management/incident-management/resolve-and-close-an-incident.md`
**Evidence:** observed on PDI; regression test — none (platform, not server)
**Engine consequence:** the ITSM gateway's Data Model Alignment lists the instance's valid
`close_code` values before any resolve write is designed, rather than assuming the standard list.

## PN-05 — Assignment rules are `sysrule_assignment`, and the table field is `document`

**Applies to:** `sysrule_assignment` · Australia family · confirmed on PDI 2026-06-01
**Behaviour:** The REST-accessible table for assignment rules is `sysrule_assignment`; a create
against `assignment_rule` is refused with `INVALID_REQUEST`. Three field names differ from what the
form labels suggest: the target table is `document` (not `table` or `collection`), the group is
`group` (not `assignment_group`), and `condition` is an encoded query. The record is captured in the
active update set like any other configuration object.
**Grounding:** none in ServiceNowDocs (`markdown/core-business-suite/assignment-rules-cbs.md` for the
baseline concept); observed behaviour
**Evidence:** observed on PDI; regression test — none (platform, not server)
**Engine consequence:** Technical Designer and Developer name `sysrule_assignment` and its three
fields explicitly in any assignment-rule design, because the obvious names are all wrong and the
failure is an `INVALID_REQUEST` that says nothing about which name to use instead.

## PN-06 — Basic-auth credentials reach the outbound HTTP log at verbose levels

**Applies to:** outbound REST, `sys_outbound_http_log` · Australia family · confirmed on PDI 2026-06-08
**Behaviour:** With verbose request logging on — the system property
`glide.outbound_http_log.override` set true **and** the level at `all` or `elevated` — an outbound
call's request headers are written to the outbound HTTP log, `Authorization` included. For basic
auth that is the base64 of the user name and password, in clear, in a queryable platform table. At
the default `basic` level request headers are not logged. This is true of any scheme whose secret
rides in a header, bearer tokens and API keys included.
**Grounding:**
`markdown/platform-security/instance-security-hardening-settings/sc-prevent-verbose-http-request-logging.md`,
`markdown/api-reference/web-services/outbound-logging-configure.md`
**Evidence:** observed on PDI, and the two pages above state the override and the per-call level;
regression test — none (platform, not server)
**Engine consequence:** the Security and GRC consult treats the outbound log level as a security
control rather than a debugging knob — a design carrying an auth header sets `basic` explicitly on
the message, holds the secret in a Connection and Credential Alias, and any raise to `all` or
`elevated` goes through change with a post-deploy check that no header value was logged.

## PN-07 — `sys_script_fix.name` is truncated to 40 characters without an error

**Applies to:** `sys_script_fix` · Australia family · confirmed on PDI 2026-08-28
**Behaviour:** A Fix Script created over the REST Table API with a 44-character `name` was stored with
40, cut mid-word and with a trailing space. The call returned success and echoed the truncated value.
`sys_name` is truncated identically, so the display value is wrong everywhere it appears, including
`sys_update_xml.target_name` for the captured update — which is the name that travels to the target
instance. The API does not reject over-length input for a short label field; it trims it.
**Grounding:** none in ServiceNowDocs (`markdown/application-development/c_FixScripts.md` for the
baseline concept); observed behaviour
**Evidence:** observed on PDI, one POST; the server's handling of a cut value is covered by
the server's test `silent-truncation.test.ts` (PN-10)
**Engine consequence:** keep `sys_script_fix.name` at 40 characters or fewer when authoring by hand.
The Developer skill (`.claude/skills/developer/SKILL.md`) carries no such rule — checked while
ARC-09-C93 was written. A write through this server that comes back cut now returns a `VALUE_TRUNCATED`
warning (PN-10), within the limits PN-10 lists; that warning is the only check there is, not a second
line behind a skill's.

---

## PN-08 — ROPC can be switched off instance-wide, and then no client id is the problem

**Applies to:** OAuth password grant (`oauth_token.do`), the wizard's `--auth oauth_ropc` · Australia family
**Behaviour:** The resource-owner password-credentials grant is disabled instance-wide by the
hardening property `glide.oauth.inbound.ropc.grant_type.disabled`. With it set, every ROPC token
request fails whatever the client id, client secret, user name and password are — the account and
the OAuth application are both fine, and there is nothing to fix on either. The wizard's own answer
is `OAUTH_ROPC_DISABLED`, offered beside "switch to basic authentication", because basic is the
path that still works on an instance hardened this way.
**Grounding:**
`markdown/platform-security/instance-security-hardening-settings/sc-disable-resource-owner-password-credentials-ropc-in-oauth-2-token-grants.md`
**Evidence:** the page above states the property and its effect; regression test — the wizard's
ROPC error table is unit-tested against the server's fixture `oauth-ropc-errors.json`
**Engine consequence:** an integration design that assumes ROPC checks the property before promising
it, and the fallback is named in the design rather than discovered during a cutover.

## PN-09 — A PDI hibernates, and a hibernating instance refuses connections

**Applies to:** personal developer instances (`devNNNNN.service-now.com`) · every family
**Behaviour:** A PDI that has been idle is put to sleep and has to be woken from the developer
portal before it answers. Until it is awake, a connection attempt fails at the network layer — the
name resolves, the TLS handshake may even complete, and the request then goes nowhere. It is not an
authentication failure, and re-entering a password will not fix it, which is exactly the confusion
worth naming: the wizard's reachability probe reports the network cause rather than blaming the
credentials, and the remedy is to wake the instance and run the command again.
**Grounding:** none in ServiceNowDocs (the developer-programme behaviour is not part of the product
documentation; the corpus documents instances a customer owns, e.g.
`markdown/platform-administration/configure-target-instance.md`, and says nothing about the
developer programme's sleep policy).
**Marked observed** rather than cited.
**Evidence:** observed while preparing ARC-07-S11's live suite
**Engine consequence:** a live test suite wakes the instance first and treats an unreachable PDI as
an environment problem, never as a failed assertion about the product.

## PN-10 — `sys_script.name` (a Business Rule) is cut at 40 characters without an error

**Applies to:** `sys_script` · release family not recorded by the report · reported by the owner's
live test (ARC-09-C93, finding R4)
**Behaviour:** The owner's live test created a Business Rule whose `name` was longer than 40
characters; it was cut at 40 and `snow_scr_business_rule_add` reported success. PN-07 records the same
behaviour for `sys_script_fix.name`.
**Grounding:** none in ServiceNowDocs (`markdown/platform-administration/table-administration-and-data-management/r_DictionaryEntryForm.md`
for the dictionary's `max_length`, which it calls "a logical limit for the size of string fields",
mapped by the system to a physical type with more length available than stated, so that the platform
cuts at exactly `max_length` is not documented in the bundled corpus — verify on the instance);
observed behaviour. Reading `sys_dictionary` needs the `personalize_dictionary` role
(`markdown/platform-security/access-control/r_SecurityJumpStartACLRules.md`).
**Evidence:** the owner's live test. **Not reproduced here** — this repository's tests have no
instance. PN-07 observed, on a PDI, one POST whose response carried the CUT value; that the response
for `sys_script`, and for a PATCH, does too was **assumed, not seen**, and it was the single point of
failure of the design below. **Seen on 2026-10-08:** the server's live suite,
on `v2.0.11-rc.1`, showed the response carrying the cut value on the POST and on the PATCH, with
`sys_dictionary` stating `max_length` 40 (`confirmed: true`) — engineering record 2.0.11-rc.1-live-sitting. Regression tests, with a fake that stores a shorter value:
the server's `silent-truncation.test.ts`,
`stored-values.test.ts` and, over the real client with the HTTP seam
mocked, `silent-truncation-http.test.ts` (in the engineering checkout)
**Engine consequence:** the server's `stored-values.ts` compares what a
`createRecord` or `updateRecord` stored with what it sent and returns `warnings[].code =
VALUE_TRUNCATED` with the field, both lengths and a limit. It cannot stop the cut: by the time the
response says so the record exists (and, if update-set capture was on, so does the entry), so the
warning says to **modify** the record and not to add it again.

*What it covers.* Writes made through `createRecord` and `updateRecord`, by any tool; the Batch API
(`snow_fluent_request_batch`: each POST, PATCH or PUT to `/api/now/table/<table>[/<sys_id>]` that the
platform answered 2xx); the `file_name` of an attachment upload; `createChangeRequest`; and a client
copy made with `withUser` (ARC-09-C100). String values only, when the response holds a strict prefix of
what was sent (line endings normalised; a decimal's trailing zeros and trimmed whitespace are not a
cut). The dictionary is read once per table after the tool has finished, within one budget, and the
first failed lookup ends it; the warning is then `confirmed: false`.

*What it does not cover* — so an absent `warnings` key is **not** proof that nothing was cut: the Now
Assist and catalogue POSTs (`callNowAssist`), which run something and answer with its result rather
than the record that was written, so there is no stored value to compare; a batch operation on a path
that is not the Table API; fields the response does not echo (journal fields, passwords, write-only
columns); and values that are not strings.

*Where the warnings land.* On the tool's result, as `warnings`, at most ten entries: the first nine whole
and one roll-up (`rollup: true`, a `count`, the tables and fields) for the rest, so a bulk tool that
writes 50 cut records does not put 36 KB ahead of its results. The audit trail counts a roll-up as the
writes it stands for. In a playbook (`snow_orch_playbook_exec`) each step carries the warnings of its own
writes (`step`, `tool`), the playbook result carries them all, and under `on_error: 'stop'` (the
default) the playbook halts after a step whose writes stored a cut value or whose result carries a
warning (`halted_at_step`, `halt_reason`); `continue` and `skip` go on.

*Known false alarms.* Any reformat that drops a non-whitespace tail looks like a cut unless the dictionary
rules it out: a datetime written to a date column, a trailing list delimiter or `^`, an HTML tail removed
by the sanitiser. The dictionary cannot rule anything out for a column defined on a parent table
(`incident.short_description` is defined on `task`, so there is no row under `incident`): there a cut is
never `confirmed` and a benign reformat is not suppressed.

*Assumed, not documented.* That the platform counts characters in code points (the check suppresses a
warning only when the limit fits under code points AND UTF-16 units); that the response to a PATCH echoes
the stored value; that a platform which ignores an unknown column name does so without an error (the add
tool checks the response for the two columns it sends — `FIELD_NOT_STORED`).

*Refusal before the write is not built, on purpose* (plan row ARC-09-C97). It needs the limit before the
write. The only dictionary reader in the server, `snow_disco_table_discover`, used to default a blank
limit to 255, cache by table without the instance, skip inherited columns and read at most 200 columns,
so a limit taken from it could have refused a write the platform would have accepted; ARC-09-C98 fixed
those four. It is now instance-keyed, walks `sys_db_object.super_class`, reports a blank or 0 limit as
`null` (unknown) and reads every page, and says in a `note`, without caching, when it could not read the
whole schema. A reader C97 can refuse on still needs what that tool does not do: restrict itself to
string-like types, remember that the dictionary is unreadable for this account (it needs the role
above), refuse only on a fresh uncached read, and have its own error code. The gate to building it is
the live run above showing that `max_length` is the point the platform cuts at, on the tables callers
write most, inherited columns included.

*Assumed, not documented (the dictionary reader).* That a child table's parent is held in
`sys_db_object.super_class` and comes back as `{ link, value }` with the parent's `sys_id` as the value
(the corpus prints that a child extends and inherits from a parent, `platform-administration/table-administration-and-data-management/t_TableHierarchyAndTheExtModel.md`,
and that a reference comes back as `{ link, value }` by default, `api-reference/rest-apis/c_TableAPI.md`;
it prints neither the column's name nor which dictionary columns are references); and that a blank
`max_length` means "not stated" rather than a default (the corpus says only that the value matters for
String fields, `r_DictionaryEntryForm.md`). Both are checked on the instance, not here.

## PN-11 — The Batch API Base64-encodes the body of every request and every answer, and lists what it did not process

**Applies to:** `POST /api/now/{api_version}/batch` · Australia family · from the documentation, not yet observed on an instance
**Behaviour:** In a batch, each `rest_requests.body` is the **Base64-encoded** body of that request ("Before
encoding, the body can be in any format. For example, XML or JSON"), and each `serviced_requests.body` is the
**Base64-encoded** body of that answer ("To get the value of the body, Base64 decode the content"). A body
that is plain JSON in the request is therefore not a body the platform can read, and a body in the answer is
not JSON until it is decoded. When the batch reaches a size or processing limit (5 MB per request item and
10 MB per answer item by default; a 30-second transaction quota), the platform cancels the transaction and
lists the requests it did not process in `unserviced_requests`; the ones before them in `serviced_requests`
have run. Each item also carries `status_code`, `status_text`, `error_message`, `redirect_url`,
`execution_time` and `headers`.
**Grounding:** `markdown/api-reference/rest-apis/batch-api.md` (the request and response parameter tables,
the size and processing limits, and the cURL example whose answers decode to XML and JSON).
**Evidence:** the documentation only. `client.batchRequest` sent plain JSON and returned undecoded bodies, and
ignored `unserviced_requests`, until ARC-09-C108; that the platform now accepts what is sent has not been
confirmed against an instance.
**Engine consequence:** `client.batchRequest` Base64-encodes each request body (a string is taken as a body in
the caller's own format), decodes each answer body (JSON is parsed, other Base64 text is returned as text, and
anything that is not Base64 is kept as it came), and returns `unserviced` (always) with a `note` naming the
operations that did not run. The cut-value check (PN-10) reads the same answer. This tool's own cap of 50
operations is not a platform limit the page states. `error_message`, `status_text`, `redirect_url`,
`execution_time` and `headers` are still not passed to the caller.

## PN-12 — An update set holds one entry per record, and the entry carries the record's latest version

**Applies to:** `sys_update_xml` (update-set capture of REST writes) · release family not recorded by the
sitting · observed in the 2.0.11-rc.1 live sitting (ARC-09-C93)
**Behaviour:** A Business Rule written three times through the Table API — an insert, then two modifies —
while the same update set was the capture target had **one** `sys_update_xml` row, not three. Its payload
was the LATEST version: the name of the last write and `<sys_mod_count>2</sys_mod_count>`. A modify that
corrects a value, made while the same update set is the capture target, therefore leaves the corrected value
in the entry.
**Grounding:** observed behaviour. It is consistent with
`markdown/application-development/system-update-sets/using-system-update-sets.md` ("This action ensures that
the latest version of the object is included in the desired update set and prevents duplicate updates for
the same object in a single update set"), which says so of a UI procedure, not of REST writes.
**Evidence:** engineering record 2.0.11-rc.1-live-sitting, step 5 — the preview, then the
`sys_update_xml` rows read with `snow_core_records_query`.
**Engine consequence:** the `VALUE_TRUNCATED` warning's advice (PN-10) holds: **modify** the record rather
than add it again, and the update set then carries the corrected value. That is true only while the same
update set is still the capture target.

## PN-13 — `filter_condition` is stored as the plain encoded query; the update-set payload adds an `<item>` child

**Applies to:** `sys_script.filter_condition` · release family not recorded by the sitting · observed in the
2.0.11-rc.1 live sitting (ARC-09-C92)
**Behaviour:** Read back from `sys_script`, `filter_condition` is the sent string unchanged —
`number=INC0000000`, with no `^EQ` and no item lines appended. In the `sys_update_xml` payload the same field
is rendered as `<filter_condition table="incident">number=INC0000000<item … field="number" operator="="
value="INC0000000"/></filter_condition>`: the platform adds the `<item>` child to the XML only.
**Grounding:** none in ServiceNowDocs (`markdown/api-reference/business-rules-classic/c_BusinessRules.md` describes a business rule's conditions and names no `filter_condition` column); observed behaviour.
**Evidence:** engineering record 2.0.11-rc.1-live-sitting, steps 2 and 5.
**Engine consequence:** the stored-value check (PN-10) compares the column read back, which is the plain
string, so the payload's `<item>` raises no `VALUE_TRUNCATED` or `FIELD_NOT_STORED`. A reader of update-set
payloads must not compare the payload's XML text with the column's value.

## PN-14 — A trailing `^` in `filter_condition` is kept

**Applies to:** `sys_script.filter_condition` · release family not recorded by the sitting · observed in the
2.0.11-rc.1 live sitting (ARC-09-C93, the false-alarm check)
**Behaviour:** A rule created with `filter_condition` `number=INC0000000^` read back as `number=INC0000000^`:
the trailing `^` was kept, not trimmed.
**Grounding:** none in ServiceNowDocs (`markdown/api-reference/business-rules-classic/c_BusinessRules.md` describes a business rule's conditions and names no `filter_condition` column); observed behaviour.
**Evidence:** engineering record 2.0.11-rc.1-live-sitting, step 6.
**Engine consequence:** the cut-value detector (`looksCut`) needs no exemption for a trailing `^` on this
release. If a release trims it, the detector would flag a benign shape; that has not been observed.

## PN-15 — A path the instance does not serve: one message, and the status follows the method

**Applies to:** the REST API, any `/api/...` path the instance does not serve · release family not recorded by
the sitting · observed in the 2.0.11-rc.1 live sitting (ARC-09-C94)
**Behaviour:** `GET /api/now/atf/runner/run_test` in the REST API Explorer answered HTTP 404 with the message
"Requested URI does not represent any resource". This server's `POST` to the same path got the same message
with HTTP 400, which the client reports as `INVALID_REQUEST`. The status follows the method and the message
does not. A path that does exist answered differently: `GET /api/sn_cicd/progress/{progress_id}` from the
Explorer answered "User is not authenticated".
**Grounding:** none in ServiceNowDocs (`markdown/api-reference/rest-apis/cicd-api.md` lists 404 for its own endpoints as "Not found. The requested item wasn't found." and gives no message for a path that is not served); observed behaviour.
**Evidence:** engineering record 2.0.11-rc.1-live-sitting, § ARC-09-C94, steps 6 to 8. After the fix, on
`v2.0.11-rc.3` (2026-10-09), the CI/CD path ran a one-test suite to `outcome: "success"`
(engineering record 2.0.11-rc.3-live-sitting, § ARC-09-C94).
**Engine consequence:** the ATF exec tools use this message, not the status, to tell "the CI/CD API is not
served here" from "the suite was not found" (`src/tools/atf-cicd.ts`, ARC-09-C94). A 400 that carries it
means a missing path, not a malformed body.

## PN-16 — A Test Step's input rows are created by its insert and removed with it

**Applies to:** `sys_atf_step` and `sys_variable_value` · release family not recorded by the sitting · observed in
the 2.0.11-rc.3 live sitting (ARC-09-C95), and again on 2.0.12-rc.2 (ARC-09-C122)
**Behaviour:**
- **Created by the insert.** A "Run Server Side Script" step was inserted over the REST Table API, and the insert
  created both of its `sys_variable_value` rows at once:
  - `jasmine_version` = "3.1", at order 100, from the input variable's default expression
    `GlidePropertiesDB.get('sn_atf.jasmine.versions','3.1').split(',').pop()`;
  - `script`, from its default `getDefaultServerSideScript()`, at order 200.

  A mandatory input the caller did not send is therefore set by the instance, without a word.
- **Not deletable on their own here.** Deleting one of those rows directly was refused for this account with
  `DELETE_CONSTRAINT` ("ACL Exception Delete Failed due to security constraints"); whether an ACL or a
  reference constraint caused it is not established.
- **Removed with the step.** Deleting the step removed both rows, on 2.0.11-rc.3 and again on 2.0.12-rc.2.
- **Its input variables,** read on 2.0.12-rc.2: `script` has a `max_length` of 2000 and is not mandatory;
  `jasmine_version` has a `max_length` of 40 and is mandatory.
- **What the tool now reports (ARC-09-C122, confirmed live on 2.0.12-rc.2).** `snow_atf_atf_step_add` lists
  every input row of the step, these included, as `defaulted by the instance`. A mandatory input left without a
  value is reported as `FIELD_NOT_STORED` on `inputs.<name>`, after the write. A value longer than its input
  variable's `max_length` is refused before it.

**Grounding:** `markdown/application-development/automated-test-framework-atf/test-steps-server-category.md`
names the step's Jasmine version and Test script fields by their labels. The rest is not documented in the
bundled corpus — that an insert creates the input rows from defaults, the default expressions, the refused
delete, the cascade and the variables' limits: observed behaviour.
**Evidence:** engineering record 2.0.11-rc.3-live-sitting, § ARC-09-C95: W2, the follow-up read and the
teardown. Engineering record 2.0.12-rc.2-live-sitting, § ARC-09-C122: R2, W3 and the teardown.
**Engine consequence:** `snow_atf_atf_step_add` updates a row the insert created rather than adding a second
(ARC-09-C95). Since ARC-09-C122 its output lists every input row of the step, the rows the instance defaulted
included; before it, they were invisible to the caller. A teardown removes the step, not its input rows. Since
ARC-09-C177 the server reports the refused delete's wording, "ACL Exception … due to security constraints", as
`DELETE_ACL_DENIED`; it was `DELETE_CONSTRAINT` on 2.0.11-rc.3.

## PN-17 — An AI agent's configuration and version are created by its insert; a workflow's team is not

**Applies to:** `sn_aia_agent`, `sn_aia_agent_config`, `sn_aia_version`, `sn_aia_agent_tool_m2m`, `sn_aia_usecase`,
`sn_aia_team`, `sn_aia_team_member` · Brazil patch 0 · observed in the owner's trial over the REST Table API on
2.1.1, 2026-10-16 (ARC-09-C165), again with the fixed tools on v2.2.0-rc.1, 2026-10-17, and in the owner's continued
run that day (ARC-09-C172)
**Behaviour:**
- **The agent's insert creates two more records.** One insert into `sn_aia_agent` created, in the same second, an
  `sn_aia_agent_config` (`active=true`, `current_version` empty) and an `sn_aia_version` "Version 1"
  (`state=committed`, a `snapshot` holding the definition, the tools and the security settings). The agent is
  active as soon as it is inserted. AI Agent Studio opens it as "Version 1 · Current" although `current_version`
  is empty.
- **A tool link rewrites the snapshot.** Inserting an `sn_aia_agent_tool_m2m` added the link to the committed
  version's `snapshot.overlay.tools`, with `executionMode: "copilot"`, and created no new version. The link's
  defaults included `display_output=true`.
- **An unnamed link is refused.** An `sn_aia_agent_tool_m2m` insert without `name` is refused by a data policy,
  "Data Policy Exception: The following fields are mandatory: Name", with HTTP 403. The same insert with the tool's
  name was created. AI Agent Studio names a link after its tool. Observed on a Brazil-family PDI, patch 0, 2026-10-17,
  on v2.2.0-rc.3, where the instance's own text first reached the caller (ARC-09-C176, ARC-09-C180).
- **A workflow's insert creates a version and nothing else.** An insert into `sn_aia_usecase` created an
  `sn_aia_version` "V1" (`state=published`, empty `snapshot`) and no `sn_aia_team`. The workflow has no agents
  until a team is created, set on `sn_aia_usecase.team`, and given `sn_aia_team_member` rows.
- **No access control.** Nothing in this sequence created an ACL or an access role. AI Agent Studio counted the
  new workflow among those "with no access control list (ACL) configured".
- **Captured.** Every record above, the automatic ones included, landed in the update set the user preference
  named (PN-01).
- **`current_version` varies.** On the same instance the agent's configuration had `current_version` empty in the
  first trial and populated in the v2.2.0-rc.1 run. Both were observed, so the tool reports the value it reads and
  asserts neither.
- **The stored execution modes.** The values seen are `autopilot` for Autonomous and `copilot` for Supervised. They
  are observed values, read from the instance's `sys_choice`, never defaults to send.
- **The defaults the instance filled in.** Observed on Brazil patch 0, 2026-10-17, on records written without the
  field:
  - a workflow's `execution_mode`: `copilot`;
  - a team member's `memory_scope`: `global`;
  - an agent's `channel`: `nap_and_va`, and its `agent_type`: `internal`.
- **Studio's pages.** Two route families open the same objects:
  - `/aiux/aia/agent/<sn_aia_agent sys_id>/visualize` for an agent and `/aiux/aia/workflow/<sn_aia_usecase
    sys_id>/visualize` for a workflow; `/usecase/` in the workflow's place answered "Page not found";
  - `/now/agent-studio/agent-setup/<sys_id of the sn_aia_agent>` for an agent's setup, and a
    `/usecase-guided-setup/<id>/…` path for a workflow's (prefix not recorded), observed on Brazil patch 0, 2026-10-17.

**Grounding:** the tables are documented — `markdown/intelligent-experiences/na-aia-reference.md`, "AI agents
tables installed" (lines 713–893, with the underscores escaped as `sn\_aia\_`), lists `sn_aia_agent`,
`sn_aia_agent_config`, `sn_aia_tool`, `sn_aia_agent_tool_m2m`, `sn_aia_usecase`, `sn_aia_team` and
`sn_aia_team_member`. The access model is in `markdown/intelligent-experiences/define-sec-aia-new.md` and
`markdown/intelligent-experiences/aia-security-implementation.md`, and a tool's two execution modes, Supervised and
Autonomous, in `markdown/intelligent-experiences/add-tool-aia-new.md`. Not documented in the bundled corpus (branch
`australia`): `sn_aia_version` and its states, the automatic records, the snapshot rewrite, the absent team, the
refused unnamed link, the Studio routes and the defaults — observed behaviour, on a family one ahead of the corpus;
verify on the instance's family.
**Evidence:** the owner's trial record, which is engagement-local and not committed; the owner's continued run on a
Brazil-family PDI, 2026-10-17, engagement-local, summarised by the Architect in the engagement folder and not
committed; the owner's v2.2.0-rc.2 and rc.3 checks on the same PDI, 2026-10-17, whose session transcript is
engagement-local; and engineering record 2.2.0-rc.1-live-sitting, the run with the fixed tools.
**Engine consequence:** since ARC-09-C165 `snow_ai_ai_agent_add` reads the configuration and the version back
rather than creating them, and reports a missing one as a warning; `active: false` modifies the configuration.
`snow_ai_agentic_workflow_add` creates the team first and sets it on the workflow's insert: 2 + N inserts and no
modify. Both return `access_rules`, saying that nothing configured access, and `studio_route`, where it is
configured. Since ARC-09-C169 the agent's configuration and version are read back after its tool links, because a
link rewrites the version's snapshot. Since ARC-09-C180 a link the caller does not name is named after its tool.

## PN-18 — Pointing REST capture at an update set moves the user's own UI session to it too

**Applies to:** `sys_user_preference` (`name=sys_update_set`) · Brazil patch 0 · observed in the owner's trial on
2.1.1, 2026-10-16 (ARC-09-C165), and in the owner's continued run, 2026-10-17 (ARC-09-C172)
**Behaviour:** `snow_us_capture_target_set` sets the authenticated user's `sys_update_set` preference, which REST
capture follows (PN-01). The same user's interactive session followed it too: after the trial, the ServiceNow header
in the owner's own browser showed the trial's update set. Changes that user then makes by hand land in that update
set until it is switched back. A browser session already open when the preference changed did not pick up the new
update set until the user logged in again (observed on Brazil patch 0, 2026-10-17).
**Grounding:** none in ServiceNowDocs (`markdown/application-development/system-update-sets/` for the baseline
concept); observed behaviour.
**Evidence:** the owner's trial record, which is engagement-local and not committed, and the owner's continued run on a
Brazil-family PDI, 2026-10-17, engagement-local, summarised by the Architect in the engagement folder and not
committed.
**Engine consequence:** `snow_us_capture_target_set` already returns `previous`, the update set the preference named
before the call (ARC-09-C127), so a second call can point capture back. Offering that restore at the end of a build
sequence belongs to the Architect, in `governance/mcp-protocols.md` (ARC-09-C166), which also says that a browser
already open needs a new login before a hand-made change is captured (ARC-09-C172).

## PN-19 — What AI Agent Studio's access-rules step does by itself

**Applies to:** an AI agent's and an agentic workflow's security controls in AI Agent Studio, and
`sn_aia_usecase_config_override` · Brazil patch 0 · observed in the owner's continued run, 2026-10-17 (ARC-09-C172)
**Behaviour:**
- **Approved roles are pre-filled.** The data-access step's **Approved roles** came pre-filled from the roles chosen
  for user access: both user-access roles (`itil`, `admin`) were copied, and `admin` was removed by hand.
- **Cancel does not stop the save.** In the "Save updates?" dialog, Cancel did not stop the save: the changes were
  saved.
- **The save creates records and switches the workflow on.** Saving created an `sn_aia_usecase_config_override`
  (`active=true`) and an ECC Queue policy record, and set the workflow active. Both records appeared in the update
  set after the Studio step.
- **Search lags.** Studio's keyword search did not find a newly created agent at once.

**Grounding:** the step itself is documented — `markdown/intelligent-experiences/define-sec-aia-new.md` (user access,
then data access with **Approved roles** for a dynamic user), and
`markdown/intelligent-experiences/aia-studio-domain-separation.md` lists `sn_aia_usecase_config_override` among the
configuration tables. Not documented in the bundled corpus (branch `australia`): the pre-fill, the dialog, the records
the save creates, the workflow's activation and the search lag — observed behaviour, on a family one ahead of the
corpus; verify on the instance's family.
**Evidence:** the owner's continued run on a Brazil-family PDI, 2026-10-17, engagement-local, summarised by the
Architect in the engagement folder and not committed.
**Engine consequence:** none in the tools — no tool sets access rules. `governance/mcp-protocols.md` says the Studio
step is a write with its own question, and the Now Assist Specialist says to remove `admin` from the approved roles and
to expect the two records in the update set (ARC-09-C172).

## PN-20 — A Protected Script Include's script does not come back over the Table API

**Applies to:** `sys_script_include` with `sys_policy` = `protected` · Brazil patch 0 · measured on a PDI, 2026-10-17
**Behaviour:** The `sn_aia` Script Includes AgentToolM2MDao and AgentVersionDao, read with `snow_core_record_read`
and `snow_core_records_query`, came back without a `script` field: not empty, absent. AgentToolM2MDao's `sys_policy`
reads `protected`. The tools pass on what the instance answers (measured in the server: a 5 KB `script` comes back
whole, and nothing removes a field), so the platform withholds it.
**Grounding:** `markdown/api-reference/scripts/c_ScriptIncludes.md`, Protection policy (lines 158–174): "Protected —
… Customers who download the script include cannot see the contents of the script field." That page does not name
the `sys_policy` column; verify it on the instance. The record's `access` value, `package_private` ("Accessible
from: This application scope only", lines 93–103), governs calling it from another scope, not reading it.
**Evidence:** the owner's read on a Brazil-family PDI, 2026-10-17, which is engagement-local and not committed.
**Engine consequence:** a design cannot read a Protected script and must not depend on its contents. Since
ARC-09-C178 a read that passes `fields` names the requested fields the instance did not return, as
`fields_not_returned`.

## PN-21 — A mandatory field over the REST Table API is a data policy's, not the dictionary's

**Applies to:** every table a create writes · every family · the documented rule, and observed on a Brazil-family PDI,
patch 0, 2026-10-17 (ARC-09-C183), and on the same PDI, 2026-10-19
**Behaviour:**
- **The dictionary's Mandatory is a form rule.** "Using a dictionary entry to make a field mandatory does not work
  when using web services or background scripts. You can use a data policy instead." A create over the Table API is
  not refused for a dictionary-mandatory field it leaves out.
- **A data policy is enforced on the REST Table API by default.** Its mandatory rules apply to a create that lacks the
  field. A parent table's policy applies to an extending table only when its Inherit is set.
- **Observed:** an `sn_aia_agent_tool_m2m` insert without `name` was refused, 403 "Operation Failed: Data Policy
  Exception: The following fields are mandatory: Name" (PN-17).
- **The ITSM policies found were all conditional.** On 2026-10-19 the active policies were incident 1 ("Make close info
  mandatory when resolved or closed", `stateIN6,7`: `close_code`, `close_notes`), problem 8 (on state or resolution
  code), and change_request 1 (read-only rules only). None was inherited from `task`. So on this family the pre-write
  check's "may be required" note is the normal case, and a create is not refused before writing.

**Grounding:** `markdown/platform-administration/t_MakingAFieldMandatory.md` (About this task);
`markdown/platform-administration/c_DataPolicy.md` (applied to the REST Table API by default);
`markdown/platform-administration/r_DataPolicyFields.md` (Inherit); `markdown/platform-administration/c_InstalledWithDataPolicy.md`
(the tables `sys_data_policy2` and `sys_data_policy_rule`). The column names the server reads are not documented in the
bundled corpus; they were confirmed on Brazil patch 0, 2026-10-19:
- `sys_data_policy2` has `model_table`, `conditions`, `inherit` and `active`, among `short_description`, `description`,
  `model_id`, `enforce_ui`, `apply_import_set`, `apply_soap`, `reverse_if_false`, `sys_policy` and `sys_overrides`;
- `sys_data_policy_rule` has `sys_data_policy`, `field` and `mandatory`, among `table` and `disabled`.

**Evidence:** the owner's v2.2.0-rc.3 check on a Brazil-family PDI, 2026-10-17, which is engagement-local and not
committed, and engineering record 2026-10-19-itsm-sweep, step 0b.
**Engine consequence:** since ARC-09-C183 every create reads the active data policies of its table and the tables it
extends, once per table per session, and refuses a field an unconditional rule requires and the create would not send,
before anything is written. A conditional policy, a field the dictionary defaults and a check it could not make are
noted on the result as `mandatory_fields`. A conditional policy or a business rule can still refuse, which is why the
instance's own text is shown (ARC-09-C176, ARC-09-C182).

## PN-22 — A date-time sent as an ISO string is stored as the date alone

**Applies to:** any date-time field a write sets, e.g. `incident.resolved_at` · Brazil patch 0 · observed on a PDI,
2026-10-19 (ARC-09-C184)
**Behaviour:** `snow_inc_incident_resolve` sent `resolved_at` as `new Date().toISOString()` — `2026-10-19T06:31:…Z`.
The write was accepted, and `resolved_at` was stored as `2026-10-19 00:00:00`. `calendar_stc` came out negative
(−23217) and `calendar_duration` at 1970-01-01 17:33:03, so every duration measured from it is wrong.
**Grounding:** `markdown/api-reference/rest-apis/c_TableAPI.md` (sysparm_input_display_value: an actual value, the
default, "is inserted using the GMT timezone"; "Date fields: The database value is in UTC format") and
`markdown/api-reference/server-api-reference/c_GlideDateTimeScoped.md` ("the internal format (yyyy-MM-dd HH:mm:ss)").
That an ISO string keeps only its date is observed behaviour, not documented.
**Evidence:** engineering record 2026-10-19-itsm-sweep, step 4.
**Engine consequence:** since ARC-09-C184 the server writes a date-time it stamps as `yyyy-MM-dd HH:mm:ss` in UTC
(`glideDateTime()` in the server's `glide-time.ts`): incident and problem resolve, and the scheduled-job
trigger. A date a caller passes is sent as given.

## PN-23 — A close code is the instance's own list

**Applies to:** `incident.close_code` and its choices · Brazil patch 0 · observed on a PDI, 2026-10-19
**Behaviour:** the instance listed 20 active `incident.close_code` choices, and "Solved (Permanently)" was not among them,
although the corpus names it as an example. A resolve with a code the list lacks is not a resolve the instance expects.
**Grounding:** the corpus names "Solved (Permanently)" as a close code
(`markdown/it-service-management/itsm-virtual-agent/itsm-va-fulfiller-topics.md`,
`markdown/it-service-management/now-assist-for-it-service-management-itsm/resolve-incident-now-assist.md`). That this
instance lacks it is observed behaviour.
**Evidence:** engineering record 2026-10-19-itsm-sweep, step 4.
**Engine consequence:** none in the tools. Before a resolve, the Architect reads the active `incident.close_code`
choices from `sys_choice`, does not guess, and asks the user, as it did in the sweep.

## PN-24 — Under `sysparm_display_value=all` every field is an object: the stored value beside its label

**Applies to:** the REST Table API, `GET /api/now/table/<table>` with `sysparm_display_value=all` · observed on a
maintainer's Brazil-family PDI, 2026-10-22
**Behaviour:** every field comes back as `{ "display_value": …, "value": … }`. A reference field adds `link`; its
`value` is the 32-character sys_id and its `display_value` the referenced record's display name. A choice field's
`value` is the stored code and its `display_value` the label. A plain string field carries the same text in both.
**Grounding:** the corpus documents the parameter (`markdown/api-reference/rest-apis/c_TableAPI.md`), not this shape;
the shape is observed behaviour.
**Evidence:** one read-only GET of `incident`, `sysparm_fields=number,state,priority,assignment_group`,
`sysparm_limit=1`, through a 2.2.3-rc.1 install's own client, its output masked to keys, types and lengths
(ARC-09-C205).
**Engine consequence:** `display_value: 'all'` on `snow_core_records_query` and `snow_core_record_read` passes this
shape through unchanged. The stored `value` is the one any query, filter or write uses (ARC-09-C205).

## Windows notes — this repository, not ServiceNow

The notes above are ServiceNow behaviour. These are about the machine the engine runs on, and they
are here because a Windows reader looking for "why is it different on my machine" looks in one
place. Each says how it is known, because two of them are known differently.

**Git Bash is needed for the skills, not for the install.** `bootstrap.cmd` → `bootstrap.ps1` →
`node` uses no POSIX shell at all, and CI proves it by rebuilding PATH without Git Bash before every
Windows launcher run. But Claude Code's own Bash tool *is* Git Bash, and the in-session skills
(`/snowarch status`, `/snowarch setup-instance`) run `./snowarch …` through it — so **Git for
Windows is required for the skills** even though the installer never touches it. It also satisfies
the git ≥ 2.25 floor, which is why the prerequisites table asks for it once.

**PowerShell 5.1, never 7.** 5.1 is what every Windows 10/11 has; requiring 7 would mean requiring
an install before the installer runs. `bootstrap.ps1` is 5.1-clean (no `??`, no ternary, no
`-AsHashtable`) with a test that greps for each and proves the grep is not vacuous, and it carries a
**UTF-8 BOM** — 5.1 decodes a BOM-less file as the ANSI code page, which would turn every `—` and
`·` in the shared sentences into mojibake before a line ran. For the same reason the launcher writes
its JSON through .NET rather than `Set-Content -Encoding UTF8`, which on 5.1 means "UTF-8 *with* a
BOM" and produces files `JSON.parse` refuses.

**Line endings.** `.gitattributes` gives `*.ps1` and `*.cmd` `text eol=crlf`: the index keeps LF and
every checkout converts. A lone LF in a `.cmd` is a batch file that stops at the first line.

**Long paths.** The corpus checkout nests deeply. Windows' 260-character limit applies to the
`MAX_PATH` API, not to git's own operations, and `core.longpaths` is set by Git for Windows'
installer by default — no measured failure, and no action known to be needed. Recorded so that a
future long-path failure is not investigated from scratch.

**What is verified where.** Verified by CI on `windows-latest`, every run: `-ExecutionPolicy Bypass`
working under a Restricted *process* policy; the design-only path with Node **and** Git Bash removed
by rebuilding PATH; exit codes 0/2/3 from `cmd` and from `powershell.exe`; Node reading the state
PowerShell wrote; `snowarch.cmd` with and without Node; and the POSIX launcher under Git Bash
answering `MINGW64_NT` and printing the `winget` remedies rather than `apt`.

Pending the owner's Windows sitting, and recorded in the owner-sitting list (in the engineering checkout) rather than
assumed: the **double-click** experience (the `%CMDCMDLINE%` pause detection is a cmd convention,
not a documented contract), **Ctrl-C** propagation through `cmd` → `powershell` → `node`, a
**GPO-locked** `MachinePolicy` (which no runner can apply), and whether Claude Code expands
`${CLAUDE_PROJECT_DIR}` in `.mcp.json` on native Windows (S-03) — the fallback for which is
deliberately not built until that spike runs.
