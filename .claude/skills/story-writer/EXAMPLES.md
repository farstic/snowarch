# Story Writer — Examples

Three gold-standard examples of Story Writer output. Each example shows the input, the produced Gherkin Feature file(s), the open questions, the proposed supporting stories, and the post-build §6.2 handoff manifest.

---

## Example 1 — Workshop transcript → multi-Feature epic for Major Incident escalation

### Input prompt

> *"Here's the transcript from the GSC workshop on P1 incident escalation. We need sprint-ready stories. Module: ITSM, workspace: Service Operations Workspace, roles: itil, major_incident_manager, gsc_l1_operator (engagement alias), gsc_shift_lead (engagement alias). Australia release.*
>
> *Workshop excerpt:*
>
> *GSC Lead: 'When a P1 lands, we want auto-paging to the on-call major incident manager within 60 seconds. Right now it's manual via WhatsApp and we lose the audit trail.'*
>
> *Service Manager: 'Also we need a war room link generated and posted to the incident, and a banner on the incident form so anyone opening it knows it's actively being managed.'*
>
> *GSC Lead: 'And when the MIM closes the incident, the war room should be archived not deleted — we use them for postmortems.'*
>
> *Operations: 'If the on-call schedule has no one on duty — say a public holiday gap — it should escalate to the shift lead automatically with a flag in the audit trail.'"*

### Expected output

#### Step 1 — Explicit requirements extracted

| # | Requirement | Source |
|---|---|---|
| R1 | P1 incidents auto-page the on-call major incident manager within 60 seconds | GSC Lead |
| R2 | A war room link is generated and posted to the incident | Service Manager |
| R3 | A banner on the incident form indicates active major-incident management | Service Manager |
| R4 | War rooms are archived (not deleted) when the incident is closed | GSC Lead |
| R5 | If no on-call MIM is scheduled, escalation falls back to the shift lead with audit trail | Operations |

#### Step 2 — Inferred requirements

- **INFERRED:** Auto-paging needs the on-call shift table, Shift [`cmn_rota`] *(citation: `markdown/it-service-management/on-call-scheduling/tables-oob-oncall.md`)*, and the on-call API. Confirm rota structure.
- **INFERRED:** "Within 60 seconds" implies async/event-driven, not synchronous business rule.
- **INFERRED:** "War room" likely means a Microsoft Teams channel — confirm collaboration platform.
- **INFERRED:** Banner is a `incident.work_notes` annotation OR a Form-level UI message — the implementation choice belongs to the Technical Designer.

#### Step 3 — Feature files

```gherkin
Feature: Auto-page on-call major incident manager on P1 declaration
  As a gsc_l1_operator
  I want a P1 incident to auto-page the on-call major_incident_manager within 60 seconds
  So that we eliminate manual WhatsApp paging and capture the escalation in the audit trail

  Background:
    Given the user is logged into Service Operations Workspace
    And the user holds the role gsc_l1_operator
    And an on-call rota is configured for the Major Incident Manager group

  Scenario: P1 incident with on-call MIM available
    Given a new incident is created with priority = "1 - Critical"
    When the incident state moves to In Progress (state=2)
    Then within 60 seconds the on-call major_incident_manager is paged via the configured channel
    And the page event is recorded in the incident's audit history with channel and timestamp
    And the incident's assigned_to field is set to the on-call MIM

  Scenario: P1 incident with no on-call MIM scheduled
    Given a new incident is created with priority = "1 - Critical"
    And no major_incident_manager is on call at the current time
    When the incident state moves to In Progress (state=2)
    Then within 60 seconds the gsc_shift_lead is paged as the fallback
    And the audit history records "MIM rota gap — escalated to shift lead"
    And the incident is tagged "rota gap" for follow-up

  Scenario: Paging service unavailable
    Given the paging integration is unavailable
    When a P1 incident is declared
    Then the page failure is logged with retry-scheduled=true
    And the gsc_shift_lead receives an email with the incident URL as a fallback
    And the audit history records the integration failure with timestamp

  # OPEN QUESTIONS
  # OQ-ST-1. Confirm the paging channel — is this OpsGenie, PagerDuty, ServiceNow native push, or a custom integration?
  # OQ-ST-2. ASSUMPTION: "60 seconds" is end-to-end (incident state change → page received). Confirm SLA boundary.
  # OQ-ST-3. What is the shift_lead fallback's own fallback — i.e., if the shift lead is also unavailable?
  # OQ-ST-4. Should reopened P1 incidents re-page? Or only first declaration?
```

```gherkin
Feature: War room provisioned on P1 declaration and archived on closure
  As a major_incident_manager
  I want a collaboration war room to be auto-provisioned on P1 declaration and archived on closure
  So that I have an immediate communication channel and a postmortem-usable artefact

  Background:
    Given the user is logged into Service Operations Workspace
    And the user holds the role major_incident_manager

  Scenario: War room created on P1 declaration
    Given a P1 incident has just been declared
    When the auto-page event fires (per Feature: Auto-page MIM)
    Then a war room is provisioned on the configured collaboration platform
    And the war room URL is posted to incident.work_notes with prefix "WAR_ROOM:"
    And a Form-level banner displays "Active Major Incident — War room: <link>" for any user opening the incident

  Scenario: War room archived on incident closure
    Given an incident with an active war room URL in work_notes
    When the incident state moves to Closed (state=7)
    Then the war room is archived (not deleted) on the collaboration platform
    And the archive timestamp is recorded in incident.work_notes

  # OPEN QUESTIONS
  # OQ-ST-1. Confirm the collaboration platform — Microsoft Teams, Slack, Webex?
  # OQ-ST-2. ASSUMPTION: Banner is a Form-level UI message keyed off incident.priority and incident.state. Confirm with UI/UX before design.
  # OQ-ST-3. Postmortem use of archived war rooms — should there be a permission model on archived rooms (read-only for non-MIM)?
```

#### Step 4 — Supporting stories proposed

- **Access control story** — who can see the war room URL on the incident (currently any user opening the form sees the banner; should this be restricted?)
- **Audit and traceability story** — page-event audit trail is in scope; confirm retention policy
- **Notification story** — fallback email to shift lead is in scope; confirm template
- **Reporting story** — MIM rota-gap dashboard for ops review (R5 driver)
- **Test data and ATF story** — ATF coverage for both Features, including rota-gap scenario which requires test rota data
- **Documentation story** — runbook for GSC L1 operators on what to do if the auto-page fails

#### Step 5 — Post-build §6.2 manifest

> Stories produced (2 Features, 5 supporting stories proposed). Proposing the following downstream handoffs:
>
> 1. **Technical Designer** — design the table model, ACLs, business rules, and flows that satisfy the acceptance criteria. Proceed?
> 2. **ATF Author (sub-agent mode)** — full epic-level test coverage across both Features. Proceed?
> 3. **HLD/LLD Writer** — this epic spans paging, collaboration platform integration, and audit retention. Proposing HLD authoring before sprint planning. Proceed?
> 4. **Operational Documentation** — runbook for GSC L1 operators on auto-page failure handling. Proceed?

### Explanation

This example shows the canonical transcript-to-stories chain. The Story Writer extracted explicit requirements verbatim, surfaced inferred requirements with `INFERRED:` labels, and split the Feature into two — auto-paging and war-room — because they have different actor personas and different integration touchpoints. Each Feature has the mandatory unauthorised-caller equivalent (rota-gap fallback) and integration-failure scenario.

The OPEN QUESTIONS deliberately push design choices to the Technical Designer (banner implementation, collaboration platform choice) rather than guessing. This is the correct boundary — Story Writer captures the *what*, Technical Designer decides the *how*.

The §6.2 manifest correctly identifies that this is an upstream-builder output: no JS code block, so no Code Reviewer trigger. Instead, the manifest proposes downstream-builder dispatches plus the cross-cutting consults (HLD/LLD Writer, Operational Documentation).

---

## Example 2 — Single feature request → one Feature with proposed sub-stories

### Input prompt

> *"Write a story for HR Lifecycle Event onboarding case auto-creation when a new sys_user record lands from Workday. HRSD module, Employee Center portal, roles: sn_hr_core.basic, sn_hr_core.manager. Australia release."*

### Expected output

```gherkin
Feature: Auto-create HR onboarding case when new sys_user lands from Workday
  As a sn_hr_core.basic HR operations user
  I want an HR onboarding case to be auto-created when a new sys_user record arrives from Workday
  So that the new starter has an active onboarding workflow before their first day with no manual case-creation step

  Background:
    Given the Workday → ServiceNow integration is configured and operational
    And a Lifecycle Event template "Standard Onboarding" is configured in HRSD

  Scenario: New sys_user lands from Workday with onboarding-eligible u_employee_type
    Given a new sys_user record is created via the Workday integration
    And the sys_user.u_employee_type is one of "Permanent", "Fixed-Term Contractor"
    And sys_user.start_date is in the future or today
    When the integration commits the new record
    Then an sn_hr_core_case is created within 5 minutes
    And the case template is "Standard Onboarding"
    And the case.subject_person is set to the new sys_user
    And the case.opened_for is set to the new sys_user's manager (sys_user.manager)
    And the new sys_user receives a welcome notification at sys_user.email

  Scenario: New sys_user lands but u_employee_type is excluded
    Given a new sys_user record is created via the Workday integration
    And the sys_user.u_employee_type is "Intern" or "External Consultant"
    When the integration commits the new record
    Then no sn_hr_core_case is auto-created
    And the audit history records "onboarding skipped — excluded u_employee_type"

  Scenario: Workday integration delivers a sys_user with missing manager reference
    Given a new sys_user record arrives without a populated manager field
    When the integration commits the new record
    Then an sn_hr_core_case is still created (with case.opened_for left empty)
    And the case is auto-assigned to the HR triage queue with priority = High
    And a system notification flags "manager reference missing — manual triage required"

  Scenario: Lifecycle Event template "Standard Onboarding" is unpublished
    Given the Lifecycle Event template "Standard Onboarding" is in Draft state
    When a new eligible sys_user lands from Workday
    Then no sn_hr_core_case is auto-created
    And the failure is logged with reason "LE template unavailable"
    And the HR Service Delivery admin (sn_hr_core.admin) receives a notification

  # OPEN QUESTIONS
  # OQ-ST-1. Confirm the trigger boundary — is this on sys_user.insert from Workday only, or also on sys_user updates that flip u_employee_type to onboarding-eligible?
  # OQ-ST-2. ASSUMPTION: "5 minutes" is a soft target; the underlying mechanism is async (Flow triggered by sys_user insert event). Confirm acceptable latency.
  # OQ-ST-3. Should rehires (sys_user with prior employment history) follow Standard Onboarding, or a "Rehire" template variant?
  # OQ-ST-4. Workday delivers what timezone for start_date? UTC, employee local, or HR ops local? Affects the "in the future or today" check.
```

#### Supporting stories proposed

- **Access control story** — who can override the auto-creation? Who can re-trigger if it failed?
- **Audit and traceability story** — case-creation audit (in scope); also need integration-payload audit for compliance.
- **Notification story** — welcome notification (in scope); also failure notification to HRSD admin (in scope); confirm template ownership.
- **Reporting story** — onboarding-case-creation success rate dashboard (signals integration health).
- **Test data and ATF story** — ATF needs synthetic Workday payload generator; flag for the ATF Author handoff.
- **Documentation story** — KBA for HR ops on what to do when the rehire OPEN QUESTION is resolved.

#### Post-build §6.2 manifest

> Story produced (1 Feature, 6 supporting stories proposed). Proposing:
>
> 1. **Technical Designer** — design the Flow (trigger on sys_user insert, filter on u_employee_type, call Lifecycle Event service), the integration touchpoint with Workday for payload audit, and the failure-handling subflow. Proceed?
> 2. **ATF Author (skill mode)** — single-Feature test coverage including the four scenarios plus the synthetic Workday payload setup. Proceed?
> 3. **HRSD Specialist (consult)** — verify Lifecycle Event template structure and rehire-handling pattern against HRSD baseline before design. Proceed?

### Explanation

This is a single-Feature story but it surfaces an HRSD-specialist consult in the manifest because the rehire OPEN QUESTION genuinely needs HRSD platform expertise to answer correctly. The Story Writer doesn't pretend to know HRSD baselines — it routes the question.

The four scenarios cover happy path, exclusion, partial-data fallback, and configuration failure (LE template unpublished). All four are observable; none reference implementation details. The "5 minutes" latency assumption is surfaced explicitly rather than baked into the scenario, leaving the async mechanism choice to the Technical Designer.

---

## Example 3 — Sprint-ready CSM case routing story with embedded ATF outline

### Input prompt

> *"Tier-2 CSM agents need cases auto-routed when an account hits a contract-renewal trigger. Specifically: any case opened against an account with `contract.u_renewal_status = 'AT_RISK'` should auto-assign to the account's Customer Success Manager. CSM module, CRM Workspace, roles: sn_customerservice_agent (tier-2), sn_customerservice.relationship_agent (CSM alias). Australia release. Sprint planning kicks off Monday — needs to be ready."*

### Expected output

*Surface naming: the corpus renamed **CSM Configurable Workspace** to **CRM Workspace**; the steps below use the current name.*

```gherkin
Feature: Auto-route case to CSM when account contract is at-risk
  As a sn_customerservice_agent
  I want cases against at-risk accounts to be auto-assigned to the account's Customer Success Manager
  So that high-stakes customer interactions land with the relationship owner immediately, not after triage delay

  Background:
    Given the user is logged into CRM Workspace
    And the user holds the role sn_customerservice_agent
    And the case is being opened against an existing account record
    And the account has at least one active contract record

  Scenario: Case opened against at-risk account with assigned CSM
    Given the account.u_primary_contract.u_renewal_status is "AT_RISK"
    And the account has a u_customer_success_manager populated (role sn_customerservice.relationship_agent)
    When the case is inserted
    Then case.assigned_to is set to account.u_customer_success_manager
    And case.priority is elevated to "High" if originally "Moderate" or below
    And case.work_notes records "auto-routed to CSM due to contract.u_renewal_status=AT_RISK"

  Scenario: Case opened against at-risk account with no CSM assigned
    Given the account.u_primary_contract.u_renewal_status is "AT_RISK"
    And the account.u_customer_success_manager is empty
    When the case is inserted
    Then case.assigned_to is set to the account.u_relationship_manager_team (default queue)
    And a notification is sent to the team manager
    And case.work_notes records "AT_RISK account, no CSM assigned — escalated to team queue"

  Scenario: Case opened against at-risk account, CSM is on leave
    Given the account.u_primary_contract.u_renewal_status is "AT_RISK"
    And the account.u_customer_success_manager.u_on_leave is true
    When the case is inserted
    Then case.assigned_to falls back to account.u_customer_success_manager.u_delegate
    And case.work_notes records "primary CSM on leave — assigned to delegate"

  Scenario: Account has multiple contracts with mixed renewal status
    Given the account has multiple contracts
    And at least one contract.u_renewal_status is "AT_RISK"
    When the case is inserted
    Then auto-routing fires (any AT_RISK contract triggers the rule)
    And case.work_notes records the specific at-risk contract number

  # OPEN QUESTIONS
  # OQ-ST-1. Confirm "u_primary_contract" — is this a designated contract on the account, or "the most recent contract"? Affects the lookup logic.
  # OQ-ST-2. ASSUMPTION: Cases reopened later don't re-trigger routing (assigned_to stays). Confirm.
  # OQ-ST-3. What about cases opened by the CSM themselves on their own account? Should auto-routing still fire? (Likely no.)
  # OQ-ST-4. Does priority elevation apply to all severities including "Critical"? (No-op there, but worth confirming.)

  # ATF outline (for downstream ATF Author handoff)
  # TC-01: Happy path — at-risk account, CSM assigned → case.assigned_to = CSM, priority elevated
  # TC-02: At-risk account, no CSM → fallback to team queue
  # TC-03: At-risk account, CSM on leave → fallback to delegate
  # TC-04: Multiple contracts mixed → routing fires on first AT_RISK match
  # TC-05: Account not at-risk → no auto-routing (negative case)
  # TC-06: CSM opens case on own account → no auto-routing (covers OQ-ST-3 if confirmed)
  # TC-07: Reopen of resolved case → assigned_to unchanged (covers OQ-ST-2 if confirmed)
```

#### Sprint metadata

- **Story points (estimate):** 5
- **Dependencies:** Account record must have `u_customer_success_manager` and `u_relationship_manager_team` fields populated for at-risk accounts (data hygiene precursor — flag as separate story if not).
- **Sprint candidate:** Yes, ready for design dispatch immediately.

#### Post-build §6.2 manifest

> Story produced (1 Feature, 4 happy + edge scenarios, embedded ATF outline). Proposing:
>
> 1. **Technical Designer** — design the auto-routing mechanism (Flow vs Business Rule decision, with rationale; account.u_primary_contract lookup pattern; `u_customer_success_manager.u_delegate` field). Proceed?
> 2. **ATF Author (skill mode)** — convert embedded TC-01..TC-07 outline into ATF coverage. Proceed?
> 3. **CSM Specialist (consult)** — verify account.u_primary_contract semantic and u_customer_success_manager.u_delegate pattern against CSM baseline. Proceed?
> 4. **Data hygiene precursor story** — flag separately if account-data audit shows gaps in `u_customer_success_manager` population. Proceed?

### Explanation

This example shows a Story Writer producing a sprint-ready output with an embedded ATF outline directly inside the Feature file as comments. This is the right pattern when the user signals sprint urgency — the ATF Author skill receives a structured starting point rather than re-deriving test cases from scratch.

The story correctly slices the at-risk scenarios into four observable cases including the multi-contract mixed-status edge case, which is the kind of edge case real product owners forget. Three of the four OPEN QUESTIONS materially affect the design choice (u_primary_contract semantic, reopen behaviour, self-routing edge case). The fourth is a low-risk confirmation.

The §6.2 manifest also surfaces a **CSM Specialist consult** — Story Writer writes the account fields the request describes as the engagement's own (`u_`), and doesn't pretend to know whether a baseline construct should replace them: the corpus keeps an account's team as Account Team Members [`sn_customerservice_team_member`] *(citation: `markdown/customer-service-management/r_TIWCustomerService.md`)*. That goes to the domain expert before design starts.

---

*End of Story Writer EXAMPLES.md v1.0.*
