# Operational Documentation v1.0 — Worked Examples

Two deliverables produced at go-live for a delivered capability: a **runbook** (operators) and a **KBA** (support/end users). Read alongside `SKILL.md`.

### Context

The "P1 auto-assign + notify" capability (a Business Rule + flow on `incident`, scope `x_acme_itsm`) is signed off for production. The user said *"we're ready for go-live"* → §6.2 proposed runbook + KBA authoring.

---

## Deliverable 1 — Runbook (operators / on-call)

```markdown
# Runbook: P1 Auto-Assign + Notify

**Capability:** On P1 incident create/upgrade, auto-assign to the on-call engineer of the
mapped assignment group and notify the major-incident channel. Scope: x_acme_itsm.

## 1. Purpose & scope
Covers operation, monitoring, and recovery of P1 auto-assign + notify. Does NOT cover
priority calculation (baseline impact/urgency) or the notification channel config.

## 2. Prerequisites & access
- Roles: `itil` (view incidents), `admin` or `x_acme_itsm` app admin (toggle the rule),
  `atf_test_admin` (run the regression suite).
- The on-call rota (`cmn_rota`) for each mapped group must be populated.

## 3. Normal operation
- A new P1 incident gets `assignment_group` + `assigned_to` set within seconds of insert.
- The "P1 raised" notification is sent to the major-incident group.
- Healthy indicator: no P1 incidents sitting unassigned > 2 min (see the P1 dashboard).

## 4. Procedures
- **Verify the rule is active:** Incident BR list → "P1 Auto-Assign" → Active = true.
- **Re-run assignment for a stuck P1:** open the incident → change Impact/Urgency so Priority recalculates to 2, then back to 1
  (re-triggers), or run the "Reassign P1" UI action. *(citation: `markdown/it-service-management/incident-management/def-prio-lookup-rules.md`)*

## 5. Alerts & response
- **Symptom: P1 unassigned > 2 min.** Diagnose: is the group's `cmn_rota` populated for now?
  → if empty, assign manually + fix the rota. Is the BR active? → if not, re-activate.
- **Symptom: no notification sent.** Check email/notification logs; confirm the notification
  record is active and the group has members.

## 6. Rollback / recovery
- Back out via the capability's **update set** (revert in the target instance), or set the
  "P1 Auto-Assign" BR Active = false to disable without removing. Document which you did.

## 7. Escalation
- Escalate to the Platform team (group: x_acme_platform) if the rule misfires across multiple
  P1s; page the on-call architect for a suspected logic defect.

## 8. References
- LLD §5 (P1 auto-assign); KBA "Why was my P1 auto-assigned?"; P1 operations dashboard.
```

---

## Deliverable 2 — Knowledge Base Article (support / agents)

```markdown
# KBA: Why was my P1 incident auto-assigned, and how to reassign it

**Target KB:** IT Support (kb_knowledge_base)
**Article template:** How-To
**Category:** Incident Management
**Validity / review:** review in 6 months
**Lifecycle:** Draft → Review → Published (do not publish without review)

## Summary
P1 incidents are automatically assigned to the on-call engineer of the responsible group and
the major-incident group is notified. This article explains the behaviour and how to reassign.

## Applies to
Agents (`itil`) working P1 incidents in x_acme_itsm.

## Prerequisites
`itil` role; membership of, or visibility into, the responsible assignment group.

## Steps — reassign an auto-assigned P1
1. Open the P1 incident.
2. Confirm the current `assigned_to` is correct for the active on-call window.
3. To reassign: change `assignment_group` (auto-assign re-resolves the on-call engineer), or
   set `assigned_to` directly and add a work note explaining why.
4. Save.

## Validation
The incident shows the new assignee and your work note; the assignee receives the assignment
notification.

## Related articles
- "P1 major-incident response process"
- Runbook: P1 Auto-Assign + Notify (operations)
```

*(citation: markdown/servicenow-platform/knowledge-management/create-knowledge-article.md, markdown/servicenow-platform/knowledge-management/configure-knowledge-article-templates.md, markdown/servicenow-platform/knowledge-management/approve-article-in-review.md)*

---

## Publishing & ownership
- **KBA:** lives in the IT Support KB; owner = the IT Support knowledge_manager; validity review in 6 months; published only after review.
- **Runbook:** stored as a KBA in an internal Operations KB (or the team wiki if that's the engagement standard); maintained by the Platform team; reviewed each release.

## Open questions
OQ-CN-1. Which knowledge base is the canonical home for internal runbooks in this engagement — a KB, or an external wiki? (Affects where the runbook is published.)
OQ-CN-2. Should the KBA be visible on the customer/employee portal, or internal-only? (Drives the article's user criteria — Security & GRC consult if external.)

---

## Reading these examples

- The **runbook** is imperative and scannable — indicators, procedures, alert response, rollback, escalation — for the engineer on call.
- The **KBA** is authored in `kb_knowledge` against a How-To **template**, categorised, given a **validity/review** date, and routed **review → publish** — never published straight to live.
- Neither uses a custom documentation table (§1.1): the KBA is baseline `kb_knowledge`; the runbook is a KBA or an external doc.

---

*End of Operational Documentation EXAMPLES.md v1.0.*
