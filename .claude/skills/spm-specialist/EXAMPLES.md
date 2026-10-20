# SPM Specialist v1.1 — Worked Examples

Two examples: a full guidance (Verdict A) and a §1.1 halt. Read alongside `SKILL.md`.

---

## Example 1 — Full guidance (Verdict A): idea → scored demand → project, with resourcing & agile delivery

### Input
"Ideas should flow into scored demands; approved ones become projects we deliver with agile teams, with resource planning and a tie to our strategic goals."

```markdown
# SPM Specialist Guidance — idea → demand → project (agile) with resourcing & goal alignment

## OOB process map
- **Ideation/demand:** `idea` (captured/voted) → promote to `dmn_demand` → assess via an assessment metric
  set (value/cost/risk/effort) → stakeholder review/approve → on approval, create the delivery vehicle.
  *(citation: markdown/it-business-management/demand-management/demand-management-reference.md)*
- **Delivery (agile):** approved demand → **epic** + **stories** (`rm_story`) on a backlog; sprints/boards.
  Use **Enterprise Agile Planning (SAFe)** if scaled (ARTs/PIs); plain scrum otherwise.
  *(citations: markdown/it-business-management/agile-development/create-an-epic.md, markdown/it-business-management/enterprise-agile-planning/agile-configurations-in-eap.md)*
- **Resourcing:** resource plans/requests against allocations & availability (soft → confirmed).
  *(citation: markdown/it-business-management/resource-management/rmw-references.md)*
- **Alignment:** goal framework links demands/epics to strategic objectives (OKR-style).
- **(If waterfall instead:)** `pm_project` + phases + `pm_project_task` + baselines + status reports.
  *(citation: markdown/it-business-management/project-management/c_ProjectApplicationOverview.md)*

## Data model alignment
`idea`, `dmn_demand`, assessment metric/scoring records; `rm_story` + epics + sprints (agile) OR
`pm_project`/`pm_project_task` (waterfall); resource plan/request + allocation tables; goal records.
Configure demand types + scoring criteria + project/epic templates. Any extra captured field = a field
extension on the baseline table (Verdict B), not a new table.

## §1.1 verdict
**A — Fully baseline.** The whole chain (idea → scored demand → epic/stories or project → resource plan →
goal link) is baseline SPM configuration. No custom demand/project/portfolio/story table.

## Routing & consults
- **Technical Designer** — demand types, assessment metric sets, epic/project templates, the approval flow,
  any field extensions.
- **Reporting & Analytics** — demand-funnel + delivery + capacity dashboards (PA indicators over `dmn_demand`/`rm_story`/resource plans).
- **UI/UX** — a PMO/portfolio workspace experience, if wanted.
- **Integration** — only if stories sync to/from Jira/Azure DevOps.
- **Performance & Scale** — only at very large portfolio/history volumes.

## Anti-patterns to block
- No custom "demand intake" table — `idea`/`dmn_demand` with configured types/scoring.
- No custom scoring code — baseline assessment metrics.
- No custom story/sprint table — `rm_story` + boards (scrum/SAFe).
- No custom `dmn_demand.state` values without §1.1 review.

## Open questions
OQ-CN-1. Delivery model: scrum, or scaled (SAFe / Enterprise Agile Planning)? (Drives ART/PI structure.)
OQ-CN-2. Resource model: soft (plan) only, or firm/confirmed allocations with capacity?
OQ-CN-3. Investment funding / budget tracking in scope, or delivery only?
OQ-CN-4. Do approved demands ever go waterfall (`pm_project`) instead of agile?
```

---

## Example 2 — §1.1 halt: proposed custom intake app

### Input
"Our intake is unique — build a custom scoped app with its own request table and approval engine for capturing project ideas."

```markdown
# SPM Specialist Guidance — project idea intake
## §1.1 verdict — HALT

OPEN QUESTION — CUSTOM OBJECT PROPOSAL (§1.1 blocking)
1. Baseline evaluated: `idea` → `dmn_demand` with **custom demand types** + a tailored **assessment metric
   set** for scoring + the baseline approval mechanism captures bespoke intake without any custom table.
   (citation: demand-management-reference.md)
   Why a custom app falls short of being necessary: it rebuilds demand, scoring, approval, and reporting
   that SPM already provides, and forfeits the native demand→project conversion and portfolio roll-up.
2. Custom object proposed: a scoped app + `x_*_project_request` table + approval engine — rejected as
   unnecessary; it's a re-implementation of demand management.
3. Consequences if approved: parallel intake model, no native conversion/roll-up, ongoing maintenance,
   upgrade exposure, App Engine licensing.
4. Alternative (recommended): configure `idea`/`dmn_demand` (types + assessment set) + baseline approval.

Recommendation: REJECT the custom app; configure demand management. If a genuinely novel object survives
this evaluation, the Chief Architect decides in a separate message before any App Engine work.
```

---

## Reading these examples
- **Example 1** is the gateway-depth deliverable: the full baseline chain across demand, agile delivery, resourcing, and goal alignment — Verdict A — with the right consults (Reporting for dashboards, UI/UX for the workspace, Integration only if Jira sync).
- **Example 2** halts the reflexive "custom intake app," which is just demand management re-implemented.

---

*End of SPM Specialist EXAMPLES.md v1.1.*
