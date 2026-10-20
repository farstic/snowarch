# Estimation & Sizing Specialist — EXAMPLES

Worked examples of the two modes. Illustrative scopes only; story-point and person-day figures depend on the engagement's real team velocity and must be confirmed before any committed estimate. The §1.1 baseline-vs-custom delta is shown wherever a scope could go either way.

---

## Example 1 — Estimation consult: ROM for a feature described in one paragraph

**Scope (from the Chief Architect):** "Client wants managers to approve equipment requests in the portal, with an email reminder if not actioned in 2 business days, and a small report of pending approvals. How big is this?"

**Estimate — equipment-request manager approval**

**Method:** analogous + driver rubric  **Confidence:** ROM ±50% (scope is a paragraph, no design yet)
**Basis of estimate:** the one-paragraph description; analogy to prior baseline approval features.

**Assumptions** (each confirmable)
- Baseline-first path: baseline catalog item + Flow Designer approval + baseline notification + a standard report. *No custom table.*
- Managers approve via the baseline approval record (no fulfiller write-role) — see Licensing consult.
- "2 business days" uses an existing schedule; no new schedule build.
- One portal (Employee Center); no new portal.
- **Out of scope:** delegation/escalation chains, mobile-specific layout, data migration.

**Complexity breakdown**
| Component | Drivers | Size |
|---|---|---|
| Catalog item + variables | baseline config | S |
| Approval flow + 2-day reminder | one flow, one timer, one notification | M |
| Pending-approvals report | baseline report on `sysapproval_approver` | S |
| Test / ATF | single-component happy path + reminder edge | S–M |
| Release | one update set | S |

**Estimate (range, not a point)**
- **Baseline-first path: ~8–13 story points** (≈ 1 sprint for a typical 2-person ServiceNow team).
- Custom-object path (if a custom approval table were insisted on): **~21–34 points** + ongoing upgrade-regression — shown only to make the §1.1 delta explicit; not recommended.

**Contingency:** +15% for the reminder-timing edge cases (business-hours math is a classic underestimate).

**Risks / dependencies** → RAID (governance §4.3): business-schedule definition must exist; delegation may be in scope later (would re-baseline).

**Records into:** SPM Demand assessment → story points on the backlog (`markdown/it-business-management/agile-development/create-a-story.md`).

**Verify-before-commit:** team velocity (to convert points → dates); confirm baseline approval path is acceptable (kills the custom delta); confirm the schedule exists.

---

## Example 2 — Bottom-up estimate from an LLD (committed-grade)

**Scope:** an approved LLD for an outbound integration that posts P1/P2 incidents to an external ticketing system on resolve (the PP-13b example), plus its flow and one custom Script Include for payload shaping.

**Estimate — incident → external ticketing integration**

**Method:** bottom-up / WBS (a design exists)  **Confidence:** budgetary ±25% (committed ±10% achievable after a spike on the external API auth)
**Basis of estimate:** the LLD component list.

**Complexity breakdown (bottom-up)**
| Component | Drivers | Points |
|---|---|---|
| REST message + Connection & Credential Alias (OAuth2) | one outbound, token auth | 3 |
| IntegrationHub spoke action / flow trigger on resolve + P1/P2 filter | one flow, conditional | 5 |
| Payload-shaping Script Include | custom code, small | 3 |
| Retry / error handling / DLQ pattern | resilience | 5 |
| ATF coverage (REST step + flow) | single-app suite slice | 5 |
| Security & GRC review fixes (outbound payload) | consult rework buffer | 2 |
| Release (update set, ordered) | one app | 2 |
| **Subtotal** | | **25** |

**Contingency:** +20% (=5 pts) — concentrated on external API auth + sandbox availability, the two unknowns.
**Total: ~30 story points (range 27–34).**

**Risks / dependencies** → RAID: external sandbox/test credentials availability (blocker if late); OAuth2 client provisioning on the external side; rate limits on the external API (also a Licensing/Performance flag).

**§1.1 note:** two §1.1 objects are in scope — the Connection & Credential Alias (OAuth2) and the dead-letter store behind the DLQ pattern, which the Integration Specialist writes as "a §1.1-approved object named in the envelope". This estimate assumes the approved LLD records both approvals as ADRs; without them, each is a blocking OPEN QUESTION before commit. The Script Include is code, not a custom *table*. No custom-path delta to show.

**Records into:** Project cost/effort plan (`markdown/it-business-management/project-management/cost-plan-breakdown.md`); resource plan for the spike (`markdown/it-business-management/resource-management/`).

**Verify-before-commit:** velocity; whether a 1–2 day API-auth spike is approved (converts ±25% → ±10%).

---

## Example 3 — Estimate audit (re-baseline)

**Trigger:** "We estimated the SAM onboarding at 20 points and we're already at 28 with the import not done. What happened?"

**Estimate Audit — SAM onboarding**

| Driver | Original assumption | Reality | Effect |
|---|---|---|---|
| Data sources | 1 clean source | 3 sources, inconsistent keys | +dedup/coalesce effort |
| Migration volume | "small" | ~80k publisher/product rows | + reconciliation effort |
| Test | smoke | needed sample-audit reconciliation | +ATF/validation |

**Finding:** the original was a relative number sized as configuration; the migration drivers (multi-source, dedup, reconciliation) were never applied — a classic "happy-path only" miss. The 20 was a ROM masquerading as budgetary.

**Verdict: RE-BASELINE.** Revised estimate **34–40 points** (remaining ~10–14), method switched to bottom-up against the now-known source profile. Velocity holds; the gap was scope/complexity, not the team.

**Records into:** updated Demand assessment + corrected backlog points. **Hand-off:** Migration Specialist owns the dedup/reconciliation design that drives the revised number.

---

*End of Estimation & Sizing Specialist EXAMPLES.md.*
