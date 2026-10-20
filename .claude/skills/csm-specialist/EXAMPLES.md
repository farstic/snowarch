# CSM Specialist v2.0 — Worked Examples

Three examples exercising each §1.1 verdict path. Each example shows the full 5-Part Constraint Envelope output for a realistic dispatch input. Read these alongside `SKILL.md` to understand the gateway's output format and depth.

---

## Example 1 — Verdict A (Fully Baseline)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"We need work-notes audit trail on customer cases — every change made to a case should be logged with the agent's name, timestamp, and what changed. Show me how to design this."*
**Module:** CSM
**Workspace:** CRM Workspace (formerly CSM Configurable Workspace)
**Volume:** ~50K cases/year, ~3K active concurrent
**Sensitivity:** PII (customer contact details on cases)

### Gateway Response

```markdown
# CSM Specialist Gateway Response

**Request:** Implement an audit trail on customer cases capturing agent, timestamp, and changed fields.
**Domain Expert:** CSM Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

ServiceNow CSM cases extend `task`, which inherits the platform's audit history machinery. The OOB audit flow for a `sn_customerservice_case` record is:

1. **User opens case in CRM Workspace** — case form renders with `work_notes`, `comments`, and activity stream populated from `sys_journal_field` and `sys_history_set`.
2. **Agent makes a change** — any field write fires the dictionary's audit flag (`sys_dictionary.audit = true`) and writes a row to `sys_history_set` + `sys_history_line` capturing old value, new value, who, and when.
3. **Agent adds a work note** — appends to `case.work_notes` journal; the activity stream renders it with agent name, timestamp, and the work-note body.
4. **Activity stream rebuild** — the case form's activity-stream formatter (baseline UI formatter) reads from `sys_journal_field` + `sys_history_set` and renders the chronological audit log.

Baseline notifications fire on key state transitions but are not required for this audit-trail requirement.

(citation: markdown/customer-service-management/csm-case-management.md, markdown/now-platform/index.md for audit history)

## Part 2 — Data Model Alignment

**Primary baseline table:** `sn_customerservice_case` (extends `task` parent)

**Critical baseline fields:**

| Field | Type | Purpose |
|---|---|---|
| `sn_customerservice_case.work_notes` | Journal | Internal agent notes; appended-only, agent-stamped |
| `sn_customerservice_case.comments` | Journal | Customer-visible communication |
| `task.sys_updated_on` | DateTime | Last update timestamp (inherited) |
| `task.sys_updated_by` | String | Last update user (inherited) |

**Related baseline tables in scope:**

- `sys_history_set` — one row per record-update event
- `sys_history_line` — one row per field change within a `sys_history_set` event
- `sys_journal_field` — `work_notes` and `comments` content
- `sys_audit` — field-level audit when `sys_dictionary.audit = true`

**Baseline reference fields:** no reference qualifiers material to this requirement.

(citation: markdown/now-platform/index.md, markdown/customer-service-management/csm-data-management.md)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: A — Fully covered by baseline.**

The audit-trail requirement is fully satisfied by three baseline constructs:

1. **`work_notes` journal field** on `sn_customerservice_case` — captures agent commentary, timestamped, attributed.
2. **`sys_history_set` + `sys_history_line`** — captures field-level changes (old value, new value, who, when) whenever auditing is enabled on the dictionary entry.
3. **Activity stream formatter** on the case form — renders the combined timeline natively in CRM Workspace.

No custom object needed. No new table. No new field. Pure configuration: ensure `sys_dictionary.audit = true` on the fields the engagement wants to audit (typically all of: `state`, `assigned_to`, `priority`, `category`, `account`, `contact`, `consumer`, `contract`, `entitlement`).

(citation: markdown/now-platform/index.md for audit history)

## Part 4 — Routing Recommendation

**PROCEED — baseline configuration only.**

No Technical Designer dispatch needed. The configuration path:

1. Confirm field-level audit flags in `sys_dictionary` for the fields the engagement wants to track. Typically baseline already audits `state`, `assigned_to`, `priority`; verify and extend as needed.
2. Confirm the activity-stream formatter is enabled on the case form in CRM Workspace (baseline behaviour; verify it has not been removed in form layout).
3. If a structured *export* of the audit trail is needed (e.g., for compliance reporting), use a report or a Performance Analytics indicator over `sys_history_set`. No custom storage needed.

Consult flags: none fire for this request. PII is present on the case form, but baseline ACLs on `sn_customerservice_case` already enforce read/write rules for agent vs customer roles — no architectural security work needed.

## Part 5 — Anti-Patterns to Block

If Technical Designer or Developer is invoked downstream for unrelated work on this case form, block these:

- **Do not create a custom audit table** (`u_case_audit`, `x_acme_csm_case_audit`, etc.). Baseline `sys_history_set` covers field-level audit; baseline `work_notes` covers commentary. Custom audit table is a §1.1 violation.
- **Do not duplicate audit-write logic in a Business Rule.** Field auditing is handled by the platform when `sys_dictionary.audit = true` — a custom BR that writes audit rows on update is redundant and risks doubled rows.
- **Do not write a custom activity-stream renderer.** Baseline UI formatter handles this. Replacing it loses the platform's evolution path (UI Builder, Next Experience).
- **Do not query `sys_history_set` with deep joins in a Script Include** without indexing review. On high-volume case tables this becomes a performance trap. Use the baseline `GlideRecordHistoryWalker` API or built-in audit reports.

## Open Questions

None. Requirement is fully satisfied by baseline configuration.

---

*End of CSM Specialist Gateway Response.*
```

---

## Example 2 — Verdict B (Baseline Extension)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"We need to add a 'customer journey stage' on every customer service case — onboarding, adoption, expansion, renewal, churn. Agents should set it on case create; we want to report on case volume per stage."*
**Module:** CSM
**Workspace:** CRM Workspace
**Volume:** ~80K cases/year
**Sensitivity:** Internal CRM data, not PII

### Gateway Response

```markdown
# CSM Specialist Gateway Response

**Request:** Add a "customer journey stage" attribute on customer service cases with five values for reporting.
**Domain Expert:** CSM Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

`sn_customerservice_case` is the baseline CSM case table. The OOB flow:

1. **Case create** — agent or auto-create from email/chat/portal. Form renders fields from baseline `sn_customerservice_case` and `task` parent.
2. **Case categorisation** — agent sets `category`, `subcategory`, `priority`, `account`, `contact`/`consumer`, `contract`, `entitlement`.
3. **Case work** — state transitions through `1` New → `10` Open → `18` Awaiting Info → `6` Resolved → `3` Closed *(citation: `markdown/api-reference/rest-apis/case-api.md`)*.
4. **Reporting** — Performance Analytics indicators and reports run against `sn_customerservice_case` and join to `customer_account` for customer-segment analysis.

The proposed "customer journey stage" is a **dimension** of the case record itself, not a new entity. It belongs on the case, not in a separate table.

(citation: markdown/customer-service-management/csm-case-management.md)

## Part 2 — Data Model Alignment

**Primary baseline table:** `sn_customerservice_case` (extends `task`)

**Existing baseline fields that are NOT a fit for "journey stage":**

| Field | Why not |
|---|---|
| `sn_customerservice_case.state` | Lifecycle state, not customer journey |
| `sn_customerservice_case.priority` | Severity, not journey |
| `sn_customerservice_case.category` | Issue type (e.g., billing, technical), not journey |
| An account-level lifecycle stage on `customer_account` (not documented in the bundled corpus — verify on the instance) | This lives on the *account*, not the case. Cases inherit account context but the request is per-case journey, which may differ from account-level stage. |

**Critical baseline fields to respect:** `account`, `contact`, `consumer`, `state`, `priority`, `category` — all already exist and the journey-stage field must not conflict with their semantics.

**Related baseline tables:** `customer_account` for account-level context; `ast_contract` for contract-stage context (its State, Starts and Ends) *(citation: `markdown/customer-service-management/r_BRIWCustomerService.md`, `markdown/customer-service-management/create-csm-service-contracts.md`)*.

(citation: markdown/customer-service-management/configure-csm-accounts-contacts.md)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: B — Requires baseline extension.**

The smallest viable extension:

**Add a single Choice field on baseline `sn_customerservice_case`.**

- **Field name:** `sn_customerservice_case.u_customer_journey_stage` (engagement scope prefix per engagement convention; field type Choice)
- **Choice values:** `onboarding` / `adoption` / `expansion` / `renewal` / `churn`
- **Mandatory:** No (agent may leave blank on case create if unknown; populate on next-touch)
- **ACL:** Inherits `sn_customerservice_case` field ACL — no new ACLs required.
- **Reporting:** Add to case-list view in CRM Workspace; Performance Analytics indicator `Cases by Customer Journey Stage` straightforward to define.

(citation: markdown/customer-service-management/csm-data-management.md)

**Why this is Verdict B, not Verdict A:**

The five values map a *new dimension* that does not exist on `sn_customerservice_case` today. Reusing `category` would collide with issue-type semantics and break existing reports. Reusing `state` would collide with case-lifecycle semantics. The smallest possible extension is one Choice field on the baseline table — no new table, no new scoped app, no state-machine change.

**Why this is Verdict B, not Verdict C:**

A new field on a baseline table is the smallest-scope custom object per §1.1's preference hierarchy (top of the list). It is not a new table, not a new scoped app, not a new Connection Alias, not a state extension on a baseline state field. It is the minimum-viable customisation, which §1.1 accepts at routing-time without halting — provided the Chief Architect approves the field name and engagement-scope conventions.

(citation: markdown/customer-service-management/csm-data-management.md — case data model)

## Part 4 — Routing Recommendation

**PROCEED — dispatch to Technical Designer with constraints.**

Technical Designer's deliverable should include:

1. **Field definition** — `u_customer_journey_stage` (Choice, 5 values), mandatory=No, default=blank.
2. **Form layout update** — surface the field in CRM Workspace case form, near `account` / `contract` (customer-context cluster).
3. **List view update** — add column to baseline case list view (engagement default view).
4. **Choice population** — populate `sys_choice` records for the five values.
5. **Reporting note** — direction to Reporting & Analytics for the indicator (not Technical Designer's deliverable).
6. **No new ACLs** — explicitly note that field ACLs inherit from `sn_customerservice_case`.
7. **No code** — this is pure configuration. No Developer dispatch needed unless agents request auto-population logic, in which case a small Business Rule is acceptable and would route through Developer + Code Reviewer.

Consult flags:

- **Reporting & Analytics Specialist** — for the Performance Analytics indicator definition (downstream, not blocking).

## Part 5 — Anti-Patterns to Block

- **Do not create a `u_customer_journey` child table.** One field on the baseline table is enough; a child table is an over-design and a §1.1 escalation.
- **Do not put the journey stage on `customer_account` instead of the case.** Account-level journey is a separate concern; cases within one account can sit at different journey points (a churned customer can still have open support cases).
- **Do not extend `sn_customerservice_case.state` with new state values for journey stages.** State is lifecycle; journey is a dimension. Conflating them breaks SLA definitions and case-flow reports.
- **Do not duplicate journey logic in a Business Rule that writes to a new table.** A Choice field is enough; if auto-population is needed, the BR writes to `u_customer_journey_stage` on the same case record.
- **Do not name the field with a global prefix** if engagement convention uses scope prefix `x_acme_*` — coordinate with App Engine Specialist on naming.

## Open Questions

OQ-EV-1. **Engagement field-naming convention** — is `u_customer_journey_stage` correct? On `sn_customerservice_case` the platform names a new field by where it is created: in the table's own scope it takes no prefix, so `u_` there is the engagement's mark for a custom field; created from global, the platform adds `u_`; from a scoped app, that app's namespace, `x_<vendor>_<app>_customer_journey_stage` *(citation: `markdown/platform-administration/table-administration-and-data-management/r_DictionaryEntryForm.md`)*. Confirm with Chief Architect before Technical Designer dispatches.
OQ-EV-2. **Auto-population** — should the field auto-populate from an account-level lifecycle stage, if the engagement's release has one? Such a field on `customer_account` is not documented in the bundled corpus — verify on the instance before design.
OQ-EV-3. **Choice value localisation** — does the engagement need localised choice labels? Affects sys_choice record design.

---

*End of CSM Specialist Gateway Response.*
```

---

## Example 3 — Verdict C (§1.1 Halt)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"We need a separate 'case escalation' table for our CSM cases. Each escalation should track from-tier, to-tier, reason code, business-impact summary, and stakeholder list. We need a related list on the case form with full escalation history. Build the table and the Script Include that creates an escalation record when the agent clicks an Escalate button."*
**Module:** CSM
**Workspace:** CRM Workspace
**Volume:** ~80K cases/year, ~10% escalate at least once (~8K escalation events/year)
**Sensitivity:** Customer escalations include business-impact statements (potentially commercially sensitive)

### Gateway Response

```markdown
# CSM Specialist Gateway Response

**Request:** Create a custom case-escalation table with structured fields, a related list on the case form, and a Script Include that writes an escalation record when the agent clicks an Escalate button.
**Domain Expert:** CSM Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

The baseline case and account escalation feature does what the request describes:

1. **Escalate.** "Users with the escalation requester role can escalate a case or account": the agent opens the case, clicks the **Escalate Case** related link and fills in the Escalation form *(citation: `markdown/customer-service-management/escalate-csm-case.md`)*.
2. **The Escalation record** carries the Reason (for example "Inactivity" or "Lack of Progress"), the Escalation Justification — "additional information that explains why this escalation is needed" — the Escalation Severity, the Escalation Type and a Watch List *(citation: `markdown/customer-service-management/case-escalation-form.md`)*.
3. **State.** The record is Requested, then Escalated or Declined; de-escalating it closes it *(citations: `markdown/customer-service-management/case-escalation-form.md`, `markdown/customer-service-management/de-escalate-csm-case.md`)*.
4. **Notification and history.** Users on the watch list receive email notifications, and "for case escalations, updates are replicated to the case activity history as work notes so they aren't visible to the customer" *(citation: `markdown/customer-service-management/case-escalation-form.md`)*.
5. **On the case form,** "the case or account form for the source record includes an **Escalations** related list" *(same citation)*.
6. **Templates and severities** shape the escalation; a template can add the case assignment group's manager to the approvers *(citation: `markdown/customer-service-management/create-escalation-template.md`)*.

## Part 2 — Data Model Alignment

**Primary baseline table:** Escalations [`sn_customerservice_escalation`] — "Stores records created for escalated cases and accounts" — with Escalation Templates [`sn_customerservice_escalation_template`] and Escalation Severity [`sn_customerservice_escalation_severity`] *(citation: `markdown/customer-service-management/case-escalation-components.md`)*. The case, `sn_customerservice_case` (extends `task`), keeps its own state.

| The request asks for | Baseline home |
|---|---|
| "a separate 'case escalation' table" | the Escalation record, one per escalation of a case |
| "reason code" | Reason |
| "business-impact summary" | Escalation Justification |
| "stakeholder list" | Watch List |
| "a related list on the case form with full escalation history" | the case form's Escalations related list, each record with its state; its updates replicated to the case's work notes |
| "the Script Include that creates an escalation record when the agent clicks an Escalate button" | the **Escalate Case** related link creates the record — no Script Include |
| "from-tier, to-tier" | no field on a case escalation: the escalation's Assignment group is "for account escalations" — OQ-EV-1 |

## Part 3 — §1.1 Baseline-First Verdict

**Verdict C — the request names a custom table ("a separate 'case escalation' table"), and the §1.1 halt fires.** Part 2's finding — the baseline case and account escalation feature covers the request — is the OPEN QUESTION's recommendation, not a different verdict.

```
🚨 OPEN QUESTION — CUSTOM OBJECT PROPOSAL (§1.1 Blocking)

Before any specialist may be dispatched, §1.1 requires honest evaluation of baseline alternatives. This proposal halts dispatch until Chief Architect direction is received.

1. Baseline option evaluated [citations REQUIRED]:

   The case and account escalation feature: the Escalate Case related link, the Escalation record with its Reason, Escalation Justification, Escalation Severity and Watch List, the case form's Escalations related list, and its updates replicated to the case's work notes.
      - Covers: the record, the reason, the business-impact summary, the stakeholders, the related list with the history, and the Escalate button.
      - Falls short: no field for "from-tier, to-tier" on a case escalation (OQ-EV-1).
      - Citations: markdown/customer-service-management/case-escalation-form.md, markdown/customer-service-management/escalate-csm-case.md

2. Custom object proposed (smallest viable scope):

   - Object: the separate "case escalation" table the request names — `sn_customerservice_case_escalation` (proposed — not baseline; a table in the `sn_customerservice` scope begins with that namespace *(citation: `markdown/application-development/r_ExampleNamespaceIdentifiers.md`)*).
   - Kind and place in the §1.1 hierarchy: a new table extending a baseline table, in the baseline `sn_customerservice` scope — the "acceptable" rung.
   - What it would hold, in the request's words: "from-tier, to-tier, reason code, business-impact summary, and stakeholder list", shown as "a related list on the case form with full escalation history".
   - Rejected as unnecessary: the baseline Escalation record holds all of it but the tiers, and the tiers are OQ-EV-1.

3. Consequences of approval:
   - **Data model:** a second escalation store beside the baseline Escalation record; the Escalate Case related link and the escalation states would not reach it.
   - **Support cost:** a custom form, related list and Script Include to maintain, where the feature ships its own.
   - **Licensing:** the table consumes a custom table entitlement of the subscription it is mapped to *(citation: `markdown/platform-administration/allocating-custom-tables-subscr-apps-v2.md`)*.
   - **Security & GRC:** business-impact statements can be commercially sensitive — the consult fires either way.

4. Alternatives if rejected:
   - **Recommended:** the baseline escalation feature — escalation templates and severities configured for the engagement, and the escalation requester role given to the agents who escalate.
   - **For the tiers:** OQ-EV-1's default.

Decision required from Chief Architect before any specialist is dispatched.
```

## Part 4 — Routing Recommendation

**HALT — §1.1: the request names a custom table.**

No specialist is dispatched until the Chief Architect rules. Options:

- **Reject in favour of the baseline escalation feature (recommended).** Configure the templates, severities and requester roles; no table and no Script Include. Security & GRC consult on the Escalation Justification content.
- **Approve the table as requested.** Re-dispatch the CSM Specialist with the approval in the envelope; the Security & GRC and Licensing & Entitlement consults fire before Technical Designer.

## Part 5 — Anti-Patterns to Block

- **Do not build a custom escalation table.** The Escalation record [`sn_customerservice_escalation`] is baseline in Australia *(citation: `markdown/customer-service-management/case-escalation-components.md`)*.
- **Do not write a Script Include and a UI Action to create escalation records.** The Escalate Case related link does it *(citation: `markdown/customer-service-management/escalate-csm-case.md`)*.
- **Do not copy escalation updates into the case's work notes by script.** The feature replicates them *(citation: `markdown/customer-service-management/case-escalation-form.md`)*.
- **Do not add an "Escalated" state to the case.** The Escalation record carries the escalation's state; the case keeps its baseline state.
- **Do not skip the Security & GRC consult on the Escalation Justification.** Customer business-impact statements can be commercially sensitive.

## Open Questions

OQ-EV-1. **OPEN QUESTION: from-tier and to-tier.** Are the tiers severity levels or support teams? **Proposed default:** the Escalation Severity for the level; a move between teams is the case's own reassignment, kept in its history. Confirm with the business which one they mean.
OQ-EV-2. **Requester roles.** Who holds `sn_customerservice.escalation_requester`, and who de-escalates with `sn_customerservice.deescalation_requester`? *(citations: `markdown/customer-service-management/escalate-csm-case.md`, `markdown/customer-service-management/de-escalate-csm-case.md`)*
OQ-EV-3. **Templates and approvals.** Which escalation templates does the engagement need, and does an escalation need approval? A template can add the case assignment group's manager to the approvers *(citation: `markdown/customer-service-management/create-escalation-template.md`)*.

---

*End of CSM Specialist Gateway Response.*
```

---

## Reading these examples

- **Example 1 (Verdict A)** — pattern for the most common request type. The Domain Expert proves baseline covers it and the build chain is short-circuited. PROCEED — baseline configuration only. No Technical Designer dispatch.
- **Example 2 (Verdict B)** — pattern for legitimate baseline extensions. One field on a baseline table. §1.1 accepts this at the smallest scope. PROCEED — Technical Designer dispatch with envelope as constraints.
- **Example 3 (Verdict C)** — pattern for a §1.1 halt on a named object. The request names a custom table, so the verdict is C; Part 2 finds the baseline case and account escalation feature covers it, and the halt recommends that feature. The one gap, the tiers, is an open question with a proposed default. HALT — wait for decision.

The §6.2 post-build review fires after Technical Designer returns a spec for Verdict B and Verdict C (approved) cases. The Domain Expert re-validates the spec against the envelope before Developer is dispatched. Post-build review examples are not included in this file — they are short reviews following the four-check structure in `SKILL.md`.

---

*End of CSM Specialist EXAMPLES.md v2.0.*
