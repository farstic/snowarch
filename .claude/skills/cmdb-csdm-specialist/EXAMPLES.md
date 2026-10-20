# CMDB & CSDM Specialist v2.0 — Worked Examples

Three examples exercising each §1.1 verdict path. Each shows the full 5-Part Constraint Envelope for a realistic CMDB/CSDM dispatch. Read alongside `SKILL.md`. Grounded in the Australia branch (CSDM v5).

---

## Example 1 — Verdict A (Fully Baseline) — the cross-domain CSM ↔ ITSM ↔ CSDM case

### Dispatch input

**Source:** Chief Architect.
**User request:** *"We sell a managed product, 'Acme Connect'. When a customer logs a case about it, the agent should see which service it relates to; and when that service has an incident, support should see the impact. CSM and ITSM are on the same instance. How do we model the service layer so both sides point at the same thing?"*
**Domains co-firing:** CSM + ITSM gateways (process) and CMDB & CSDM (model). This envelope is the CMDB & CSDM contribution.
**Volume:** ~30 productised services; cases and incidents in normal ITSM/CSM volumes.
**Sensitivity:** Customer-facing service catalog; install-base data crosses the CSM boundary.

### Gateway Response

````markdown
# CMDB & CSDM Specialist Gateway Response — model the shared service layer for Acme Connect

**Request:** Model a single authoritative service layer that both CSM cases and ITSM incidents reference for "Acme Connect".
**Domain Expert:** CMDB & CSDM Specialist v2.0
**Release family:** Australia (CSDM v5)

---

## Part 1 — OOB Process Map

CSDM v5 is explicitly designed so that consumption (CSM) and operation (ITSM) reference the same service CIs rather than each holding a private copy:

- **Service Consumption domain** publishes **Business services** (`cmdb_ci_service_business`) to business/customer users — these are what a customer "has".
- **Service Delivery domain** holds **Technology management services** (`cmdb_ci_service_technical`) — provider-focused leaf nodes used for impact in Incident/Problem/Change.
- **CSM side** — the customer's install base maps to CSDM via the install-base framework; a case relates to the product/asset and, through it, to the business service.
- **ITSM side** — an incident references the impacted service/CI; impact and change approvals are driven off the same `cmdb_ci_service_*` records.

The integration is therefore a *reference* relationship, not a sync: one set of service CIs, referenced from both directions.

(citation: `markdown/servicenow-platform/common-service-data-model-csdm/csdm-conceptual-model.md`, `markdown/customer-service-management/csdm-framework-for-install-base-management.md`, `markdown/it-service-management/incident-management/csdm-inc-mgt-form-configure.md`)

## Part 2 — Data Model Alignment

**Primary baseline tables:**

| Table | CSDM role | Used by |
|---|---|---|
| `cmdb_ci_service_business` | Business service (Service Consumption) — "Acme Connect" as sold | CSM case → install base/product → business service |
| `cmdb_ci_service_technical` | Technology management service (Service Delivery) — the provider-side service | ITSM incident/change impact + approvals |
| `cmdb_rel_ci` | Designed relationships linking business service ↔ technology management service ↔ underlying CIs | Impact tree shared by both domains |

**CSDM domain & service type:** Business service (consumer-facing) + Technology management service (provider-facing), linked by a designed relationship.
**CSDM stage fit:** Run stage (the technology↔business sell/consume relationship). Confirm engagement has Foundation/Crawl/Walk established first.

**Critical baseline fields:** `cmdb_ci.sys_class_name`, `cmdb_ci.life_cycle_stage` / `life_cycle_stage_status` (v5 value pairs), `cmdb_ci.operational_status`.

(citation: `markdown/servicenow-platform/common-service-data-model-csdm/csdm-conceptual-model.md`, `csdm-to-cmdb-mapping.md`)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: A — Fully covered by baseline.**

The requirement is satisfied entirely by baseline CSDM v5 constructs:
1. One **Business service** record (`cmdb_ci_service_business`) for "Acme Connect" as published to customers.
2. One or more **Technology management services** (`cmdb_ci_service_technical`) for the provider-side delivery, linked to the business service via a designed `cmdb_rel_ci` relationship.
3. CSM cases reference the business service via the **install-base framework** (product/asset → service).
4. ITSM incidents reference the technology management service (and roll up to the business service) for impact.

No bridging table. No custom CI class. No custom relationship type. The shared service layer *is* the integration.

(citation: `markdown/customer-service-management/csdm-framework-for-install-base-management.md`)

## Part 4 — Routing Recommendation

**PROCEED — baseline configuration only** for the model itself; **dispatch to Technical Designer** if form/reference configuration on the case and incident is needed.

Co-fire reconciliation: CSM gateway confirms the case → install base → service path; ITSM gateway confirms the incident → impacted service path. All three envelopes must name the *same* `cmdb_ci_service_*` records.

Consult flags:
- **Security & GRC** — install-base/customer data crossing the CSM boundary (visibility of service records to customers vs agents).
- **ITOM/Discovery** — only if these services are to be populated/maintained by Service Mapping rather than manually.

## Part 5 — Anti-Patterns to Block

- **Do not create a bridging table** mapping case/incident → service. Both reference the same `cmdb_ci_service_*` records. (citation: `markdown/customer-service-management/csdm-framework-for-install-base-management.md`)
- **Do not duplicate the service** as one record "for CSM" and another "for ITSM." One business service, one (or more) technology management service, linked by designed relationships.
- **Do not invent a `cmdb_rel_type`** for the business↔technology service link — use the designed CSDM relationship.
- **Do not model this at Crawl stage** if Foundation/Crawl service data is not yet trustworthy — confirm stage first.
- **Do not use the pre-v5 label** ("Technical service"); Australia is CSDM v5, which relabelled the table without renaming it → `cmdb_ci_service_technical` *(citation: `markdown/servicenow-platform/common-service-data-model-csdm/manage-tech-servs-domain.md`)*.

## Open Questions

OQ-EV-1. **Current CSDM stage?** Run-stage service modelling assumes Foundation/Crawl/Walk are established.
OQ-EV-2. **Population method** — are these services created/maintained manually, or via Service Mapping (→ ITOM consult)?
OQ-EV-3. **Customer visibility** — should customers see the business service on the portal? Drives ACL/Security & GRC consult.

---

*End of CMDB & CSDM Specialist Gateway Response.*
````

---

## Example 2 — Verdict B (Baseline Extension)

### Dispatch input

**Source:** Chief Architect.
**User request:** *"On our business services we need a 'customer tier' attribute (Platinum / Gold / Silver) so CSM reporting can slice case volume by the commercial tier of the service. It's set manually by the service owner."*
**Domain:** CMDB & CSDM (model)
**Volume:** ~30 business services.
**Sensitivity:** Internal commercial classification.

### Gateway Response

````markdown
# CMDB & CSDM Specialist Gateway Response — add a "customer tier" attribute to business services

**Domain Expert:** CMDB & CSDM Specialist v2.0
**Release family:** Australia (CSDM v5)

---

## Part 1 — OOB Process Map

`cmdb_ci_service_business` records carry baseline service attributes (name, owner, lifecycle, criticality/business-criticality). Commercial "customer tier" is not a baseline dimension; it is a new attribute set manually by the service owner and read by CSM reporting.

(citation: `markdown/servicenow-platform/common-service-data-model-csdm/csdm-conceptual-model.md`)

## Part 2 — Data Model Alignment

**Primary baseline class:** `cmdb_ci_service_business` (→ `cmdb_ci_service` → `cmdb_ci`).
Existing baseline fields evaluated: `business_criticality` (operational criticality — different semantic from commercial tier), `comments` (free text — not queryable for reporting). No baseline field captures commercial tier.

(citation: `markdown/servicenow-platform/common-service-data-model-csdm/csdm-to-cmdb-mapping.md`)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: B — Requires baseline extension.**

Smallest viable extension: **one Choice field** `u_customer_tier` (values `platinum` / `gold` / `silver`) on `cmdb_ci_service_business`, mandatory=No, no default, manual write only.

- **Not Verdict A:** no baseline field carries commercial tier; `business_criticality` has distinct operational semantics and reusing it would corrupt existing criticality reports.
- **Not Verdict C:** one Choice field on a baseline class is the top of the §1.1 preference hierarchy — no new table, scope, or class.
- **Placement check:** keep on `cmdb_ci_service_business` (commercial tier applies to consumer-facing services), not the parent `cmdb_ci_service`, unless technology management services also need it.

(citation: `markdown/servicenow-platform/common-service-data-model-csdm/csdm-to-cmdb-mapping.md`)

## Part 4 — Routing Recommendation

**PROCEED — dispatch to Technical Designer with constraints.** Deliverable: field definition, form/list placement, `audit=true`, and a note to Reporting & Analytics (downstream, non-blocking).

## Part 5 — Anti-Patterns to Block

- **Do not create a `u_service_tier` table** with a 1:1 reference — one field on the baseline class is enough.
- **Do not overload `business_criticality`** with commercial values — distinct semantic; breaks criticality reporting.
- **Do not place the field on `cmdb_ci`** (root) — over-broad; bloats schema for irrelevant CI types.
- **Do not let a future Service Graph import clear the manual value** — if any data source writes the class, set an IRE reconciliation rule protecting `u_customer_tier`.

## Open Questions

OQ-EV-1. Does customer tier apply only to consumer-facing business services, or also technology management services? Drives class placement.
OQ-EV-2. Any data source other than manual entry? If so, IRE reconciliation rule required.

---

*End of CMDB & CSDM Specialist Gateway Response.*
````

---

## Example 3 — Verdict C (§1.1 Halt) — the bridging-table reflex

### Dispatch input

**Source:** Chief Architect.
**User request:** *"Build a custom table `x_acme_service_map` that links every CSM case and every ITSM incident to the service it's about, with columns for case, incident, service, and a relationship type. We'll write to it from both sides so we have one place to query the case-and-incident-to-service mapping."*
**Domain:** CMDB & CSDM (model) + cross-domain
**Volume:** all cases + all incidents.
**Sensitivity:** Internal.

### Gateway Response

````markdown
# CMDB & CSDM Specialist Gateway Response — proposed custom service-mapping bridging table

**Domain Expert:** CMDB & CSDM Specialist v2.0
**Release family:** Australia (CSDM v5)

---

## Part 1 — OOB Process Map

The request proposes a custom table to hold case→service and incident→service links. CSDM v5 already provides this through the shared service/CI layer: cases reference services via the install-base framework, incidents reference services via affected-CI/impacted-service relationships, and service-to-service/service-to-CI links live in `cmdb_rel_ci` as designed relationships. A separate bridging table duplicates relationships the model already expresses.

(citation: `markdown/servicenow-platform/common-service-data-model-csdm/csdm-conceptual-model.md`, `markdown/customer-service-management/csdm-framework-for-install-base-management.md`, `markdown/it-service-management/incident-management/csdm-inc-mgt-form-configure.md`)

## Part 2 — Data Model Alignment

| Requested column | Baseline construct that already covers it |
|---|---|
| case → service | Case → install base/product → `cmdb_ci_service_business` (install-base framework) |
| incident → service | Incident affected-CI / impacted-service reference to `cmdb_ci_service_*` |
| service ↔ service / service ↔ CI | `cmdb_rel_ci` with designed CSDM relationship types |
| "relationship type" | `cmdb_rel_type` (designed values) |

No gap remains that a custom table fills.

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: C — Requires custom object. §1.1 HALT.**

```
🚨 OPEN QUESTION — CUSTOM OBJECT PROPOSAL (§1.1 Blocking)

1. Baseline options evaluated [citations REQUIRED]:
   a. Reference the shared service layer directly from both sides (install base for CSM,
      affected-CI/impacted-service for ITSM); express service↔service/CI links in cmdb_rel_ci.
      - Covers: the entire stated requirement (query "what service is this case/incident about").
      - Falls short: nothing — this is the designed CSDM pattern.
      - Citation: csdm-framework-for-install-base-management.md, csdm-inc-mgt-form-configure.md
   b. A database view / report joining case, incident, and the referenced service records.
      - Covers: a single queryable surface without storing duplicate links.
      - Falls short: nothing for reporting; no new table needed.
      - Citation: csdm-conceptual-model.md

2. Custom object proposed (smallest viable scope):
   The user proposes a new table x_acme_service_map. Under §1.1 this is rejected as unnecessary:
   the relationships already exist in baseline references and cmdb_rel_ci. A bridging table would
   hold a duplicate, drift-prone copy of links the platform maintains.

3. Consequences of approval (if forced):
   - Data integrity: two sources of truth for case/incident→service; guaranteed to drift.
   - Reporting: bypasses CSDM impact trees; CMDB Health and impact analysis would not see these links.
   - Upgrade/AI: off-model data is invisible to ServiceNow analytics/AI features that depend on CSDM.

4. Alternatives if rejected (recommended):
   - Adopt option (a): reference the shared service layer from both sides. For a single query surface,
     build a report/DB view (option b). No custom table.

Decision required from Chief Architect before any builder is dispatched.
Recommendation: REJECT the custom table; adopt option (a) + (b).
```

(citation: `markdown/customer-service-management/csdm-framework-for-install-base-management.md`)

## Part 4 — Routing Recommendation

**HALT — §1.1 custom-object proposal in Part 3 requires Chief Architect decision.** Recommended resolution: reject the bridging table; reference the shared service layer and build a report/DB view for the single-surface query need. If rejected as recommended, dispatch Technical Designer for the reference configuration + report.

## Part 5 — Anti-Patterns to Block

- **Do not build the bridging table.** It duplicates baseline references and `cmdb_rel_ci`; it will drift.
- **Do not write from both sides into a custom link store.** One reference each into the shared service layer.
- **Do not invent relationship types** outside the designed CSDM set.
- **Do not solve a reporting need with a storage table** when a report/DB view over existing references suffices.

## Open Questions

OQ-EV-1. Is the real need a *query surface* (→ report/DB view) or a *stored relationship* (→ already exists in baseline)? Clarifying this usually dissolves the request.

---

*End of CMDB & CSDM Specialist Gateway Response.*
````

---

## Reading these examples

- **Example 1 (Verdict A)** — the canonical cross-domain pattern: one shared `cmdb_ci_service_*` layer referenced by both CSM (install base) and ITSM (impact). Co-fires with the CSM and ITSM gateways; all envelopes must name the same service records.
- **Example 2 (Verdict B)** — a single Choice field on a baseline service class, with IRE protection if any data source writes it. Technical Designer dispatch with the envelope as constraints.
- **Example 3 (Verdict C)** — the bridging-table reflex, halted. The §1.1 resolution is almost always "reference the shared layer + report/DB view," not a new table.

The §6.2 post-build review fires after a builder returns a spec for Verdict B / approved-C: the gateway re-validates the artefact against this envelope (correct v5 table names, designed relationships only, no bridging/custom table) before final delivery.

---

*End of CMDB & CSDM Specialist EXAMPLES.md v2.0.*
