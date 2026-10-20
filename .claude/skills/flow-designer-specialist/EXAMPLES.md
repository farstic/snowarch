# Flow Designer Specialist — EXAMPLES

**Version:** 1.0
**Pairs with:** Flow Designer Specialist SKILL.md v1.0
**Purpose:** Three gold-standard task → output pairs that exemplify the Flow Designer Specialist skill in production use.

Each example: input prompt → expected output (the flow design specification) → explanation.

---

## Example 1 — Record-triggered approval flow with Decision Table and spoke

### Input prompt

> Flow Designer Specialist task: design a record-triggered flow on the `change_request` table for x_acme_change.
>
> Behaviour: when a CHG is moved to "Authorize" (state=-3), the flow should:
> - Look up the CAB approver group based on the CHG's assignment_group, type, and risk via a Decision Table.
> - Send the approval to the resolved CAB approver group with 5-business-day SLA.
> - On approval: move the CHG to "Scheduled" (state=-2), notify requester via Microsoft Teams.
> - On rejection: move to "Canceled" (state=4), capture rejection reason in work notes.
> - On timeout (5 business days no response): escalate to the change manager group.
>
> Idempotency: re-firing the trigger must not produce duplicate approvals.
>
> Scope: x_acme_change.
> Pre-approved custom objects: the `x_acme_change` scope (the client's change app; the baseline weighed was the global scope). No custom tables.
> Baseline weighed for the CAB routing: the Change approval policy, which the Apply Change Approval Policy flow action applies to generate the user and group approvals from its decisions. The dispatch keeps the request's Decision Table because each route also returns its own approval SLA in business days, and the policy action takes a single Due Date for the action *(citations: `markdown/it-service-management/change-management/change-approval-policy.md`, `markdown/it-service-management/change-management/use-apply-change-approval-policy-flow-activity.md`)*.

### Expected output

#### Capability statement
This flow takes a `change_request` transition into "Authorize" and drives it to a final approval/rejection/timeout outcome with notifications and audit, without producing duplicate approvals on re-trigger.

#### Layer placement
- **Top-level flow.** Single trigger, lifecycle-bound to `change_request`.
- Notification fan-out is delegated to a subflow `x_acme_change.notifyChangeStakeholders` (designed separately — see Example 2 pattern).

#### Trigger
| Property | Value |
|---|---|
| Type | Record |
| Table | `change_request` |
| Condition | `state` changes to `-3` (Authorize) *(citation: `markdown/it-service-management/change-management/state-model-activate-tasks.md`)* |
| Run as | System |
| Where to run the flow | Run flow in background, the default (approval flows are long-running; do not block the save) *(citation: `markdown/build-workflows/workflow-studio/flow-triggers.md`)* |

#### Inputs
| Name | Type | Source |
|---|---|---|
| `current` | Reference (change_request) | Trigger context |

#### Outputs
None (side-effects only: state transitions, notifications, audit entries).

#### Steps

1. **Idempotency guard** — Decision: does an active `sysapproval_approver` record exist for this CHG with state `requested`? If yes → end flow (already in flight).
2. **Look Up Record** — refresh `current` to get latest field values (assignment_group, type, risk, requested_by).
3. **Decision Table lookup** (kept over the Change approval policy, per the dispatch envelope) — `x_acme_change.cab_approver_routing` returns `cab_approver_group` and `approval_sla_business_days` (default 5).
   - Decision Table inputs: assignment_group, type, risk.
   - Decision Table outputs: cab_approver_group (sys_user_group), approval_sla_business_days (integer).
4. **Ask for Approval** — to the resolved `cab_approver_group`.
   - Approval expression: ANYONE in group.
   - Due date: now + `approval_sla_business_days` business days (use baseline business calendar).
   - Wait for: approved | rejected | timeout.
5. **Decision: outcome**
   - **Approved branch:**
     1. Update Record: `current.state = -2` (Scheduled), `current.approval = approved`.
     2. Call subflow `x_acme_change.notifyChangeStakeholders` with target=current, channels=[teams,email], outcome=approved.
   - **Rejected branch:**
     1. Update Record: `current.state = 4` (Canceled), `current.approval = rejected`, append rejection reason to `work_notes`.
     2. Call subflow `notifyChangeStakeholders` with outcome=rejected.
   - **Timeout branch:**
     1. Look Up Record: `sys_user_group` where `name = 'Change Managers'`.
     2. Ask for Approval (escalation): to change manager group, due date now + 1 business day.
     3. Recurse into the same outcome decision (approved/rejected/timeout — second timeout closes as Canceled with reason "no response from CAB or Change Manager").
6. **Flow error handler** — a Log action records the handler's Error Status code and message and the current sys_id in `sys_flow_log`, which the flow's execution details show, and the email Action notifies `change-ops@acme` *(citations: `markdown/build-workflows/workflow-studio/flow-error-handler.md`, `markdown/build-workflows/workflow-studio/log-message-flow-designer.md`)*.

#### Decision points
- **Step 1** — idempotency guard.
- **Step 5** — primary outcome branching from Ask for Approval.
- **Step 3** — Decision Table for approver routing (data-driven, not flow-condition-driven, for maintainability).

#### Error handling
- Per-step On Error: each Update Record and Decision Table lookup has a documented On Error path (continue with default for Decision Table miss; abort to the flow error handler for Update Record failure).
- Flow error handler: logs the failure and notifies ops; no custom dead-letter table.
- Notification subflow failures are non-blocking — the state transition completes even if Teams is unreachable; the failure is logged.

#### Transaction strategy
- **Async: the trigger's *Where to run the flow* left at *Run flow in background*** — approvals are long-running (days), the user save must not block.
- **Idempotency via state guard** — Step 1 prevents duplicate approvals on re-trigger (e.g., admin manually re-saving the record while the flow is in flight).
- **Compensating actions** — none needed; failures are logged by the error handler for manual recovery rather than auto-rollback (state transitions are recoverable manually).

#### Custom scripts called out
None directly in this flow. The notification subflow may use a script step — see Example 2.

#### Spoke consumption
- **Microsoft Teams Spoke** → "Post a Message" Action (used inside `notifyChangeStakeholders` subflow, not directly) *(citation: `markdown/integrate-applications/integration-hub/microsoft-teams-spoke.md`)*.
- **Approvals** — baseline platform Action (no spoke needed).

#### Scope and naming
- Scope: `x_acme_change`.
- Flow name: `CHG Authorize Approval Routing`.
- Internal name: `x_acme_change.flow_chg_authorize_approval_routing`.
- Decision Table: `x_acme_change.cab_approver_routing`.
- No custom tables: errors go to the flow error handler, history to the baseline approval and audit records.

#### Observability
- Flow Execution log captures every step.
- The error handler's notification is the operational alert.
- Each terminal transition is on baseline records: the approval records (`sysapproval_approver`) carry approver and outcome, the change's audit history (`sys_audit`) carries the state changes, and a second approval record shows that the escalation was used *(citations: `markdown/build-workflows/workflow-studio/ask-approval-flow-designer.md`, `markdown/platform-security/exploring-auditing.md`)*.
- Performance Analytics indicator: **Change approval cycle time** (ms from trigger to terminal state).

#### Test approach (handoff to ATF Author)
- Happy path: approval within SLA → state=-2.
- Rejection path: rejection captures reason → state=4.
- Timeout path: no response → escalation to change manager.
- Double-trigger path: re-trigger while in flight → idempotency guard hits.
- Decision Table miss: unknown combination → default approver group used.
- Notification failure: Teams unavailable → state still transitions, the failure is logged.

#### Open questions
- **OQ-DS-1:** What is the default approver group when the Decision Table returns no match? Spec did not specify. Proposed default: change manager group.
- **OQ-DS-2:** Should the rejection reason be required (form-enforced) or optional? Affects step 5 rejection branch.
- **OQ-DS-3:** Business calendar source — is there a single platform calendar for change SLAs, or scope-specific?

#### Handoffs proposed
- **Subflow design** for `notifyChangeStakeholders` — propose Flow Designer Specialist subflow design (Example 2 pattern).
- **Performance & Scale** — change_request volume is bounded but the trigger condition fires on every state-to-(-3) transition; confirm the trigger condition uses an indexed predicate.
- **Security & GRC** — Decision Table contents (group routing rules) are governance-sensitive; flag for ACL review.
- **ATF Author** — full test suite per the test approach above.

### Why this is the gold standard

The design takes a meaty real-world request (CHG approval routing with timeout escalation and idempotency) and produces a complete spec a builder can implement directly. Every required SKILL output section is present and each is filled with substance, not boilerplate: the trigger has an exact condition, the steps are numbered with precise sub-steps, decision points are explicit, and error handling distinguishes per-step from flow-level.

The idempotency guard at Step 1 is the most important detail — re-trigger scenarios are the single most common cause of "duplicate approval" bugs in production change processes, and the spec called for idempotency without specifying a mechanism. The designer chose the right mechanism (state guard via existing approval record) and surfaced it as Step 1, not as a footnote. The Decision Table choice for approver routing is also non-trivial: a junior designer would have written a chain of `If/Else if` flow conditions, which would be unmaintainable as routing rules grow. The handoff section correctly surfaces three downstream specialists (notification subflow design, Performance & Scale for trigger condition indexing, Security & GRC for Decision Table governance) — none requested by the user, all genuinely relevant.

---

## Example 2 — Reusable subflow with typed inputs and spoke consumption

### Input prompt

> Flow Designer Specialist task: design a reusable subflow `notifyStakeholders` that takes a target record reference and a list of channels (teams, email, slack), and posts a stakeholder notification to each.
>
> Returns structured output: results (List of {channel, status, error_detail}).
>
> Will be consumed by incident MIM flows, change emergency flows, and HR case escalation flows.
>
> Scope: x_acme_platform (shared utility scope).
> Pre-approved custom objects: the `x_acme_platform` scope and its `x_acme_platform_notification_template` table — approved over the global scope and over the baseline Email Template [`sysevent_email_template`], which holds email templates — rich HTML for email — not the Teams and Slack messages this subflow also sends *(citations: `markdown/platform-administration/t_CreateAnEmailTemplate.md`, `markdown/application-development/servicenow-sdk/fluent-email-notification-api.md`)*.

### Expected output

#### Capability statement
This subflow takes a target record and a list of channels, fans out a stakeholder notification across the requested channels, and returns per-channel success/failure detail — without coupling callers to channel-specific spokes.

#### Layer placement
- **Subflow.** No trigger. Invoked by name from any flow needing multi-channel stakeholder notification.
- Lives in shared scope `x_acme_platform` so incident, change, and HR flows can all consume it.

#### Trigger
None (subflow).

#### Inputs
| Name | Type | Required | Description |
|---|---|---|---|
| `target_record` | Reference (Document) | Yes | The record the notification is about. Polymorphic — flows pass incident, change_request, or sn_hr_core_case references. |
| `channels` | List of String | Yes | Subset of `{teams, email, slack}`. Empty list → no-op return. |
| `message_template` | String | No | Optional override for the notification template. Default: scope-and-table-based template lookup. |
| `recipient_group` | Reference (sys_user_group) | No | Override target group. Default: derived from target_record.assignment_group. |

#### Outputs
| Name | Type | Description |
|---|---|---|
| `results` | List of Object `{channel, status, error_detail}` | Per-channel outcome. `status` ∈ {success, failure, skipped}. |
| `success_count` | Integer | Count of channels where status=success. |
| `failure_count` | Integer | Count of channels where status=failure. |

#### Steps

1. **Validate inputs** — Decision: if `channels` is empty, return empty results, success_count=0, failure_count=0.
2. **Resolve recipient group** — if `recipient_group` is supplied, use it; else Look Up Record: dot-walk `target_record.assignment_group`. If neither is resolvable, return all channels as `failure` with reason "no recipient".
3. **Resolve message** — call custom Action `x_acme_platform.ResolveNotificationMessage` (server-script Action; Developer-owned). Inputs: target_record, message_template (optional). Output: resolved message text + subject.
4. **For Each channel in `channels`** — `max_iterations: 10` (defensive cap; channel list is short).
   - **Decision: channel type**
     - **teams branch** → Microsoft Teams Spoke `Post a Message`. Capture spoke result.
     - **email branch** → baseline `Send Email` Action targeting recipient_group members. Capture result.
     - **slack branch** → Slack Spoke `Post Message` *(citation: `markdown/integrate-applications/integration-hub/slack-spoke.md`)*. Capture result.
     - **default branch** (unknown channel value) → record `{channel, status:skipped, error_detail:'unknown channel type'}`.
   - **On Error (per-channel)** — capture error, append `{channel, status:failure, error_detail:<error>}` to results. Do NOT abort the loop — other channels still attempt.
5. **Aggregate results** — count success/failure, build the `results` output list.
6. **Return** — populate output values.

#### Decision points
- **Step 1** — empty channels short-circuit.
- **Step 2** — recipient resolution failure short-circuit.
- **Step 4** — channel-type branching.

#### Error handling
- **Per-channel:** each spoke call has an On Error path that records the failure and continues. One channel failure does not block others — this is the contract callers depend on.
- **Subflow-level:** the subflow itself does not throw. Callers always get a structured result; partial failure is communicated via `failure_count > 0` and per-channel error_detail.
- **No DLQ at this layer** — DLQ decisions belong to the calling flow, which knows the business context (P1 incident notification failure ≠ HR case notification failure).

#### Transaction strategy
- **Sync from caller's perspective** — the subflow returns when all channels have been attempted.
- **Channel calls themselves may use spoke-level retry** (configured in the spoke's connection alias).
- **Idempotency** — the subflow does not enforce idempotency. Callers that need exactly-once delivery must guard at the trigger level (e.g., notification ledger — see Developer SKILL example with `MajorIncidentNotifier.alreadyNotified`).

#### Custom scripts called out
- **`x_acme_platform.ResolveNotificationMessage`** (custom Action with server script). Developer handoff:
  - Signature: `(target_record: Reference, message_template_override: String) → {message: String, subject: String}`
  - Logic: if override supplied, use it (with data-pill substitution); else look up scope+table-keyed template from `x_acme_platform_notification_template`; substitute placeholders; return.
  - Role check: caller (flow context) is system; no role gate needed inside the script (subflow is internal).
  - Error: throw on missing template AND missing override (caller must specify at least one path).

#### Spoke consumption
- Microsoft Teams Spoke (current pinned version).
- Slack Spoke (current pinned version).
- Baseline Send Email Action (no spoke; built into platform).

If either spoke is unavailable in the target instance, design degrades to email-only with a warning logged — but flag this as an Open Question to confirm the desired behaviour.

#### Scope and naming
- Scope: `x_acme_platform`.
- Subflow name: `Notify Stakeholders`.
- Internal name: `x_acme_platform.subflow_notify_stakeholders`.
- Custom Action: `x_acme_platform.ResolveNotificationMessage`.
- Template table: `x_acme_platform_notification_template`, pre-approved in the dispatch envelope (fields: scope, table, key, subject, body).

#### Observability
- Subflow execution log captures invocation + per-channel outcome.
- Failure detail is in the returned `results` list — callers decide what to do with it.
- For trend analysis, callers read the subflow's execution details or their own baseline records. The subflow itself does not own audit.

#### Test approach (handoff to ATF Author)
- Happy path: all three channels succeed.
- Empty channels: returns empty results.
- Recipient resolution failure: all channels return `failure` with consistent `error_detail`.
- Single-channel failure (mock spoke error): other channels still succeed; partial success count.
- Unknown channel value: marked `skipped`, others succeed.
- Template override path vs default path.

#### Open questions
- **OQ-DS-1:** When a spoke is unavailable in the target instance (e.g., Slack Spoke not installed), should the subflow degrade silently to other channels, or fail loudly? Assumption: silent degradation with `status:skipped, error_detail:'spoke not installed'`. Confirm.
- **OQ-DS-2:** Multilingual content — is the template scoped by user.preferred_language, or instance-default only? Affects `ResolveNotificationMessage` signature.
- **OQ-DS-3:** Are there compliance reasons HR notifications cannot go to Slack/Teams (PII channel restrictions)? If yes, this subflow should not be used by HR flows for some content categories — flag for HRSD Specialist review.

#### Handoffs proposed
- **Developer** — for `ResolveNotificationMessage` server script (custom Action body) per spec above.
- **Code Reviewer** (post-build §6.2) — fires when Developer returns the script.
- **HRSD Specialist** — to confirm whether this subflow is safe for HR case notifications (OQ-DS-3).
- **ATF Author** — test suite per test approach above.

### Why this is the gold standard

The subflow design demonstrates the *contract-first* mindset that distinguishes good orchestration from glue code. Inputs and outputs are typed, the recipient resolution is explicit (with override semantics), and the channel branching is structured so adding a fourth channel later is mechanical rather than disruptive. Crucially, the design states the subflow's failure contract explicitly: per-channel failures are reported but do not abort the loop, and the subflow does not throw — callers always receive a structured result. This is the contract callers will depend on; making it implicit would be a defect.

The handoff to Developer for `ResolveNotificationMessage` is correctly scoped: the signature, role check, and error semantics are specified, but the script body is not written here. That respects the boundary in taxonomy §2.1 between "design the spec" (Flow Designer's job) and "implement" (Developer's job). The three open questions are also non-trivial — particularly OQ-DS-3, which surfaces a domain concern (HR PII channel restrictions) that the spec did not flag but a senior designer would always raise.

---

## Example 3 — Scheduled batch flow with custom Action and Developer handoff

### Input prompt

> Flow Designer Specialist task: design a scheduled flow that runs daily at 02:00 UTC, finds all closed incidents older than 30 days that haven't had a customer feedback request sent, sends the feedback request via email, and updates the incident's `x_acme_itsm_feedback_requested` flag.
>
> Volume context: ~2000 closed incidents/day match the criteria.
> Scope: x_acme_itsm.
> Pre-approved custom objects: the `x_acme_itsm` scope (the client's ITSM app; the baseline weighed was the global scope). No custom tables.

### Expected output

#### Capability statement
This flow takes a scheduled trigger and produces customer-feedback emails for recently-closed incidents that haven't yet been surveyed, marking each processed incident to prevent re-survey.

#### Layer placement
- **Top-level flow.** Scheduled trigger.
- Per-record processing logic delegated to a custom Action `x_acme_itsm.SendFeedbackRequest` containing a server script (Developer-owned).

#### Trigger
| Property | Value |
|---|---|
| Type | Scheduled |
| Schedule | Daily at 02:00 UTC |
| Run as | System |
| Active | Yes (toggleable per environment) |

#### Inputs
None (scheduled).

#### Outputs
None (side-effects only).

#### Steps

1. **Look Up Records** — table `incident`.
   - Conditions:
     - `state = 7` (Closed)
     - `closed_at < javascript:gs.daysAgo(30)` (closed 30+ days ago)
     - `closed_at >= javascript:gs.daysAgo(60)` (and within the last 60 days — bounds the historical sweep so the flow doesn't accidentally re-survey records from years ago if the flag was wiped)
     - `x_acme_itsm_feedback_requested = false`
   - Order by: `closed_at` ascending (oldest first).
   - Set Limit: 5000 (defensive cap; expected ~2000/day).
2. **For Each** incident in the result set — `max_iterations: 5000`.
   - Step 2.1: Call custom Action `x_acme_itsm.SendFeedbackRequest` with input `incident_sys_id = current.sys_id`. The Action returns `{success: bool, error_detail: string}`.
   - Step 2.2: Decision: if `success = true` → continue; else → append to `failures` flow variable.
3. **Aggregate and log** — total processed, succeeded and failed; a Log action records run_timestamp, records_processed, succeeded, failed and duration_ms in `sys_flow_log` on every run *(citation: `markdown/build-workflows/workflow-studio/log-message-flow-designer.md`)*.
4. **Decision: failure rate**
   - If `failures / processed > 0.10` → notify ops via email Action (alert template `feedback-request-batch-failure`). Include first 10 failure entries in the alert body.
   - Else → no alert; the step-3 summary is the run's record.
5. **Flow error handler** — a Log action records the error and the run timestamp in `sys_flow_log`, and the email Action notifies ops *(citations: `markdown/build-workflows/workflow-studio/flow-error-handler.md`, `markdown/build-workflows/workflow-studio/log-message-flow-designer.md`)*.

#### Decision points
- **Step 2.2** — per-record success/failure capture.
- **Step 4** — failure-rate alerting threshold (10%).

#### Error handling
- Per-record errors are captured by the custom Action and surfaced via its return value, NOT thrown — the loop continues.
- The flow error handler catches infrastructure failures inside a run (e.g., ECC queue down) and logs them; it runs only when a running flow catches an error *(citation: `markdown/build-workflows/workflow-studio/flow-error-handler.md`)*.
- Failure-rate alert (>10%) at end-of-run signals systemic issues without flooding ops on a single bad record.

#### Transaction strategy
- **Async (scheduled)** — no caller waiting.
- **Idempotency** — the `x_acme_itsm_feedback_requested = false` filter is the idempotency mechanism; once the Action sets the flag to true, a re-run of the flow won't re-process the same record. The custom Action must set the flag *only if the email send succeeded* — see Developer handoff.
- **Bounded** — set limit of 5000 prevents runaway processing on data anomalies.

#### Custom scripts called out
- **`x_acme_itsm.SendFeedbackRequest`** (custom Action with server script). Developer handoff:
  - Signature: `(incident_sys_id: String) → {success: Boolean, error_detail: String}`
  - Logic:
    1. Role check: `gs.hasRole('x_acme_itsm.feedback_runner')`.
    2. Validate input.
    3. Load incident via `GlideRecordSecure`.
    4. Resolve customer email from `incident.caller_id.email`. If empty → return `{success: false, error_detail: 'no customer email'}`.
    5. Send email via baseline notification with the example's own feedback-request template (the template lives outside this Action — referenced by name; the platform names its own templates with dots, as `change.update.risk` *(citation: `markdown/platform-administration/t_CreateAnEmailTemplate.md`)*).
    6. On send success: set `incident.x_acme_itsm_feedback_requested = true`, `incident.update()`. Return `{success: true}`.
    7. On send failure: do NOT set the flag. Return `{success: false, error_detail: <error message>}`.
  - Performance: must complete in <500ms per call (loop budget at 5000 records ÷ 30-min flow window).
  - Error handling: try/catch around send; never throw — always return structured result.

#### Spoke consumption
None — uses baseline platform email.

#### Scope and naming
- Scope: `x_acme_itsm`.
- Flow name: `Daily Feedback Request Sweep`.
- Internal name: `x_acme_itsm.flow_daily_feedback_sweep`.
- Custom Action: `x_acme_itsm.SendFeedbackRequest`.
- No custom tables: errors go to the flow error handler, the run summary to `sys_flow_log`.
- Field: `x_acme_itsm_feedback_requested` on `incident` (added via the scoped app's table extension).

#### Observability
- Flow Execution log per run.
- End-of-run summary recorded by a Log action in `sys_flow_log`, which the flow's execution details show: run_timestamp, records_processed, succeeded, failed, duration_ms *(citation: `markdown/build-workflows/workflow-studio/log-message-flow-designer.md`)*.
- Performance Analytics indicator: `feedback_request_send_rate` (records/day surveyed).
- Alert email on failure rate >10%.

#### Test approach (handoff to ATF Author)
- Happy path: 100 candidates, all succeed → all flagged, no alert.
- Empty result set: no candidates → flow completes with zero processed, no alert.
- Per-record failure: simulate email failure on 5/100 → 5% rate, no alert; flag NOT set on the 5.
- High failure rate: simulate 20/100 failures → alert email triggered.
- Set Limit boundary: simulate 5001 candidates → only 5000 processed, oldest first; remaining 1 picked up next run.
- Re-run idempotency: run twice consecutively → second run finds zero candidates (already flagged).

#### Open questions
- **OQ-DS-1:** Set limit of 5000 — confirm with operations that 30 minutes is the maximum acceptable run duration, and that 5000 is the right ceiling. If volumes exceed 5000/day on average, design needs sharding or hourly runs instead.
- **OQ-DS-2:** The 60-day historical bound — is this the correct rule, or should the flow process all unflagged closed records regardless of age? Affects the look-up condition.
- **OQ-DS-3:** Should opt-out customers be excluded? No mention in spec. Assumption: respect a `caller_id.x_acme_itsm_feedback_opt_out` flag (the app's own field on `sys_user`, like `x_acme_itsm_feedback_requested` on `incident`). Confirm.

#### Handoffs proposed
- **Developer** — implement `SendFeedbackRequest` custom Action server script per spec above.
- **Code Reviewer** (post-build §6.2) — fires when Developer returns the script.
- **Performance & Scale Specialist** — validate the look-up query plan against the incident table; the conditions on `closed_at` and `x_acme_itsm_feedback_requested` should both be on indexed columns. Flag for index review.
- **ATF Author** — test suite per test approach above.

### Why this is the gold standard

This design exemplifies the *script delegation* pattern: the flow handles orchestration (scheduling, looping, aggregation, alerting), and the per-record work is delegated to a custom Action whose script body is a Developer concern. The flow design specifies the Action's contract (signature, inputs, outputs, role check, performance budget, idempotency posture) without writing the script — exactly the boundary the SKILL describes.

The idempotency design is the most important detail. A naive approach would set the flag and then send the email, leaving inconsistent state on send failure. The spec explicitly inverts this: send first, then flag — and only flag if send succeeded. This means a transient failure causes the record to be retried on the next run, rather than silently lost. The set-limit of 5000 plus the 60-day historical bound are also defensive against data anomalies (e.g., someone wipes the flag column en masse) — without them, a single bad day of data could flood ops with re-survey emails. The handoff to Performance & Scale for index review is the right routing-time consult: the Look Up Record's two conditions both need indexes, and confirming that is not the Flow Designer's job.

---

*End of Flow Designer Specialist EXAMPLES.md v1.0.*
