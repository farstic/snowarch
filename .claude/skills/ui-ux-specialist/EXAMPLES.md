# UI/UX Specialist v1.0 — Worked Examples

Two examples: a configurable-workspace design (Verdict A, configuration) and a §1.1 halt on a custom widget. Read alongside `SKILL.md`. Grounded in the Australia branch.

---

## Example 1 — CSM agent Configurable Workspace for case handling (Verdict A)

### Context

CSM gateway confirmed the agent surface is the **CRM Workspace (formerly CSM Configurable Workspace)** (not the portal) and the data model is baseline `sn_customerservice_case`. Technical Designer set the field/ACL model. Now design the agent experience.

### Output

```markdown
# UI/UX Design: CSM Case — Agent Configurable Workspace

**Surface:** Configurable Workspace (Next Experience / UI Builder)
**Persona(s) & task:** CSM Agent (`sn_customerservice_agent`) — triage, work, and resolve customer cases.
**Underlying model ref:** CSM gateway envelope + Technical Designer case spec.

## Experience map
Home (my work) → Case list → Case record page → (resolve) → back to list. Context (customer, install base, related cases/incidents) available in-place on the record page.

## Per-surface design — Configurable Workspace
- **Landing / home:** "My Cases" + team queue lists; SLA-at-risk highlighted.
- **List:** baseline `sn_customerservice_case` configurable list — columns: number, account, priority, state, assigned_to, SLA %, opened. Filters: my open / awaiting info / breaching. Configurable-list inline edit for state/assignment. *(citation: markdown/platform-user-interface/administer-lists-configurable-workspace.md)*
- **Record page:** configurable form with sections — *Details* (account, contact, product, priority, short description), *Resolution* (resolution code/notes), *Related* (case tasks, related incidents via the shared service layer). Tabs keep the form lean (progressive disclosure). *(citation: markdown/platform-user-interface/administer-forms-configurable-workspace.md)*
- **Contextual side panel:** customer 360 — account tier, active contracts/entitlements, **install base** (the product the case is about), recent cases. Lets the agent see context without leaving the record. *(citation: markdown/platform-user-interface/c_set-up-configurable-workspace.md)*
- **Agent assist:** baseline knowledge + similar-cases panel; AI summarisation placement flagged to **Now Assist Specialist** (capability is theirs). *(citation: markdown/platform-user-interface/agent-assist-configurable-workspace.md)*
- **Declarative actions on the record:** Resolve, Escalate, Create related incident (references the shared `cmdb_ci_service_*` layer, per the CSDM envelope). *(citation: markdown/platform-user-interface/creating-declarative-actions.md)*
- **Unified navigation:** Cases, Accounts, Knowledge. *(citation: markdown/platform-user-interface/add-workspace-unified-navigation.md)*
- **Components:** all baseline (configurable list/form, side panel, agent assist) — no custom components.

## Accessibility & performance notes
- WCAG: ensure the side panel and declarative-action buttons are keyboard-reachable with proper labels.
- Performance: side-panel data brokers (contracts, install base) should lazy-load on record open, not on list render; cap the related-cases query. Flag to Performance & Scale if case volume is high.

## §1.1 verdict
**Configuration-only — PROCEED.** Baseline CRM Workspace configured in UI Builder; baseline components only. No new UX scope, no custom component.

## Handoffs
- Now Assist Specialist — the AI summarisation/agent-assist capability.
- Developer + Code Reviewer — only if any declarative action needs a server script.
- Performance & Scale — side-panel data brokers if case volume is high.

## Open questions
OQ-CN-1. Should the side panel show install base from the shared CSDM layer or only the product field? (Depends on CSDM adoption stage.)
OQ-CN-2. Customer-facing portal experience — separate design (different persona/surface)?
```

---

## Example 2 — §1.1 halt: custom widget proposed

### Context

A request: "build a custom carousel widget on the customer portal to show the customer's open cases with a bespoke animated layout."

### Output (abridged)

```markdown
# UI/UX Design: Customer portal — open-cases display

**Surface:** Service Portal
**§1.1 verdict: C — HALT (custom widget proposed).**

OPEN QUESTION — CUSTOM OBJECT PROPOSAL (§1.1 blocking)
1. Baseline evaluated: the base system **Simple List** widget renders a customer's open cases on the portal, themed to brand; the base **Carousel widget** shows a scrolling list of catalog-item images, not case records. (citation: markdown/platform-user-interface/service-portal/simple-list-widget.md, markdown/platform-user-interface/service-portal/carousel-widget.md)
   Falls short only on the "bespoke animated carousel" styling — a presentation preference, not a capability gap.
2. Custom object proposed: a custom Service Portal widget (HTML/CSS/AngularJS + client/server script).
3. Consequences: custom widget code to maintain and security-review (Code Reviewer), upgrade-path exposure, accessibility risk (custom animation).
4. Alternatives if rejected: use the baseline cases widget with brand theming; achieve visual differentiation via the theme/CSS, not a new widget.

Recommendation: REJECT the custom carousel; use the baseline cases widget + theme. If the animated layout is a hard requirement, Chief Architect approval needed before Developer builds the widget (then Code Reviewer + WCAG review mandatory).
```

---

## Reading these examples

- **Example 1** is the common case: a baseline configurable workspace **configured** in UI Builder — list, record page, contextual side panel, agent assist, declarative actions, unified nav — all baseline components, Verdict A. Note the clean handoffs (Now Assist for AI, Developer+Code Reviewer only if a script appears).
- **Example 2** shows the §1.1 discipline: a custom widget where a baseline widget + theming serves is halted, not built.

Neither writes code or designs the data model — UI/UX specs the surface; Developer implements, Technical Designer owns the model.

---

*End of UI/UX Specialist EXAMPLES.md v1.0.*
