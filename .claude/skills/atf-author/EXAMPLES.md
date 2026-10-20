# ATF Author v1.0 — Worked Examples

Two examples: a **skill-mode** single-component test, and a **sub-agent** full-app suite map. Read alongside `SKILL.md`. Grounded in the Australia branch.

---

## Example 1 — Skill mode (single component, fires post-build §6.2)

### Context

Developer returned a Script Include `SLABreachRiskCalculator` with method `calculate(incidentGr)` that returns a risk score 0–100 and is role-gated to `itil`. It's release-path bound, so §6.2 proposed ATF coverage; the user chose single-component (skill).

### Output

```markdown
# ATF Coverage: SLABreachRiskCalculator

**Mode:** single-component (skill)
**Under test:** Script Include `SLABreachRiskCalculator.calculate()` (scope: x_acme_itsm)
**Spec / AC reference:** LLD §4.2 — risk score 0–100; high-priority + breached SLA → score ≥ 80; role-gated to itil

## Test list
1. Happy path — high-risk incident returns score ≥ 80
2. Low-risk incident returns low score
3. Boundary — no active SLA returns 0
4. Negative — unauthorised user is denied

## Tests

### Test 1 — High-priority incident with breached SLA scores ≥ 80
- **Type:** Server
- **Setup steps:**
  - *Record Insert* on `incident`: priority=1, impact=1, urgency=1.
  - *Record Insert* on `task_sla` referencing that incident: has_breached=true, business_percentage=100.
- **Action + Assertion:** *Run Server Side Script* — instantiate `new x_acme_itsm.SLABreachRiskCalculator()`, call `calculate()` with the created incident, `assert(score >= 80, 'expected high risk')`.
- **Covers:** LLD §4.2 high-risk rule.

### Test 2 — Low-priority, healthy SLA scores low
- **Type:** Server
- **Setup:** *Record Insert* incident priority=4; *Record Insert* task_sla has_breached=false, business_percentage=20.
- **Assertion:** *Run Server Side Script* — `assert(score < 40, 'expected low risk')`.
- **Covers:** §4.2 baseline scoring.

### Test 3 — No active SLA returns 0
- **Type:** Server
- **Setup:** *Record Insert* incident with no related task_sla.
- **Assertion:** *Run Server Side Script* — `assert(score === 0, 'no SLA → 0')`.
- **Covers:** §4.2 boundary.

### Test 4 — Unauthorised user denied
- **Type:** Server
- **Setup:** Impersonate a user without `itil` (Run As).
- **Assertion:** *Run Server Side Script* — expect the role check to fail closed (no score / thrown guard), `assert(result === null || threw, 'must deny non-itil')`.
- **Covers:** §4.2 role gate. **Negative variant.**

## Coverage matrix
| Spec behaviour / AC | Test(s) |
|---|---|
| Risk 0–100 scoring | 1, 2 |
| High-priority + breached → ≥ 80 | 1 |
| No active SLA → 0 | 3 |
| Role-gated to itil | 4 |

## Deployment notes
- **Runner:** all four are Server tests → can run **scheduled** (no client runner needed). *(citation: markdown/application-development/automated-test-framework-atf/atf-test-runners.md)*
- **Environment:** run on a **sub-production** instance; ATF is disabled on prod by default — do not point at prod with real data. *(citation: markdown/application-development/automated-test-framework-atf/automated-test-framework-design-considerations.md)*
- **Scope / update set:** tests belong to `x_acme_itsm`, captured as metadata in the app's update set.
- **Roles:** `atf_test_designer` to author, `atf_test_admin` to run. *(citation: markdown/application-development/automated-test-framework-atf/atf-roles.md)*
- **Data strategy:** all data created by Record Insert steps and rolled back automatically; no dependence on existing records.

## §6.2 manifest
No custom step config script produced (baseline *Run Server Side Script* + *Record Insert* cover it) → no Code Reviewer pass required for the tests themselves.

## Open questions
OQ-DS-1. Does `calculate()` throw or return null on an unauthorised caller? Test 4's assertion adapts to whichever the spec defines — confirm.
```

---

## Example 2 — Sub-agent mode (full-app suite map)

### Context

The `x_acme_itsm` app (3 Script Includes, 2 Business Rules, 1 catalog item, 1 flow) is approaching sign-off. The user chose full-app suite (sub-agent). The sub-agent returns a suite map + per-test designs (one test design shown; the rest follow the same shape).

### Output (abridged)

```markdown
# ATF Coverage: x_acme_itsm

**Mode:** full-app suite (sub-agent)
**Under test:** scoped app x_acme_itsm
**Spec / AC reference:** LLD §3–§7

## Suite map
- **Suite: x_acme_itsm — Regression**
  - Child suite: *Server logic* (scheduled-runnable)
    - SLABreachRiskCalculator (4 tests — see Example 1 shape)
    - DuplicateIncidentDetector (3 tests)
    - AssignmentResolver (3 tests)
    - "Auto-assign on category=network" Business Rule (2 tests)
    - "Escalate on breach" Business Rule (2 tests)
  - Child suite: *UI & Catalog* (needs client test runner)
    - "Request new laptop" catalog item (order + variable/UI-policy validation, 3 tests)
  - Child suite: *Flow* (Server + scheduled where possible)
    - "P1 notify + assign" flow (trigger fires, branches, end state — 3 tests)

## Tests
### Test — DuplicateIncidentDetector flags a duplicate
- **Type:** Server
- **Setup:** Create two `incident` records with matching short_description + caller within the window.
- **Assertion:** Run Server Side Script — `assert(detector.isDuplicate(second) === true)`.
- **Covers:** LLD §4.5.
*(…remaining tests follow the same Setup → Action → Assertion → Covers shape…)*

## Coverage matrix
| Component | Tests | AC covered |
|---|---|---|
| SLABreachRiskCalculator | 4 | §4.2 |
| DuplicateIncidentDetector | 3 | §4.5 |
| … | … | … |

## Deployment notes
- **Runner split:** *Server logic* + *Flow* child suites run **scheduled**; *UI & Catalog* child suite requires a **client test runner** session. *(citation: atf-test-runners.md, atf-sched-suites.md)*
- **Environment:** sub-production only; ATF off on prod by default.
- **Scope / update set:** all in `x_acme_itsm`; suite + tests captured as metadata.
- **Roles:** atf_test_designer / atf_test_admin.
- **Data strategy:** every test creates and rolls back its own data; no shared fixtures.

## §6.2 manifest
One custom step type was needed for the flow's wait-condition assertion → its config script is flagged for **Code Reviewer**.

## Open questions
OQ-DS-1. Is a client test runner provisioned in the test instance for the UI & Catalog child suite?
```

---

## Reading these examples

- **Example 1 (skill)** — single component, four tests including the negative path, all Server → scheduled-runnable, full deployment notes. This is the §6.2 post-build shape.
- **Example 2 (sub-agent)** — suite map first, then per-test designs; child suites split by runner type; one custom step config script → Code Reviewer handoff.

Both create their own data (rolled back), assert explicitly, and map every test to a spec behaviour. Neither stores test data in a custom table (§1.1).

---

*End of ATF Author EXAMPLES.md v1.0.*
