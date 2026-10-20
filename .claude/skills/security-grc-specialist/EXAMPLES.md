# Security & GRC Specialist v1.0 — Worked Examples

Two examples, one per mode: a routing-time **Constraint Note** and a post-build **Review Report**. Read alongside `SKILL.md`. Grounded in the Australia branch.

---

## Example 1 — Routing-time consult (Constraint Note)

### Context

The Chief Architect is routing a CSM design where customer contacts include PII, and resolved cases will surface related ITSM incidents to support staff. The §3.1 triggers **PII handling** and **sensitive data crossing the CSM↔ITSM boundary** fired, so the Security & GRC Specialist is consulted *before* Technical Designer is dispatched.

### Output

```markdown
# Security & GRC Constraint Note — CSM case access with customer PII, visible alongside ITSM incidents

**Mode:** Routing-time consult (§3.1)
**Triggers that fired:** PII handling; sensitive data crossing CSM↔ITSM boundary; non-trivial ACL design

## Access-control constraints
- `sn_customerservice_case` and `customer_contact` require **field-level ACLs**, not record-only — contact PII (email, phone, address) must be field-gated even for users who can read the case.
- Default-deny stance: support staff who can read an *incident* must NOT automatically inherit read on the related *case's* customer PII. The cross-domain visibility is to the shared service/CI layer (per the CMDB & CSDM envelope), **not** to customer contact fields.
- Compose baseline roles (`sn_customerservice_agent`, `itil`) — do not invent a new "cross-domain" role; gate the PII fields by `sn_customerservice_agent`, and expose only non-PII service context to `itil`.
- Read/write/create/delete each evaluated; PII fields write-gated to the agent role.

## Data classification & protection constraints
- Classify contact email/phone/address as PII with **Data Classification** on their dictionary entries. (citation: markdown/platform-security/data-classification/exploring-data-classification.md)
- Redact PII from work notes, notifications, and any outbound payload that ITSM or an integration consumes.
- If GDPR applies, confirm lawful basis + retention for contact data; flag right-to-erasure handling.

## Audit & GRC constraints
- Enable baseline audit on PII fields (dictionary `audit=true`) — no custom audit table. (citation: markdown/platform-security/audit-mgmt-console.md)
- If the engagement is in regulated scope, map case-data handling to a Policy & Compliance control + attestation. (citation: markdown/governance-risk-compliance/attestation-template-reference.md)

## §1.1 verdict
**Configuration-only — PROCEED.** Field ACLs, baseline roles, Data Classification, and field audit are all baseline configuration. No custom security table, scope, or group structure required.

## Anti-patterns to block (hand to the builder)
- Do not grant `itil` read on `customer_contact` PII fields to "make the incident view convenient" — expose only the shared service record. (citation: markdown/platform-security/access-control/access-control-rules.md)
- Do not rely on a permissive `*` field ACL — it shadows stricter field rules. (citation: markdown/platform-security/access-control/acl-denial-behavior.md)
- Do not copy PII into the incident or its work notes to bridge the domains — reference the shared service layer instead.

## Validation
Run Access Simulator for an `itil`-only user against a case with PII to prove the fields are denied before go-live. (citation: markdown/platform-security/access-control/access-simulator.md)
```

---

## Example 2 — Post-build architectural-security review (Review Report)

### Context

Technical Designer returned a case-access spec built against the Constraint Note above. Two issues: a sensitive field was left readable by a broad role, and the spec proposed a custom table to log who viewed PII.

### Output

```markdown
# Security & GRC Review: CSM Case Access Model spec

**Reviewer:** Security & GRC Specialist (skill, main thread)
**Artefact:** Technical Designer — "CSM Case Access Model" spec
**Constraint Note ref:** CSM case access with customer PII (Example 1)
**Verdict:** REWORK

## Summary
The role model and most field ACLs align with the Constraint Note, but one PII field is world-readable to `itil` and the spec introduces a custom PII-access-log table that duplicates baseline audit. Two blocking issues.

## Findings

### [SEC-FIELD][block] customer_contact.phone readable by itil
**Dimension:** Field-level security
**Issue:** The field-ACL matrix gates `email` and `address` to `sn_customerservice_agent` but leaves `phone` with a record-level read only, so any `itil` user opening the related incident can read it.
**Impact:** PII leak across the CSM↔ITSM boundary — exactly the exposure the Constraint Note prohibited.
**Recommendation:** Add a field read ACL on `customer_contact.phone` requiring `sn_customerservice_agent`; verify with Access Simulator.
**Source:** markdown/platform-security/access-control/acl-rule-types.md

### [GOV][block] Custom PII-access-log table proposed
**Dimension:** §1.1 / Audit
**Issue:** Spec proposes `x_acme_pii_access_log` to record who viewed PII. This duplicates baseline audit/access observation and was not approved in the dispatch envelope.
**Impact:** §1.1 violation; off-model audit store, upgrade and evidence risk.
**Recommendation:** Use baseline field audit + Access Observer; remove the custom table. If a stricter view-access trail is genuinely required, raise an OPEN QUESTION — CUSTOM OBJECT PROPOSAL.
**Source:** markdown/platform-security/audit-mgmt-console.md, markdown/platform-security/access-observer.md

### [SEC-PII][consider] Notification template includes contact email
**Dimension:** Sensitive-data handling
**Issue:** The "case assigned" notification interpolates the contact email into the body.
**Impact:** PII in notification logs/inboxes beyond need.
**Recommendation:** Reference the contact by name/ID; drop the email from the template body.

## Strengths
- Field ACLs on `email`/`address` correctly gated to the agent role.
- Cross-domain visibility correctly limited to the shared `cmdb_ci_service_*` layer, not customer fields.
- Default-deny respected on the case record.

## Verdict rationale
Two `block` findings (one PII field exposure, one §1.1 custom-table violation) require rework before this can proceed. The underlying role model is otherwise sound.

## Handoff
Re-dispatch Technical Designer with these findings as the rework brief. Re-review after rework. On clean re-review, recommend an Access Simulator validation run before go-live.
```

---

## Reading these examples

- **Example 1 (consult mode)** — fires *before* the builder; converts §3.1 triggers into forward security constraints + a §1.1 verdict. Configuration-only is the common outcome — ACLs/roles/attributes are baseline.
- **Example 2 (review mode)** — fires *after* a builder; same severity vocabulary as Code Reviewer; a PII field exposure is `block`, and an unapproved custom security table is `[GOV][block]` sufficient on its own to REWORK.

Both stay at architecture level — no ACL scripts, no Script Includes. Code-level security (missing `gs.hasRole`, injection) remains Code Reviewer's checklist 3.

---

*End of Security & GRC Specialist EXAMPLES.md v1.0.*
