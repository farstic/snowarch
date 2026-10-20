# Discovery Specialist v1.0 — Worked Example

One example: turning a short CSM blueprint excerpt into the structured Discovery Output the gateways and Story Writer consume. Read alongside `SKILL.md`.

---

## Example — Extract a Discovery Output from a CSM blueprint excerpt

### Source (excerpt provided to Discovery)

> *"We're a B2B software vendor. Customers raise support cases via a portal and email. Agents work cases in ServiceNow. When a case is about a product outage, support needs to see the related infrastructure incident and its impact. High-value (Platinum) customers must be routed to a senior queue and get faster SLAs. ~40,000 cases/year, growing 20%. Cases contain customer contact details and sometimes attached logs. We have an existing CRM we may need to pull account data from."*

### Output

```markdown
# Discovery Output: CSM support — case management + ITSM impact visibility

**Source:** Blueprint excerpt
**Module(s) in scope:** CSM (primary); ITSM (incident impact); CMDB & CSDM (shared service layer); Integration (CRM)

## Process scope
Customer case lifecycle (portal + email intake → agent triage → resolution); entitlement/SLA by customer tier; visibility from a case to the related infrastructure incident and its service impact.

## Current-state artefacts
- Existing external **CRM** holding account data (integration candidate).
- No stated existing ServiceNow CSM customisation (assume baseline until confirmed).
- Channels today: portal + email.

## Target-state requirements   (MoSCoW)
- **M** Customers raise cases via **portal** and **email** (baseline Customer Service Portal + inbound email).
- **M** Agents work cases in a **CRM Workspace (formerly CSM Configurable Workspace)**.
- **M** On a product-outage case, agents see the **related ITSM incident** and its **service impact** (shared CSDM service layer).
- **M** **Platinum** customers route to a **senior queue** with **faster SLAs** (entitlement/SLA by tier).
- **S** Account data sourced/synced from the **external CRM**.

## Volume context
~40,000 cases/year, +20% growth (→ ~48k next year); peak/concurrency unknown (OPEN QUESTION).

## Sensitivity classification
**PII** (customer contact details) and potentially sensitive **attached logs** → Security & GRC consult indicated; cross-domain visibility (case ↔ incident) must not leak PII to ITSM staff.

## Personas & roles
- Customer (portal user / contact).
- CSM Agent (`sn_customerservice_agent`) — senior-queue subset.
- ITSM support (`itil`) — consumes incident/impact, not customer PII.

## Gap analysis
| Gap | Category | Severity | Note |
|---|---|---|---|
| Case→incident→service visibility | data / UX | major | Needs the shared CSDM service layer + workspace side panel |
| Tier-based routing + SLA | process | major | Baseline entitlement/assignment + SLA-by-tier candidate |
| CRM account sync | integration | major | One-time vs ongoing? drives Integration vs Migration |
| PII across CSM↔ITSM boundary | data / security | blocker-if-unhandled | Field-level ACL design (Security & GRC) |

## §1.1 implications to flag for the gateway
- "Senior queue", "faster SLAs", tier routing — *likely baseline* (assignment groups + entitlements + `contract_sla`), but the **CSM gateway** must issue the §1.1 verdict. Flagged, not ruled.
- Shared case↔incident service layer — **CMDB & CSDM gateway** to confirm baseline (no bridging table). Flagged.

## Routing recommendation
Fire **CSM + ITSM + CMDB & CSDM** gateways (cross-domain, co-fire); sequence builders Technical Designer → (Integration for CRM) → Flow Designer → Developer; **UI/UX** for the workspace + portal; **§3.1 consults: Security & GRC** (PII), **Performance & Scale** (40k+/yr growth). Then Story Writer (PP-04) for the backlog.

## OPEN QUESTIONS
OQ-DC-1. CRM sync — **one-time migration** or **ongoing integration**? (Default: ongoing → Integration Specialist.)
OQ-DC-2. Peak/concurrency numbers? (Default: derive from 40k/yr business-hours distribution; confirm.)
OQ-DC-3. B2B only, or also B2C consumers? (Default: B2B accounts + contacts.)
OQ-DC-4. Are attached logs regulated/retention-bound? (Default: treat as sensitive; Security & GRC to confirm.)
```

---

## Reading this example

- Discovery **structures** the raw blueprint into the exact fields the gateways expect — it does **not** design tables, flows, or rule on §1.1.
- NFRs (40k+/yr, PII) are captured explicitly because they **trigger the §3.1 consults** (Performance & Scale, Security & GRC) downstream.
- Every ambiguity is an **OPEN QUESTION with a proposed default** — nothing is silently assumed.
- The routing recommendation sets up the multi-gateway co-fire and the sequenced build — the Chief Architect takes it from there.

---

*End of Discovery Specialist EXAMPLES.md v1.0.*
