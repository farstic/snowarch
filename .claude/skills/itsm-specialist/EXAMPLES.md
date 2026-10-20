# ITSM Specialist v2.0 — Examples

Three gold-standard examples of ITSM Specialist gateway output. One per §1.1 verdict (A — fully baseline, B — baseline extension, C — §1.1 halt). Each example shows the input dispatch envelope, the full 5-Part Constraint Envelope produced, and an explanation of why each choice was made.

---

## Example 1 — Verdict A (Fully Baseline)

### Input dispatch envelope

> **Domain Expert dispatch — ITSM Specialist gateway**
>
> **Request:** "We need to escalate P1 and P2 incidents to the on-call duty manager if they're not acknowledged within 15 minutes. The escalation should email the duty manager and add a work note explaining the escalation."
>
> Module: ITSM
> Volume: ~500K incidents/year, ~50K active concurrent
> Sensitivity: standard ITSM (no PII beyond caller name and email)
> Engagement: Acme — uses baseline `cmn_rota` for on-call, has `Major Incident Management` plugin active, no current state-model customisations.
> Release family: Australia

### Expected gateway output

```markdown
# ITSM Specialist Gateway Response — P1/P2 incident escalation to on-call duty manager on 15-min no-acknowledgement

## Part 1 — OOB Process Map

This request touches three core baseline ITSM processes: incident lifecycle, on-call coordination, and baseline notifications.

### Incident lifecycle (relevant subset)

- `incident.priority` is set to 1 (Critical) or 2 (High) by Data Lookup Definition keyed on `impact` and `urgency` at insert time.
- `incident.assignment_group` is set by baseline assignment rules, also fired at insert.
- `incident.state` transitions through New (1) → In Progress (2). The "not acknowledged" condition maps to "state remains New and `assigned_to` is not populated, or `assigned_to` is populated and the assignee has added nothing to `work_notes`".
- *(citation: `markdown/it-service-management/incident-management/reference-section-for-incident-management.md`)*

### On-call coordination

- The on-call engineer for an assignment group at any point in time is resolved via `cmn_rota_roster` (active member of the rotation defined in `cmn_rota`).
- The baseline `OnCallRotation` Script Include's `whoIsOnCall(groupSysIds, rotaSysIds, rosterSysIds, gdt)`, called on an instance (`new OnCallRotation()`), gets the users on call at a given time *(citation: `markdown/api-reference/server-api-reference/c_OnCallRotationAPI.md`)*.
- In baseline on-call scheduling a shift typically has one roster per escalation level (primary, secondary, tertiary), so the duty manager sits on a later level's roster; the shift manager (`rota_manager` role) may or may not be a roster member. Names such as "On-Call Engineer" and "On-Call Manager" are the engagement's own, not baseline values.
- *(citation: `markdown/it-service-management/on-call-scheduling/c_OnCallSchedulingConcepts.md`)*

### Baseline notifications

- Baseline ServiceNow notification records on `incident` include "Incident Opened", "Incident Commented", "Incident Resolved" and "Incident Closed" *(citation: `markdown/platform-administration/r_BaselineEmailNotifications.md`)*; a major incident notification's name is not documented in the bundled corpus — verify on the instance. The escalation notification in this request is **not** in the baseline set — but the mechanism (a notification record with a condition and a `Send to` resolution script) is baseline.
- *(citation: `markdown/platform-administration/c_EmailNotifications.md`)*

## Part 2 — Data Model Alignment

| Table | Action | Critical fields |
|---|---|---|
| `incident` | Read only — no extension required | `priority` (1–5), `state` (1–7), `assignment_group` (ref to `sys_user_group`), `assigned_to` (ref to `sys_user`), `sys_created_on` (used for 15-min timer), `work_notes` (used for escalation audit) |
| `sys_user_group` | Read only | `manager` (the static manager field — *not* the on-call duty manager) |
| `cmn_rota` | Read only — pre-existing in engagement | `group` (FK to `sys_user_group`) |
| `cmn_rota_roster` | Read only — resolved at runtime | `member` (FK to `sys_user`), `rotation` (FK to `cmn_rota`), active time block |
| `sys_journal_field` | Write via `current.work_notes.setJournalEntry()` — baseline audit | `value`, `sys_created_by`, `sys_created_on` |
| Baseline notification record | New record, no table extension | `name`, `table`, `when`, `condition`, `Send to`, `message_html` |

No new tables. No new scoped app. No new state values. No new Connection Aliases. No new sys_user_group structures.

*(citation: `markdown/it-service-management/incident-management/reference-section-for-incident-management.md`, `markdown/it-service-management/on-call-scheduling/c_OnCallSchedulingConcepts.md`)*

## Part 3 — §1.1 Baseline-First Verdict

**Verdict A — Fully covered by baseline.**

The escalation requirement is fully satisfied by combining four baseline constructs:

1. **A scheduled job** that runs every 5 minutes scanning `incident` for `priority IN 1,2 AND state=1 AND sys_created_on < 15 minutes ago AND <no work_notes entry from assigned_to>` — or a baseline inactivity monitor (**System Policy > SLA > Inactivity Monitors**), which fires `incident.inactivity` when the incident stays inactive for the set time *(citation: `markdown/platform-administration/time-configuration/t_SetAnInactivityMonitor.md`)*.
2. **Baseline `OnCallRotation` Script Include** to resolve the on-call duty manager for the incident's assignment group at the moment of escalation.
3. **A baseline notification record** with: table = `incident`, when = "Event is fired", event = a custom event named for the record and the action, as baseline events are *(citation: `markdown/build-workflows/system-events/events.md`)*, like `incident.escalated.duty.manager`, condition = the 15-min/no-ack predicate, recipient = the resolved on-call duty manager. The event is fired from the scheduled job.
4. **A `work_notes` append** by the scheduled job, written via `gr.work_notes = "Escalated to duty manager <name> — no acknowledgement within 15 min of creation"`.

No custom tables. No new scope. No state-machine changes.

The "custom event name" (`incident.escalated.duty.manager`) is **not** a §1.1 concern — events are baseline platform infrastructure, registered via the `sysevent_register` table which is baseline. Adding an event is configuration, not a custom architectural object.

## Part 4 — Routing Recommendation

**PROCEED — dispatch to Technical Designer with constraints.**

Technical Designer receives this envelope and produces:
- The Scheduled Job definition (name, schedule, condition script).
- The baseline notification record (name, condition, Send to script, message_html template).
- The event registration.
- The Script Include if the scheduled job's logic is more than a few lines.

Downstream of Technical Designer, Developer implements the Scheduled Job's server script and (if needed) the Script Include. Post-build, ITSM Specialist re-fires for the §6.2 review, and Code Reviewer fires for the code.

## Part 5 — Anti-Patterns to Block

The following are explicitly blocked in any downstream design:

- **Do not create a custom escalation table per priority tier.** The `cmn_rota` + on-call resolution pattern handles this. *(citation: `markdown/it-service-management/on-call-scheduling/c_OnCallSchedulingConcepts.md`)*
- **Do not extend `incident.state` with a new "Escalated" value.** Escalation is an event, not a state — the incident remains in New or In Progress. *(citation: `markdown/it-service-management/incident-management/reference-section-for-incident-management.md`)*
- **Do not duplicate the baseline assignment-rule logic in the scheduled job.** The scheduled job reads `assignment_group` from the incident; it does not re-route. *(citation: `markdown/it-service-management/incident-management/t_DefinAnAssignRuleIncidents.md`)*
- **Do not hardcode the duty-manager rotation sys_id in the scheduled job.** Resolve at runtime via `new OnCallRotation().whoIsOnCall()` or externalise to a system property if a default fallback is needed.
- **Do not write the work note in a custom audit table** — use `incident.work_notes`. This is a §1.1 hot spot; the work_notes journal is the baseline audit for state changes and operational events. *(citation: `markdown/platform-security/audit-mgmt-console.md`)*
- **Do not query `task_sla.stage='completed'` if SLA tracking is added** — baseline value is `complete` without the -ed. (Defensive — relevant if Technical Designer adds SLA-aware logic.)

## Open Questions

OQ-EV-1. **Duty manager resolution.** The baseline `cmn_rota` typically defines a single on-call engineer. Confirm whether the engagement has a separate `cmn_rota` rotation specifically for "Duty Manager", or whether the duty manager is the on-call engineer's escalation contact (in which case the rotation needs a second tier configured).
OQ-EV-2. **Acknowledgement definition.** "Not acknowledged within 15 minutes" — does "acknowledged" mean `state=2 (In Progress)`, or `assigned_to is set`, or "`assigned_to` has added to `work_notes`"? The three are subtly different. Recommend defaulting to "assigned_to is set AND state transitioned out of New (state != 1)".
OQ-EV-3. **15-minute timer reference point.** From `sys_created_on` of the incident, or from the moment it was first assigned? Defaulting to `sys_created_on` if no assignment SLA is active.
OQ-EV-4. **Re-escalation behaviour.** If the duty manager doesn't ack within another 15 minutes, escalate further? Out of scope unless specified.
```

### Explanation

Verdict A is the most common verdict for ITSM requests — ITSM has unusually rich baseline coverage and most "escalation", "routing", "priority matrix" requests are configuration tasks, not custom-development tasks. The envelope demonstrates:

- **Part 1's rigorous coverage** of three baseline processes (incident, on-call, notifications) so Technical Designer knows what's already there.
- **Part 2's explicit "no new tables, no new scope"** — the §1.1 enforcement statement is upfront, not hidden.
- **Part 3's Verdict A rationale** decomposes the request into four baseline constructs, with citations for each.
- **Part 4's routing** sends to Technical Designer (because the design has multiple moving parts) but flags that the design itself is configuration-shaped.
- **Part 5's anti-pattern list** includes the "do not create a custom escalation table" pattern explicitly — even though Technical Designer hasn't started yet, the constraint is documented so the §6.2 post-build review can flag violations cleanly.

The Open Questions are real — the request as written has ambiguity in three places. Surfacing them upstream prevents Technical Designer from making silent default choices that the user might disagree with later.

---

## Example 2 — Verdict B (Baseline Extension)

### Input dispatch envelope

> **Domain Expert dispatch — ITSM Specialist gateway**
>
> **Request:** "We need to track 'business severity' separately from technical severity on incidents. Business severity is set by the Service Owner and reflects revenue/customer impact. It should drive escalation timing, not technical priority."
>
> Module: ITSM
> Volume: ~200K incidents/year
> Sensitivity: standard ITSM
> Engagement: BankCo — Service Owners are a defined role (`u_service_owner`, BankCo's own global role), Service Owners are already mapped to `cmdb_ci_service` records via a custom group structure. No current customisations to the Priority or Impact fields of `incident`.
> Release family: Australia

### Expected gateway output

```markdown
# ITSM Specialist Gateway Response — Business severity tracking on incidents, distinct from technical priority

## Part 1 — OOB Process Map

This request touches incident lifecycle, priority/impact handling, and Service-Owner role gating. It does **not** touch on-call or SLA directly (though business severity could feed into SLA design downstream — that's a separate consideration).

### Incident priority handling (baseline)

- Baseline `incident.priority` is a 1–5 derived field, calculated from `incident.impact` (1–3) and `incident.urgency` (1–3) via the baseline Data Lookup Definition `Priority Lookup` (which can be reconfigured per engagement).
- Both `impact` and `urgency` are choice fields with baseline labels: Impact = High/Medium/Low, Urgency = High/Medium/Low.
- *(citation: `markdown/it-service-management/incident-management/reference-section-for-incident-management.md`)*
- *(citation: `markdown/it-service-management/incident-management/def-prio-lookup-rules.md`)*

The request introduces a new dimension — "business severity" — that is conceptually adjacent to `impact` but driven by a different role (Service Owner) and a different signal (revenue/customer impact rather than technical impact). This does **not** map cleanly to `impact` or `urgency`.

### Service Owner role and `cmdb_ci_service` linkage

- Baseline `incident.cmdb_ci` references the configuration item the incident is logged against.
- The engagement has Service Owners mapped to `cmdb_ci_service` records via an existing group structure (per dispatch envelope) — so the resolution path "incident → cmdb_ci → service → Service Owner" is already in place.

## Part 2 — Data Model Alignment

| Table | Action | Reasoning |
|---|---|---|
| `incident` | **Add one new field** — `u_business_severity` (Integer or Choice) | Smallest possible scope per §1.1 hierarchy. A new field on a baseline table is the preferred extension. |
| `cmdb_ci_service` | Read only — no extension needed | Service Owner resolution path is already in place. |
| `sys_user_grmember` | Read only | Service Owner group membership lookup. |
| Baseline business rule on `incident` | New record (configuration, not extension) | To restrict who can update `u_business_severity` to Service Owners. |
| ACL rule on `incident.u_business_severity` | New record (configuration, not extension) | Same role-gating intent — UI-level enforcement complements server-side BR. |

**Field design (Verdict B proposal):**

```
Field name:      u_business_severity
Field label:     Business Severity
Type:            Choice (Integer 1–4)
Choices:         1 - Critical (Revenue stoppage)
                 2 - High (Major customer impact)
                 3 - Medium (Single-tenant degradation)
                 4 - Low (Cosmetic or no customer impact)
Default value:   4
Mandatory:       false (not all incidents need business severity assessment)
```

The `u_` prefix is the engagement's convention for non-scoped custom fields on baseline tables. The dispatch envelope didn't specify scoped app vs. global; given this is a single field on a baseline table without complex logic attached, baseline scope + `u_` prefix is the standing pattern — confirm with engagement standards in Open Questions.

*(citation: `markdown/it-service-management/incident-management/reference-section-for-incident-management.md` for the incident data model that we are extending)*

## Part 3 — §1.1 Baseline-First Verdict

**Verdict B — Requires baseline extension.**

### Baseline option evaluated and why it falls short

| Baseline option | Why it falls short |
|---|---|
| **Reuse `incident.impact`** | `impact` is technical impact (system availability), not business impact (revenue). Mixing them blurs reporting and confuses ITIL practitioners. |
| **Reuse `incident.urgency`** | `urgency` is "how quickly does this need to be resolved" — a technical-process concept. Business severity is not about resolution speed, it's about revenue/customer-impact assessment. |
| **Compound priority field** | The baseline `Priority Lookup` already takes two dimensions. Adding a third dimension to the lookup would force every existing `impact`/`urgency` combination to be re-evaluated with a third axis — not a minor change, and changes baseline `priority` semantics globally. |
| **Use `incident.business_impact` (Australia release family note)** | This field **does not exist** as a baseline integer on `incident` in Australia. The MIM workbench has a separate `incident.business_impact` field but it's a string narrative, not a structured severity. Not suitable for driving escalation timing logic. *Citation availability: limited — verify against engagement's instance.* |
| **Use a related Service Owner attestation table** | This would be a new table, which is a more invasive extension than a single field. Violates the §1.1 preference hierarchy. |

The smallest viable extension is **a new integer/choice field on the baseline `incident` table**.

### Custom object proposed (smallest possible scope)

- **One new field on `incident`:** `u_business_severity` (Choice, 1–4).
- **One new ACL** restricting write to Service Owners.
- **One new Business Rule** (server-side enforcement, complements ACL).
- **One Data Lookup Definition** mapping `u_business_severity` to an escalation timing parameter (a system property or a `sys_choice` value the scheduled-job pattern from Example 1 can read).

No new tables. No new scoped app. No new state values. The "extension" is a column addition on a baseline table.

### Consequences of approval

- **Data model:** `+1 field` on `incident`. Backfill consideration — existing ~200K incidents will have `u_business_severity` = NULL until a backfill script or accept-NULL-as-implicit-Low policy is decided.
- **Deployment:** No new update set or scoped app required. Goes in the engagement's existing customisation update set.
- **Support cost:** Service Owners need training on the field and its meaning. Minor.
- **Platform-upgrade risk:** Low. `u_` prefix isolates from baseline-field naming. Upgrade-safe.

### Alternatives if rejected

- **Degraded design:** Use `incident.urgency` for business severity, document the semantic deviation in operational documentation, accept that ITIL purists will object. (Not recommended — creates reporting confusion.)
- **Deferred functionality:** Document business severity in `work_notes` only ("Business severity: Critical — revenue stoppage observed"), no structured field. Loses queryability and reporting.
- **Out-of-band tracking:** Track business severity in a spreadsheet or external system, reconcile manually. Loses tight coupling to incident lifecycle.

## Part 4 — Routing Recommendation

**PROCEED — dispatch to Technical Designer with constraints.**

Technical Designer receives this envelope and produces:
- The full field-extension spec for `incident.u_business_severity` (type, label, choices, default, mandatory).
- The ACL rule (target table=`incident`, field=`u_business_severity`, operation=write, role=Service Owner role, condition=Service Owner is mapped to this incident's `cmdb_ci`).
- The Business Rule (server-side enforcement, same logic as ACL but as a defensive layer).
- The Data Lookup Definition (`u_business_severity` → escalation timing parameter).
- The escalation scheduled job (combined with the Example 1 pattern if both are active).

## Part 5 — Anti-Patterns to Block

- **Do not create a custom `business_severity_log` table** to track changes to the field. `sys_history_set` baseline audit captures field-level changes on `incident` automatically when field auditing is enabled in the dictionary. *(citation: `markdown/platform-security/audit-mgmt-console.md`)*
- **Do not reuse `incident.impact` or `incident.urgency`** for business severity. The two ITIL dimensions are well-defined; conflating them with revenue-impact causes long-term reporting confusion.
- **Do not extend `incident.priority` directly** — `priority` is derived. Extending it would require modifying the Data Lookup Definition globally and risk breaking baseline reports and Performance Analytics indicators.
- **Do not hardcode the Service Owner role name** in the ACL condition — reference the role via name lookup or sys_id with a comment explaining why.
- **Do not implement Service Owner resolution as a custom Script Include** if the engagement already has a working "incident → cmdb_ci → service → Service Owner" path. Reuse it.
- **Do not skip backfill consideration** — Technical Designer must decide the strategy (NULL = implicit Low, vs explicit backfill script).

## Open Questions

OQ-EV-1. **Scope convention.** The proposal uses `u_` prefix on a baseline-scope field. Confirm whether the engagement has a standing rule for `u_` vs scoped-app custom fields. If a scoped app is preferred, the field takes the app's namespace in place of `u_`, `x_<vendor>_<app>_business_severity` *(citation: `markdown/application-development/r_ExampleNamespaceIdentifiers.md`)*, and ACL/BR records move into the scoped app.
OQ-EV-2. **Service Owner role identity.** The dispatch envelope names `u_service_owner` as the role. Confirm this is the engagement's actual role name and that it's already populated for the relevant CIs.
OQ-EV-3. **Backfill strategy.** NULL = implicit Low, or explicit Service-Owner-driven backfill exercise? Recommend defaulting to NULL with a future backfill story if reporting needs require it.
OQ-EV-4. **Read access.** Should `u_business_severity` be visible to all `itil` users (read-only) or restricted to Service Owners? Recommend read-visible-to-itil, write-restricted-to-Service-Owner.
OQ-EV-5. **Escalation-timing linkage.** The request says business severity "drives escalation timing". Confirm whether escalation timing is per-incident (the Example 1 pattern reads `u_business_severity` and adjusts the 15-minute timer) or per-CI (the timer is on the cmdb_ci_service record).
```

### Explanation

Verdict B is the second most common verdict — the request genuinely needs *something* beyond baseline, but the smallest possible something. The envelope demonstrates:

- **Part 3's structured baseline evaluation** — five alternatives considered, each with explicit "why it falls short" before proposing the extension. This is the §1.1 halt-protocol structure for an approved-rather-than-rejected extension.
- **Part 3's note on `incident.business_impact`** — flagged as "limited citation availability; verify against engagement's instance" because the field exists in newer release families but behaves differently in Australia. This is exactly the release-family precision Suggestion (b) called for.
- **Part 4's hand-off to Technical Designer** — Technical Designer now has a clear spec to design against. The envelope did not design the ACL matrix or write the BR; that's Technical Designer's job downstream.
- **Part 5's anti-patterns** include "do not create a custom `business_severity_log` table" — pre-empting the most likely §1.1 violation a builder might introduce when implementing this.

The Open Questions are real and specific. Each one is the kind of decision that, if left ambiguous, leads to rework downstream.

---

## Example 3 — Verdict C (§1.1 Halt)

### Input dispatch envelope

> **Domain Expert dispatch — ITSM Specialist gateway**
>
> **Request:** "We need a multi-tier change-approval matrix, held in a custom table `u_approval_matrix`, that considers: (1) change risk score, (2) the business unit owning the affected service, (3) whether the change touches PCI-scoped systems, (4) whether the change window overlaps a frozen period, and (5) the change requester's seniority level. The matrix should return: which approval groups are required, in what order, with what SLA per approval step. Today we have ~50 different approval scenarios documented in spreadsheets that change quarterly."
>
> Module: ITSM (Change Management)
> Volume: ~10K change requests/year
> Sensitivity: PCI-scope flag is sensitive (regulated)
> Engagement: GlobalCo — uses baseline `change_request`, has CAB process active, PCI compliance is audited, no current custom change tables. Service-Owner-to-BU mapping exists in CMDB.
> Release family: Australia

### Expected gateway output

```markdown
# ITSM Specialist Gateway Response — Multi-dimensional change-approval matrix, requested as a custom table

## Part 1 — OOB Process Map

This request touches change approval routing, change risk, frozen periods and approval timing.

### Baseline change-approval pattern

- Baseline `change_request` has a state machine: New → Assess → Authorize → Scheduled → Implement → Review → Closed.
- Approvals happen in the `Authorize` state, as baseline `sysapproval_approver` records. Classic approval rules have been replaced by the Workflow Studio Ask for Approval action *(citation: `markdown/build-workflows/approvals/c_ApprovalRules.md`)*.
- **Change approval policies generate a change's approvals.** "A change approval policy is a course of action that can be applied to a change request. It uses a set of variable inputs to evaluate the decisions that are associated with it. For each matching decision, the associated approval definition is applied." And "an approval policy can contain multiple decisions allowing a single policy to handle every approval required for a change type" *(citation: `markdown/it-service-management/change-management/change-approval-policy.md`)*. The policy is a Change Approval Policy [`chg_policy_approval`] record *(citation: `markdown/it-service-management/change-management/installed-with-approval-policy.md`)*.
  - **Policy inputs** are the variable sources a decision evaluates. The default `change_request` input "provides access to the change request table and to any table change request references" *(citation: `markdown/it-service-management/change-management/create-policy-input.md`)*.
  - **Decisions** carry the conditions, and each answers with an approval definition *(citation: `markdown/it-service-management/change-management/create-decisions.md`)*. With the decision builder, a policy runs either the first decision that matches, in order, or every decision that matches *(citation: `markdown/it-service-management/change-management/change-approval-policy-decision-builder.md`)*.
  - **Approval definitions** add a user or a group approval, mandatory or not. The approver comes from the definition or from a reference field on the change, and a group approval waits for the first response, all responses or a percentage *(citation: `markdown/it-service-management/change-management/create-approval-definitions.md`)*.
- The Apply Change Approval Policy flow action "automatically generates the required user and group approvals". Its fields are the policy, the change request and a Due Date: None, or Approve, Reject or Cancel on the due date *(citation: `markdown/it-service-management/change-management/use-apply-change-approval-policy-flow-activity.md`)*. "Multiple actions can be used in a flow, where each action references the same or different Change approval policies" *(citation: `markdown/it-service-management/change-management/change-flow-actions.md`)*.
- Baseline `change_request.risk` is a choice: **-- None --** until it is set to **High**, **Moderate** or **Low**. The Change Risk Calculator, on by default, or an optional Risk Assessment questionnaire can drive it (the baseline Assessment Metric Type [`asmt_metric_type`] and Assessment Metric [`asmt_metric`] tables *(citation: `markdown/api-reference/rest-apis/copy-assessments-api.md`, `markdown/build-workflows/workflow-studio/activate-process-automation-designer-for-app-engine.md`)*). *(citations: `markdown/it-service-management/change-management/t_CreateAChange.md`, `markdown/it-service-management/change-management/c_RskAsmtCalc.md`)*
- Baseline `change_request.type` distinguishes Standard (pre-approved, no CAB), Normal (CAB review), Emergency (expedited CAB).
- *(citation: `markdown/it-service-management/change-management/reference-change-management.md`)*

### Frozen periods / change windows

- Baseline supports `cmn_schedule` records with blackout windows. "Conflict detection uses blackout and maintenance schedules to find potential scheduling conflicts for the configuration items (CIs) associated with a change request" *(citation: `markdown/it-service-management/change-management/t_CreateBlkoutMaintSched.md`)*.
- *(citation: `markdown/it-service-management/change-management/reference-change-management.md`)*
- Conflict detection writes its result on the change: `conflict_status` holds the "Current conflict status as detected by the conflict detection script, such as Conflict and Not Run" *(citation: `markdown/api-reference/rest-apis/change-management-api.md`)*. A decision can read it.

### PCI scope tracking

- PCI scope is typically tracked on the CI via a `cmdb_ci.u_compliance_scope` or similar custom field; baseline `cmdb_ci` does not carry a PCI flag. The engagement is expected to have implemented this if PCI is audited.

### Business Unit / Service Owner / requester seniority

- BU is typically `cmdb_ci.business_unit` or via service hierarchy. Baseline.
- Requester seniority is typically `sys_user.title` or a `sys_user.<level>` custom field. Not in baseline ITSM scope per se — comes from HR/Identity.
- The CI and the requester are references on the change, so the default policy input reaches all five dimensions.

## Part 2 — Data Model Alignment

The request names a custom table for the matrix. The baseline tables that already hold it:

| Table | Role in this request |
|---|---|
| `change_request` | The record being approved; its risk, type, `conflict_status`, CI and requester are what the decisions read |
| `chg_policy_approval` | The Change Approval Policy: its inputs, one decision per scenario, and the approval definitions they answer with |
| `sysapproval_approver` | Where the generated approvals are written |
| `asmt_metric` | Baseline risk-scoring questionnaire definition |
| `cmn_schedule` | Frozen period definition |
| `cmdb_ci` | CI being changed (carries the PCI flag if implemented) |
| `sys_user` | Requester seniority |

**The matrix is a Change approval policy.**
- Each of the ~50 scenarios is a decision. Its condition reads the five dimensions through the policy input, and its answer is the approval definition that names the approval group.
- A quarterly change edits decision records on the policy, not a flow and not a script.
- The order of the approval steps is a sequence of Apply Change Approval Policy actions in the flow, one policy per step.

**What the policy does not hold: an SLA per approval step.** Each action carries one Due Date, and the Due Date decides what happens when it falls due. Whether the scenarios need different durations is OQ-EV-1.

## Part 3 — §1.1 Baseline-First Verdict

**Verdict C — the request names a custom table, `u_approval_matrix`, and the §1.1 halt fires.** Part 2's finding — the baseline Change approval policy covers the matrix — is the OPEN QUESTION's recommendation, not a different verdict.

### OPEN QUESTION — CUSTOM OBJECT PROPOSAL

#### 1. Baseline option evaluated and why it falls short

| Baseline option | What it covers | Where it falls short |
|---|---|---|
| **Change approval policy** — one decision per scenario, approval definitions naming the groups, one Apply Change Approval Policy action per approval step | The five dimensions as decision conditions on the change and the records it references; the groups; their order; quarterly edits as decision records | An SLA per step: each action carries a single Due Date. Verify against the scenarios (OQ-EV-1). |
| **One Ask for Approval branch per scenario in the flow** | Every scenario, as ~50 conditioned branches | Each quarterly change edits the flow, and each branch's condition becomes a mini-ruleset. The policy holds the same thing as records. |
| **Decision Table** (`sys_decision`), read by the flow beside the policy | A duration per scenario and step, if OQ-EV-1 needs one | A second place where scenarios are kept, beside the policy's decisions *(citation: `markdown/build-workflows/index.md`)* |

The Change approval policy covers the request. Nothing in it calls for a new table.

#### 2. Custom object proposed (smallest possible scope)

- **Object:** `u_approval_matrix`, as the request names it.
- **Kind and place in the §1.1 hierarchy:** a custom table that extends no baseline table — a new top-level table. The hierarchy places top-level tables after every extension of a baseline table, where justification is required *(citation: `governance/governance-rules.md` §1.1 halt protocol)*.
- **What it would hold, in the request's words:** "which approval groups are required, in what order, with what SLA per approval step", for ~50 scenarios.
- **Rejected as unnecessary.** The Change approval policy holds the scenarios as decisions, the groups as approval definitions and the order as one action per step (Part 2). No smaller custom object is proposed.

#### 3. Consequences of approval

- **Data model:** one custom table holding the scenarios a second time, beside the policy the Change module uses. Each quarterly change edits both, in step.
- **Platform-upgrade risk:** the flow that reads the table is custom logic, retested at each upgrade, and the change's approvals no longer come from a Change approval policy.
- **Audit and PCI implications:** a PCI-scope condition carries regulatory weight, so audit and retention apply to it. **Security & GRC Specialist consult is required** if this proposal is approved.
- **Licensing:** the table consumes a custom table entitlement of the subscription it is mapped to *(citation: `markdown/platform-administration/allocating-custom-tables-subscr-apps-v2.md`)*. **Licensing & Entitlement consult** if approved.

#### 4. Alternatives if rejected

- **Recommended:** the Change approval policy as in Part 2. First reduce the dimensions — BU and PCI derived from the CI — so that ~50 scenarios become fewer decisions.
- **If the per-step SLA must vary by scenario:** add a Decision Table returning the duration, read by the flow beside the policy.
- **Manual workaround:** Change Manager keeps the spreadsheets, with a Service Catalog item that captures the inputs and creates a `change_request` plus a manual approval-routing task. No automation; the status quo.

### Recommendation to the Chief Architect

Reject the custom table. The Change approval policy holds the scenarios as decisions and generates the approvals; the per-step SLA is an open question with a baseline answer, not a reason for a table.

## Part 4 — Routing Recommendation

**HALT — §1.1: the request names a custom table.**

Do not dispatch Technical Designer or Flow Designer Specialist until the Chief Architect rules. Options:

- **Reject in favour of the Change approval policy (recommended).** Re-dispatch ITSM Specialist with the ruling. Flow Designer Specialist then designs the approval flow, with one Apply Change Approval Policy action per step, and the policy's inputs, decisions and approval definitions.
- **Approve the table as requested.** Re-dispatch ITSM Specialist with the approval in the envelope. **Fire the Security & GRC and Licensing & Entitlement consults before Technical Designer.**

## Part 5 — Anti-Patterns to Block

- **Do not build a matrix table for what the policy's decisions hold.** One decision per scenario, answered by an approval definition *(citation: `markdown/it-service-management/change-management/change-approval-policy.md`)*.
- **Do not write one approval branch per scenario in the flow.** One Apply Change Approval Policy action per step generates the approvals *(citation: `markdown/it-service-management/change-management/use-apply-change-approval-policy-flow-activity.md`)*.
- **Do not set the approval fields on the change by hand.** "You do not need to set the approval fields on the change request manually" *(same citation)*.
- **Do not duplicate `change_request.risk`** — the decisions read it.
- **Do not duplicate baseline blackout-window checks** — the decisions read `conflict_status`, which conflict detection sets *(citation: `markdown/api-reference/rest-apis/change-management-api.md`)*; a script that needs the check itself calls the baseline `ChangeCollisionHelper` script include of the Collision Detector plugin (`getBlackoutsByDate`, `isDateInCiMaintenanceWindows`) *(citation: `markdown/api-reference/server-api-reference/c_ChangeCollisionHelperAPI.md`)*.
- **Do not store PCI scope anywhere but `cmdb_ci`** — the decisions read it through the change's CI.

## Open Questions

OQ-EV-1. **OPEN QUESTION: per-step SLA.** Do the scenarios need different approval durations per step, or one per step? Each Apply Change Approval Policy action has one Due Date, which chooses what happens when the step falls due; where the duration itself is set is not documented in the bundled corpus — verify on the instance. **Proposed default:** one duration per step, on each step's action; a Decision Table beside the policy only if the scenarios prove to need different durations.
OQ-EV-2. **Dimension orthogonality.** Can BU and PCI be derived from `cmdb_ci`? Fewer dimensions mean fewer decisions.
OQ-EV-3. **Quarterly cadence ownership.** Who edits the decisions each quarter? Decisions are created by an admin or a change manager *(citation: `markdown/it-service-management/change-management/create-decisions.md`)*. Affects who holds the role.
OQ-EV-4. **Audit retention.** PCI audit typically requires 7 years of change history. Confirm the engagement's retention covers the approval records and the edits to the policy's decisions.
OQ-EV-5. **Standard changes.** Does the policy apply to Standard changes (pre-approved by definition) or only Normal and Emergency? Standard changes typically bypass approval entirely; confirm scope.
```

### Explanation

Verdict C is the rarest verdict and the most carefully structured. Here it comes from the request, not from the baseline falling short. The request names a custom table, and a request that names one is Verdict C however well the baseline answers it. The envelope demonstrates:

- **Part 2 does the baseline work anyway.** The Change approval policy — inputs, one decision per scenario, approval definitions, one action per step — holds the ~50 scenarios as records, with each claim cited. That finding becomes the halt's recommendation.
- **The residual is named, not inflated.** The policy action carries one Due Date. A per-step SLA is therefore an open question with a baseline answer (a Decision Table), not a reason for a table.
- **Part 4's HALT** gives the Chief Architect two options, the recommended one first. There is no silent default.
- **Part 5** blocks the drift back to a matrix table or to per-scenario branches.

The Open Questions are the decisions that shape the policy before anyone builds it: the per-step SLA, dimension reduction, who edits the decisions, and audit retention.

---

*End of ITSM Specialist EXAMPLES.md v2.0.*
