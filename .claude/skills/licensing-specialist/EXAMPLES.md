# Licensing & Entitlement Specialist — EXAMPLES

Worked examples of the two modes. Illustrative scopes only — every SKU/tier/user-count claim must be confirmed against the engagement's real subscription before commitment (governance/governance-rules.md §1.1 applies to any custom object referenced).

---

## Example 1 — Routing-time consult: a new "approver" role on a portal-facing process

**Scope (from the Chief Architect dispatch):** "We're adding a manager-approval step to the equipment-request catalog item. Managers (≈600 users) need to open the request, see the requested item and cost, and approve or reject. Design proposes a new role `x_acme_equip.approver` with write access to the request table."

**Licensing & Entitlement Constraint Note — equipment-request manager approval**

**Triggers:** new role granting write access · large affected population (≈600)

**Subscription / fulfiller impact**
The proposed `x_acme_equip.approver` grants *write* on the request task table. A role that lets a user fulfil/modify task records generally maps to a **fulfiller-type subscription**, which is paid per user. Pushed to ≈600 managers, this is a material subscription delta — potentially 600 fulfiller subscriptions for what is, functionally, an *approval* action.
*The baseline approval model does not require fulfiller access:* approvals run on `sysapproval_approver`, surfaced in Employee Center / the portal, and an approver acts via the approval record — not by writing the task. Requester/approver activity is covered by the lighter subscription class. *(citation: `markdown/platform-administration/managing-user-subscriptions-v2.md`, `exploring-subscription-management-v2.md`)*

**SKU / plan coverage**
Catalog + Flow Designer approvals are baseline platform — no premium SKU needed. VERIFY: nothing here assumes Pro/Enterprise.

**App Engine footprint**
None *if* this stays on the baseline request/approval tables. If the design instead introduces a custom approval table, that is an App Engine footprint **and** a §1.1 trigger — see commercial note. *(citation: `markdown/platform-administration/allocating-custom-tables-subscr-apps-v2.md`)*

**§1.1 commercial note**
The write-granting role is the expensive path twice over: 600 fulfiller subscriptions *and* an avoidable deviation from the baseline approval model. Recommend the Chief Architect route this to the baseline approval engine rather than a write role.

**Constraints to hand the builder**
- Do **not** grant write on the task table to managers. Use the baseline approval record (`sysapproval_approver`) + a Flow Designer approval step.
- Managers approve from Employee Center / portal; no fulfiller subscription required for the approval path.
- If a manager genuinely needs to *edit* the request (not just approve), that is a separate, smaller population — size that explicitly.

**Verify-before-commit**
- Confirm the client's count of existing fulfiller subscriptions and headroom.
- Confirm managers are licensed only for requester/approver activity today (not already fulfillers).

---

## Example 2 — Post-build review: a Now Assist summarization step in a high-volume flow

**Artefact under review (from Now Assist Specialist / Flow Designer):** an agentic step that calls a Now Assist summarization skill on **every** inbound case (≈12,000 cases/month) to pre-fill a summary field, plus a custom table `x_acme_cs.case_ai_summary` to store each generated summary and its model metadata.

**Licensing & Entitlement Review Report — case AI summarization**

| # | Finding | Severity | Tag |
|---|---|---|---|
| 1 | Now Assist skill invoked unconditionally on ≈12,000 cases/month — each invocation consumes **Assists** from the AI entitlement. At one call per case minimum, that is ≈12,000 actions/month from this step alone — ≈12,000 Assists at an assist ratio of 1, more where the skill's ratio is higher — before any other AI feature. No volume cap or confidence gate. | fix-before-prod | `[LIC-AI]` |
| 2 | Design assumes the Now Assist AI SKU is owned and has the Assists capacity for this volume. Not confirmed in the dispatch envelope. | fix-before-prod | `[LIC-AI]` |
| 3 | Custom table `x_acme_cs.case_ai_summary` stores the generated summary + metadata. This consumes a **custom table entitlement** of the subscription the table is mapped to and adds to the app's App Engine footprint — and the summary already has a baseline home (a field on the case + the activity/work-notes stream). This is both a licensing cost and a §1.1 concern. | block | `[LIC-AE]` |

**Verdict: REWORK** (one block).

**Recommendations**
1. Gate the summarization: invoke only where it adds value (e.g., cases over a length threshold, or on agent demand) rather than unconditionally on insert — directly reduces Assists consumption. Model expected Assists = (gated case volume × calls per case) × the skill's **Assist ratio**. *(citation: `markdown/platform-administration/monitoring-now-assist-usage.md`)*
2. Confirm the AI SKU and its Assists allowance against this monthly volume before go-live; if capacity is short, that is an upgrade cost to surface now, not at the true-up.
3. Drop the custom `case_ai_summary` table. Write the summary to a baseline field on the case and rely on the audit/activity stream for history — frees the custom table entitlement it would consume and resolves the §1.1 issue. If model-metadata retention is a hard requirement, that is an `OPEN QUESTION — CUSTOM OBJECT PROPOSAL` for the Chief Architect with the App Engine cost stated. *(citation: `markdown/platform-administration/allocating-custom-tables-subscr-apps-v2.md`)*

**Verify-before-commit:** AI SKU ownership + Assists capacity; whether model-metadata retention is genuinely required or a nice-to-have.

---

## Example 3 — Quick SKU-coverage call (clarification path)

**Question:** "Does the proposed Predictive Intelligence auto-categorization on incidents need anything we might not have?"

**Response (clarification mode):**
Auto-categorization via Predictive Intelligence is a capability that depends on the client's owned product tier — it is commonly a Pro/Enterprise-tier feature, not baseline ITSM Standard. I will not assert your coverage from memory; it is plan-specific. *(citation: `markdown/platform-administration/subscription-management-reference-v2.md`)*

**To answer firmly, confirm:** (a) your ITSM tier (Standard / Pro / Enterprise), and (b) whether Predictive Intelligence is listed in your active subscription. If it is not in the owned tier, the design needs either a tier upgrade (recurring cost — surface now) or a baseline categorization approach (assignment rules / a categorization catalog + Flow Designer) that stays inside Standard. I can hand the baseline alternative to the Technical Designer if the tier is not owned.

---

*End of Licensing & Entitlement Specialist EXAMPLES.md.*
