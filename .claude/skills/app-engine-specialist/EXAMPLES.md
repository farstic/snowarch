# App Engine Specialist v1.0 — Worked Examples

Two examples: the §1.1 precondition halt, and an approved-app design. Read alongside `SKILL.md`.

---

## Example 1 — §1.1 precondition: halt when the custom app isn't approved

### Context
"Build us a custom scoped app to track office-equipment loans to employees."

```markdown
# App Engine Design — Equipment Loan Tracker
## §1.1 precondition — HALT

OPEN QUESTION — CUSTOM OBJECT PROPOSAL (§1.1 blocking)
A custom scoped application is the object §1.1 governs, and no Chief Architect approval is in the envelope.
1. Baseline options evaluated first:
   - **HRSD / asset**: equipment issued to employees is often baseline **Asset Management** (`alm_asset` + asset tasks / hardware model) — loans tracked as asset state + assignment, possibly an HR/service request to issue/return.
   - A **Service Catalog** request item (issue/return) with a flow, over baseline asset records.
2. Custom object proposed: the custom scoped app the request names — a new scoped app, the hierarchy's last rung, which needs the strongest justification — to hold "office-equipment loans to employees"; proposed only if baseline asset and request records genuinely cannot model a loan period, its return and the item's condition.
3. Consequences of a custom app: new scope, tables, ACLs, lifecycle/upgrade ownership.
4. Alternative if rejected: configure baseline Asset + a catalog request flow — no custom app.

Recommendation: evaluate baseline Asset Management + a catalog issue/return flow before approving a custom app. **No app designed until the Chief Architect approves a custom scoped app in a separate message.**
```

---

## Example 2 — Approved app: structure & declarative build plan

### Context
Chief Architect approved a custom app for a niche internal process not covered by any baseline module.

```markdown
# App Engine Design — <approved app>
## §1.1 precondition
Confirmed: custom scoped app approved by Chief Architect (envelope ref). Proceeding, baseline-first inside.

## Scope & structure
Scope `x_acme_<app>`; single scope; cross-scope access only via a documented `x_acme_<app>.PublicAPI` Script Include.

## Data model (high level)
Primary record is task-like → **extend `task`** (inherits state/assignment/SLA/audit) rather than a new top-level table. One child table for line items. Detailed field/ACL model → **Technical Designer**.

## Declarative build plan
- **Flow Designer** for the lifecycle (no scripted state machine).
- **Decision table** for routing/branching rules (not nested if/else in a BR).
- **UI policies** for client behaviour; **ACLs** for access (role model → Security & GRC).
- Script Includes only for the cross-scope API + anything declarative can't do (→ Developer + Code Reviewer).

## Experiences
Agent surface as a configurable workspace; requester surface on the portal → **UI/UX** for the design.

## Lifecycle & deployment
Manage via App Engine Management Center; promote via update set / App Repository → **DevOps/Release**.

## Handoffs & consults
Technical Designer (tables/ACLs), Developer (API + scripts), Flow Designer (lifecycle), UI/UX (surfaces), DevOps/Release (deployment), Security & GRC (role/ACL model).

## Anti-patterns to block
- A new top-level table where extending `task` fits.
- A scripted state machine instead of Flow Designer.
- Nested-if routing in a BR instead of a decision table.

## Open questions
OQ-CN-1. Delegated development — who may build/maintain in this scope?
OQ-CN-2. Is any data sensitive (→ Security & GRC) or high-volume (→ Performance & Scale)?
```

---

## Reading these examples
- **Example 1** is the most important behaviour: App Engine work **starts** with the §1.1 gate — no approval, no app; evaluate baseline first.
- **Example 2** shows baseline-first *inside* an approved app: extend `task`, declarative-first (flows + decision tables), hand detail to the right specialists.

---

*End of App Engine Specialist EXAMPLES.md v1.0.*
