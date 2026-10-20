# taxonomy.md — Specialist Boundaries and Routing Resolution

> **Purpose:** Authoritative reference for resolving routing ambiguity between specialists. When a user task could plausibly route to two or more specialists, the boundary tables and trigger-keyword maps in this document determine which specialist is correct.
>
> **Read by:** `CLAUDE.md` (the Chief Architect) and every SKILL.md at routing time, and the Chief ServiceNow Architect persona at routing time.
>
> **Maintenance:** Updated whenever a new specialist is added or whenever a real misroute is observed in production use.

---

## 0. Global governance rules — authoritative reference

This taxonomy operates under the global architecture rules in `governance-rules.md`. The Chief Architect and every specialist must comply with all rules in that file.

**§1.1 — Baseline-First / Zero Custom Objects Without Explicit Approval.** No specialist may propose, design, or create custom tables, custom scoped applications, custom state-model extensions, custom Connection & Credential Aliases, or any other major custom architectural object without the Chief Architect's explicit, prior approval in the routing-time dispatch envelope. If a custom object not approved in the dispatch envelope was named in the request, or is the only viable path after the baseline evaluation, a specialist must halt and return a blocking `OPEN QUESTION — CUSTOM OBJECT PROPOSAL` per the halt protocol in `governance-rules.md` §1.1.

§1.1 is enforced at two phases of the resolution algorithm:

- **Routing-time (§6.1):** the Chief Architect surfaces custom-object evaluations as Phase 1 assumptions. Custom objects implied by the user's request are raised as blocking OPEN QUESTIONS before specialist dispatch.
- **Post-build (§6.2):** the Chief Architect inspects every returned artefact for §1.1 violations as part of the post-build evaluation. A detected violation triggers a rework dispatch before any other consult proposals.

**§2.1 — MCP Write Operations Explicit Approval Gate.** Every MCP write operation against a live ServiceNow instance requires an explicit "write approved" from the user in the current conversation before execution. Tier upgrade, prior approvals, and logical flow do not substitute. See `governance-rules.md` §2.1.

**§2.2 — MCP Update Set Capture Mandatory Pre-Write Protocol.** Before any configuration write via MCP, the `sys_user_preference` record (`name=sys_update_set`) for the authenticated user must be set to the target Update Set. Without this, objects are not captured and cannot be promoted. See `governance-rules.md` §2.2.

**§4 — Delivery Artefact Governance (ADR · Traceability · RAID & NFR).** Significant decisions are recorded as Architecture Decision Records (§4.1); every release-path requirement is traceable through story → design → build → test → deploy via the engagement traceability matrix (§4.2); RAID and NFRs are captured at design time, and every unresolved OPEN QUESTION becomes a RAID item (§4.3). Engagement-scoped artefacts seeded from `templates/`. Advisory scaffolding (not a hard halt), enforced at routing-time (record the ADR for any §1.1 ruling) and post-build (update the matrix, record build-time decisions). See `governance-rules.md` §4.

See `governance-rules.md` for the full text of all rules, halt protocols, and violation handling.

---


## 1. Specialist roster overview

The system's 28 specialists fall into four functional groups:

### Builders — sub-agent execution

These specialists run as isolated sub-agents in Claude Code. They read files, write code, and produce concrete artefacts.

| # | Specialist | Has skill | Has sub-agent |
|---|---|---|---|
| 1 | Story Writer | ✅ | ✅ |
| 2 | HLD/LLD Writer | ✅ | ✅ |
| 3 | Technical Designer | ✅ | ✅ |
| 4 | Now Assist Specialist | ✅ | ✅ |
| 5 | Integration Specialist | ✅ | ✅ |
| 6 | Flow Designer Specialist | ✅ | ✅ |
| 7 | Developer | ✅ | ✅ |
| 8 | ATF Author | ✅ | ✅ (batch sub-agent) |
| 9 | Diagramming Specialist | ✅ | ✅ (batch sub-agent) |

### Reviewers and Quality

| # | Specialist | Has skill | Has sub-agent |
|---|---|---|---|
| 10 | Code Reviewer | ✅ | ❌ |
| 11 | Performance & Scale Specialist | ✅ | ❌ |

### Domain experts (modules)

| # | Specialist | Has skill | Has sub-agent |
|---|---|---|---|
| 12 | ITSM Specialist | ✅ | ❌ |
| 13 | CSM Specialist | ✅ | ❌ |
| 14 | HRSD Specialist | ✅ | ❌ |
| 15 | ITOM/Discovery Specialist | ✅ | ❌ |
| 16 | SPM Specialist | ✅ | ❌ |
| 17 | Security & GRC Specialist | ✅ (consult/review skill) | ❌ |
| 18 | CMDB & CSDM Specialist | ✅ (v2.0 gateway) | ❌ |
| 19 | App Engine Specialist | ✅ | ❌ |
| 20 | Migration Specialist | ✅ | ❌ |
| 21 | UI/UX Specialist | ✅ | ❌ |
| 22 | Reporting & Analytics Specialist | ✅ | ❌ |
| 23 | DevOps / Release Manager | ✅ | ❌ |
| 28 | FSO Insurance Specialist | ✅ (gateway) | ❌ |

### Consultants, Advisory and Documentation

| # | Specialist | Has skill | Has sub-agent |
|---|---|---|---|
| 24 | Discovery Specialist | ✅ | ❌ |
| 25 | Operational Documentation | ✅ | ❌ |
| 26 | Licensing & Entitlement Specialist | ✅ (consult/review skill) | ❌ |
| 27 | Estimation & Sizing Specialist | ✅ (consult skill) | ❌ |

**Legend:** ✅ = SKILL.md exists in repo · ⚠️ planned = persona is active in the orchestrator but SKILL.md not yet authored · ❌ = no sub-agent file

(Numbering is presentational. The roster has 28 distinct specialists. ATF Author and Diagramming Specialist each have both a skill and a batch sub-agent — 9 sub-agent files exist today. Licensing & Entitlement and Estimation & Sizing are skill-only cross-cutting consults added in engine v2.8.0.)

---

## 2. Boundary tables — pairwise specialist boundaries

When a task could plausibly route to two or more specialists, this table determines which one wins. The boundary is stated as a *trigger differentiator*: a property of the task that distinguishes the two specialists' jurisdictions.

### 2.1 Builder boundaries

| Pair | Boundary principle | Trigger differentiator | Examples |
|---|---|---|---|
| **Technical Designer** vs **Developer** | Designer produces *spec*; Developer produces *implementation*. | Output type. Spec / design doc / architecture decision → Designer. JavaScript code / Glide script / actual implementation → Developer. | "Design the X" → Designer. "Implement the X" / "Write the code for X" → Developer. |
| **Developer** vs **Flow Designer Specialist** | Developer = scripting in `.js` files. Flow Designer Specialist = Flow Designer flows, subflows, custom Action Designer scripts. | Where the logic lives. Script Include or Business Rule → Developer. Flow definition or custom Action → Flow Designer Specialist. | "Write a Script Include for X" → Developer. "Design a flow that does X when Y" → Flow Designer Specialist. |
| **Developer** vs **App Engine Specialist** | Developer writes scripts. App Engine Specialist designs custom scoped applications, App Engine Studio components, decision tables, document templates. | Granularity. Script-level work → Developer. Application-architecture work → App Engine Specialist. | "Write the validation logic for table X" → Developer. "Design a scoped app for the X workflow" → App Engine Specialist. |
| **Integration Specialist** vs **Migration Specialist** | Integration = ongoing, steady-state. Migration = one-time, project-phase. | Temporality of the data flow. Continuous bidirectional/unidirectional sync → Integration. One-time historical load with cutover → Migration. | "Sync ServiceNow with Azure DevOps" → Integration. "Migrate Remedy incidents into ServiceNow" → Migration. |
| **Integration Specialist** vs **Flow Designer Specialist** | Integration designs the *integration architecture* (REST messages, IntegrationHub spokes, MID Server, authentication, error handling). Flow Designer designs the *orchestration* that uses those integrations. | What's being designed. The endpoint, payload, auth, retry logic → Integration. The flow that calls the endpoint as a step → Flow Designer. | "Design the REST integration with Azure DevOps" → Integration. "Design the flow that triggers the Azure pipeline when a CHG is approved" → Flow Designer. |
| **ATF Author skill** vs **ATF Author sub-agent** | Skill = inline single-component test generation. Sub-agent = batch test-suite generation across an app. | Scope. One method / one Script Include → skill. Whole scoped app → sub-agent. | "Write ATF for ConflictAssessmentUtils" → skill. "Generate the full ATF suite for the x_acme_itsm app" → sub-agent. |
| **Diagramming Specialist** vs **HLD/LLD Writer** | HLD/LLD Writer authors the document and may embed simple inline figures in its narrative. Diagramming Specialist produces the standalone/complex diagram artefacts and the consistent batch pack. | What's wanted. The prose document → HLD/LLD. A dedicated figure, a complex diagram, a client-ready SVG, or the whole figure set for the doc → Diagramming. | "Write the HLD" → HLD/LLD. "Draw the sequence/ERD/context diagrams for the HLD" / "give me the diagram pack" → Diagramming. |
| **Diagramming Specialist** vs **Technical Designer** | Technical Designer decides the model (tables, ACLs, flows). Diagramming Specialist depicts a model that already exists in a spec. | Decide vs depict. "What should the model be" → Technical Designer. "Draw the model the spec already defines" → Diagramming. | "Design the table model" → Technical Designer. "Turn that table model into an ERD" → Diagramming. |
| **Diagramming Specialist** vs **UI/UX Specialist** | Diagramming draws architecture/process/data/project diagrams. UI/UX designs the actual product screens users interact with. | Diagram of a system vs design of a screen. Architecture/sequence/ERD/roadmap → Diagramming. Form layout, portal page, workspace, wireframe/mockup → UI/UX. | "Draw the integration topology" → Diagramming. "Design the case form layout / portal page" → UI/UX. |
| **Diagramming Specialist** vs **Reporting & Analytics Specialist** | Diagramming produces static, design-time depictions. Reporting & Analytics produces live visualisations of instance data. | Design-time picture vs runtime data viz. A figure of how something is built → Diagramming. A chart/dashboard/PA widget over real records → Reporting & Analytics. | "Diagram the escalation process" → Diagramming. "Build a dashboard of escalations this quarter" → Reporting & Analytics. |

### 2.2 Reviewer boundaries

| Pair | Boundary principle | Trigger differentiator | Examples |
|---|---|---|---|
| **Code Reviewer** vs **Performance & Scale Specialist** | Code Reviewer runs four checklists on existing code. Performance & Scale Specialist designs *for* scale upfront, or *audits* designs against scale assumptions. | Direction of analysis. "Review what's written" → Code Reviewer. "Design for X volume" or "will this hold at X TPS" → Performance & Scale. | "Review this Script Include" → Code Reviewer. "Design this to handle 10M records" → Performance & Scale. |
| **Code Reviewer** vs **Security & GRC Specialist** | Code Reviewer's security checklist covers common code-level security issues. Security & GRC Specialist designs ACL strategies, RBAC, audit logging, GRC controls. | Concern depth. Code-level security issues (injection, missing role check) → Code Reviewer. Architectural security (ACL strategy, RBAC model, GDPR control) → Security & GRC. | "Review this code for security issues" → Code Reviewer. "Design the ACL model for the new scoped app" → Security & GRC. |

### 2.3 Domain expert boundaries

| Pair | Boundary principle | Trigger differentiator | Examples |
|---|---|---|---|
| **ITSM/CSM/HRSD/ITOM** vs **Discovery Specialist** | Domain specialists own *platform-specific* knowledge of their module. Discovery owns the *process* of eliciting client requirements. | What's being asked. Platform behaviour, table model, baseline configuration, anti-patterns → domain specialist. Workshop facilitation, current-state capture, transcript extraction → Discovery. | "Design the incident escalation model" → ITSM Specialist. "Run a workshop on the current incident process" → Discovery. |
| **ITOM/Discovery Specialist** vs **CMDB & CSDM Specialist** | ITOM/Discovery covers MID Server, Discovery probes/sensors, Service Mapping, Event Management. CMDB & CSDM covers CI Class Manager, CSDM phase alignment, IRE rules. | Scope. Operational ITOM (Discovery, monitoring, mapping) → ITOM/Discovery. Data model and CMDB integrity → CMDB & CSDM. | "Configure Discovery for cloud workloads" → ITOM/Discovery. "Design IRE rules for the application service class" → CMDB & CSDM. |
| **CSM Specialist** vs **FSO Insurance Specialist** | CSM covers the base case model — case lifecycle and states, the account, contact and consumer model, entitlements, the workspace and the portals. FSO Insurance covers the FSO packs built on it — the FSO Core policy and coverage model, policy servicing, claims, underwriting tasks, life servicing, Document Processor, Complaint Management, Customer Lifecycle and KYC. | Layer. A plain customer case, entitlement or account hierarchy → CSM alone. Anything naming an FSO object or an `sn_bom_*` / `sn_ins_*` table → FSO Insurance, with CSM co-firing whenever the base layer is touched; the two Envelopes are reconciled before dispatch. | "Add an entitlement check to customer cases" → CSM. "Add a commercial property claims line" → FSO Insurance, with CSM co-firing on the account and contact model. |
| **Now Assist Specialist** vs **Flow Designer Specialist** | Now Assist owns the *intelligence* design (AI Agents, agentic workflows, Now Assist skills, AI Control Tower). Flow Designer owns the *orchestration* design (flows, subflows, custom actions). | Intelligence vs orchestration. The AI Agent itself, prompts, tools, governance → Now Assist. The flow that invokes the agent or runs without intelligence → Flow Designer. | "Design the AI Agent for duplicate detection" → Now Assist. "Design the flow that triggers the duplicate detection agent on incident insert" → Flow Designer. |
| **Now Assist Specialist** vs **ITSM/CSM/HRSD Specialists** | Now Assist owns AI capability design across modules. Domain specialists own the underlying records, processes, table models. | Where the intelligence sits. Anything Now Assist–badged (skill, agent, agentic workflow) → Now Assist. The incident lifecycle, case routing, HR LE → respective domain. | "Design the Now Assist skill that summarises an incident" → Now Assist. "Design the incident escalation rules" → ITSM. |

### 2.4 Consultant and documentation boundaries

| Pair | Boundary principle | Trigger differentiator | Examples |
|---|---|---|---|
| **Discovery Specialist** vs **Story Writer** | Discovery is divergent (open-ended workshops, gap analysis). Story Writer is convergent (Gherkin, sprint-ready). | Output shape. Process map / requirements list / gap analysis → Discovery. Gherkin Feature file / acceptance criteria / sprint story → Story Writer. | "Run a workshop on X" / "Extract requirements from this transcript and structure them" → Discovery. "Write Gherkin stories for X" / "Sprint-ready stories" → Story Writer. |
| **Discovery Specialist** vs **Technical Designer** | Discovery defines *what*. Technical Designer defines *how*. | Question type. "What does the customer need" → Discovery. "How do we build it in ServiceNow" → Technical Designer. | "What's the gap between current and target state" → Discovery. "How do we structure the table model for the target state" → Technical Designer. |
| **HLD/LLD Writer** vs **Operational Documentation** | HLD/LLD = enterprise design documents for review boards (audience: architects). Operational Documentation = runbooks, training, KBA, user guides (audience: operators, end users). | Audience. Architects, reviewers, sign-off panels → HLD/LLD. Operators, support engineers, end users → Operational Documentation. | "Write the HLD for X" → HLD/LLD. "Write a runbook for X" / "Author a KBA for X" / "Create training for X" → Operational Documentation. |
| **HLD/LLD Writer** vs **Process Design Document author** | PDDs are operational process descriptions. They sit between architectural designs and runbooks. | We do not have a separate PDD specialist. PDDs route to HLD/LLD with explicit "PDD format" instruction, OR to Operational Documentation if the audience is operators rather than architects. | "Write a PDD for the change management process" → HLD/LLD with PDD section template. "Write the process the GSC follows when a P1 lands" → Operational Documentation. |
| **Estimation & Sizing** vs **SPM Specialist** | Estimation owns the sizing *method and the number*. SPM owns the demand/agile/PPM *process and tables* where the number is recorded. | Method/number vs process/table. "How big is this / size these stories" → Estimation. "How does demand→project→sprint run, what tables" → SPM. | "Give me a ROM for this feature" → Estimation. "Set up the demand intake and the project portfolio" → SPM. |
| **Estimation & Sizing** vs **Discovery Specialist** | Discovery elicits *what* the scope is. Estimation sizes a scope that is already defined. | Elicit vs size. "What does the client need / what's in scope" → Discovery. "How much effort is the defined scope" → Estimation. | "Extract requirements from this transcript" → Discovery. "Estimate the extracted backlog" → Estimation (after Discovery). |
| **Licensing & Entitlement** vs **DevOps / Release Manager** | Licensing owns what the design *costs to license* (subscriptions, SKU, custom table entitlements, AI Assists). DevOps owns *how it is deployed*. | Cost-to-license vs how-to-deploy. "Does this need more subscriptions / which SKU / how many custom table entitlements" → Licensing. "Update set strategy, App Repository, pipeline, backout" → DevOps. | "What's the licensing impact of this scoped app" → Licensing. "How do we promote the scoped app dev→test→prod" → DevOps. |
| **Licensing & Entitlement** vs **App Engine Specialist** | Licensing owns the licensing *footprint* of the custom app. App Engine owns *designing* the app. | Footprint vs design. "What does this custom app cost in custom table entitlements / which App Engine subscription" → Licensing. "How do we structure the scoped app, tables, decision tables" → App Engine. | "Price the App Engine footprint of this design" → Licensing. "Design the App Engine Studio app" → App Engine. |

---

## 3. Cross-cutting consult relationships

Some specialists are explicitly *consulted by* others rather than competing for the routing slot. Consults are evaluated at two distinct points: (a) at routing time, before the primary specialist is invoked; and (b) at post-build time, after a builder sub-agent returns its artefact. The Chief ServiceNow Architect persona must surface both types of consult at the appropriate phase of the resolution algorithm (§6).

### 3.1 Routing-time consults

Evaluated by the Chief Architect *before* the primary specialist is invoked, as part of the routing protocol.

| Consultant specialist | Consulted by | Trigger condition |
|---|---|---|
| **Performance & Scale Specialist** | Technical Designer, Developer | Volume estimates exceed 1M records, async/batch design choices, instance scaling questions, query patterns on large tables. |
| **Security & GRC Specialist** | Technical Designer, Developer, Integration Specialist | Non-trivial ACL design, PII handling in scope, SecOps pattern involvement, GDPR or regulatory controls, integration with sensitive external systems. |
| **DevOps / Release Manager** | Technical Designer, App Engine Specialist | When new scoped apps are designed (update set strategy, App Repository workflow, deployment pipeline). |
| **Licensing & Entitlement Specialist** | Technical Designer, App Engine Specialist, Now Assist Specialist, Integration Specialist | A design names or requires a custom table/scoped app (custom table entitlements), a new role granting fulfiller/write access to a sizeable population, a Now Assist or premium-SKU (Pro/Enterprise) capability, or consumption of a third-party SaaS entitlement. Sets the licensing constraint *before* build; re-fires post-build as a licensing review. |
| **Estimation & Sizing Specialist** | Chief Architect, Discovery Specialist, Technical Designer | Before a delivery commitment, or when the user asks "how long / how big / ballpark / LOE / story points". Sizes the scope (baseline-first vs custom delta shown) and records into baseline SPM. On demand rather than auto-firing on every build. |

> **Note — CMDB & CSDM promoted to gateway (v2.0).** CMDB & CSDM Specialist was formerly a routing-time consult here. It is now a mandatory Phase 1 Step 5 / §6.1 Step 7 Domain Expert gateway (`.claude/skills/cmdb-csdm-specialist/SKILL.md`) that fires automatically on CMDB/CSDM/IRE/service-model triggers (§4.4) and produces a 5-Part Constraint Envelope. It co-fires with the ITOM/Discovery gateway when a task spans CI population and CI model (ITOM owns population; CMDB & CSDM owns the model).

### 3.2 Post-build consults

Evaluated by the Chief Architect *after* a builder sub-agent returns its artefact, *before* the artefact is presented as final to the user.

| Consultant specialist | Triggered by completion of | Detection signal | Action |
|---|---|---|---|
| **Domain Expert gateway** (ITSM / CSM / HRSD / ITOM / CMDB & CSDM / FSO Insurance — skill only) | Any builder sub-agent whose task was routed through a Domain Expert gateway at Phase 1 Step 5 | Task was domain-tagged at routing time (incident, problem, change, SLA, case, HR case, Discovery, CMDB/CSDM/IRE/service-model, FSO policy/claim, etc.) | Re-adopt the same Domain Expert skill in review mode (Phase 2 Step 4). Validate the returned artefact against the Constraint Envelope produced at Phase 1 — confirm no baseline construct has been silently replaced by a custom object, and all table/field/state references are consistent with the Envelope's Data Model Alignment. If a deviation is found, surface it as a §1.1 violation and re-dispatch the builder with findings before surfacing any other post-build proposal. |
| **Code Reviewer** (skill only — no sub-agent) | Developer sub-agent; or any builder that emits server-side or client-side script (Flow Designer Specialist custom Action scripts, App Engine Specialist business rules, ATF Author step scripts) | Returned artefact contains a JavaScript code block (Script Include, Business Rule, Client Script, UI Script, Scheduled Job, custom Flow Action script, ATF step script). | Chief Architect proposes Code Reviewer handoff verbatim: *"Code artefact produced. Proposing a Code Reviewer pass (style, performance, security, best-practice) before final delivery — proceed?"* On approval, adopt Code Reviewer skill in main thread (no sub-agent dispatch) and run the four checklists against the artefact. |
| **ATF Author** (skill or sub-agent) | Developer, Flow Designer Specialist, App Engine Specialist | New code or flow definition returned and the artefact is destined for a release path (i.e., not throwaway analysis or PoC). | Chief Architect proposes: *"Build artefact produced. Proposing ATF coverage before sign-off — single-component (skill) or full-app suite (sub-agent)?"* |
| **Operational Documentation** | Any builder, when feature is approaching production readiness | User signal of imminent go-live (`"ready for prod"`, `"sign-off"`, `"release"`, `"go-live"`, `"cutover"`, `"deploy"`); or completion of an end-to-end feature spanning multiple builders. | Chief Architect proposes: *"Approaching production readiness. Proposing runbook + KBA authoring before go-live — proceed?"* |
| **Diagramming Specialist** (skill or sub-agent) | HLD/LLD Writer, Technical Designer, Integration Specialist; or any returned design artefact | A design artefact returns (HLD / LLD / Technical Design / integration spec) whose architecture, process, or data model warrants a figure; or the user asks for a diagram. | Chief Architect proposes: *"Design artefact produced. Proposing a Diagramming Specialist pass to render the architecture/process/data diagrams (editable draw.io with SVG/PNG export) before delivery — proceed?"* On approval, adopt the skill for a single figure — never the sub-agent, which has no shell — or dispatch the sub-agent for a batch pack; either way the main thread runs `scripts/render-drawio.sh` before presenting. |

These post-build consult triggers are **mandatory**: the Chief Architect must surface the proposal even if the user did not request it. The user may decline, but the offer must be made.

---

## 4. Trigger-keyword map

When the user's task contains certain keywords or phrases, the router has a strong prior toward one specialist. This map is consulted *after* boundary resolution; it's a tiebreaker for the close calls.

### 4.1 Code-related triggers

| Keyword/phrase | Primary specialist | Secondary specialist |
|---|---|---|
| "Script Include", "Business Rule", "Client Script", "UI Script", "Scheduled Job", "Background Script" | Developer | Code Reviewer (if reviewing existing code) |
| "implement", "write the code", "code the", "build the script" | Developer | — |
| "design the code", "function signature", "method signature" | Technical Designer | Developer (for the actual code) |
| "review this code", "code review", "lint", "anti-pattern" | Code Reviewer | — |
| "scale", "performance", "1M+ records", "high volume", "TPS", "batch size", "async" | Performance & Scale | Technical Designer |

### 4.2 Flow and automation triggers

| Keyword/phrase | Primary specialist | Secondary specialist |
|---|---|---|
| "Flow Designer", "flow", "subflow", "custom action", "Action Designer" | Flow Designer Specialist | — |
| "trigger when", "fires on", "runs when X happens" (orchestration semantics) | Flow Designer Specialist | — |
| "AI Agent", "agentic workflow", "Now Assist skill", "AI Control Tower", "Virtual Agent" | Now Assist Specialist | — |
| "AiRR", "AiRR Assist" | Now Assist Specialist | Integration Specialist (if bot-to-bot) |

### 4.3 Integration and data movement triggers

| Keyword/phrase | Primary specialist | Secondary specialist |
|---|---|---|
| "REST", "SOAP", "API", "webhook", "MID Server", "ECC queue" | Integration Specialist | — |
| "IntegrationHub", "spoke" | Integration Specialist | — |
| "Azure DevOps", "Service Bus", "Azure pipeline" (in integration context) | Integration Specialist | Flow Designer Specialist (for orchestration) |
| "migrate from", "import from", "transform map", "import set" | Migration Specialist | — |
| "cutover", "data load", "historical data" | Migration Specialist | — |

### 4.4 Domain triggers

| Keyword/phrase | Primary specialist | Secondary specialist |
|---|---|---|
| "incident", "problem", "change", "RITM", "SLA", "escalation", "Service Operations Workspace", "MIM", "on-call" | ITSM Specialist | — |
| "case", "account", "contact", "consumer", "entitlement", "CSM Workspace", "Customer Service Portal" | CSM Specialist | — |
| "HR case", "Lifecycle Event", "LE", "Employee Center", "HR Profile" | HRSD Specialist | — |
| "Discovery", "MID Server", "Service Mapping", "Event Management", "alert correlation" | ITOM/Discovery Specialist | — |
| "CMDB", "CSDM", "IRE", "CI relationship", "configuration item class" | CMDB & CSDM Specialist | ITOM/Discovery (for Discovery aspects) |
| "FSO", "Financial Services Operations", "insurance policy", "change coverage", "claims", "FNOL", "adjuster", "reserve", "SIU", "underwriting task", "life servicing", "Document Processor", "Complaint Management", "Customer Lifecycle", "KYC" | FSO Insurance Specialist | CSM Specialist (the case, account, contact and consumer base layer) |
| "SPM", "demand", "project", "resource", "agile development", "portfolio" | SPM Specialist | — |
| "ACL", "role", "RBAC", "audit", "GRC", "policy", "compliance", "SecOps", "vulnerability" | Security & GRC Specialist | — |
| "scoped app", "App Engine Studio", "decision table", "document template" | App Engine Specialist | — |
| "form layout", "list view", "Service Portal", "widget", "UI Builder", "Now Experience" | UI/UX Specialist | — |
| "report", "dashboard", "Performance Analytics", "indicator", "breakdown" | Reporting & Analytics Specialist | — |
| "Update Set", "App Repository", "deployment", "instance clone", "release" | DevOps / Release Manager | — |

> **These rows are triggers, not definitions.** A task can be squarely in a domain and match no row — the gateway fires on the domain (§6.1 step 7). The ITSM row also carried less than CLAUDE.md's copy of the same list until 2026-09-17 (`RITM` and `SLA` were missing, `escalation` was in neither): two hand-kept copies of one list drift, which is the second reason the list cannot be the definition.

### 4.5 Document and consulting triggers

| Keyword/phrase | Primary specialist | Secondary specialist |
|---|---|---|
| "Gherkin", "user story", "acceptance criteria", "sprint-ready" | Story Writer | — |
| "HLD", "LLD", "design document", "architecture document", "design note", "process design note" | HLD/LLD Writer (sub-agent, after approval) | — |
| "PDD", "process design document" | HLD/LLD Writer (PDD format) | — |
| "runbook", "KBA", "knowledge article", "training material", "user guide" | Operational Documentation | — |
| "workshop", "elicit requirements", "current state", "target state", "gap analysis", "transcript", "extract from this transcript" | Discovery Specialist | Story Writer (if convergence to stories is the next step) |
| "ATF", "Automated Test Framework", "test case", "test suite" | ATF Author | — |
| "diagram", "draw", "Mermaid", "draw.io", "ERD", "sequence diagram", "architecture diagram", "C4", "swimlane", "state diagram", "roadmap", "Gantt", "RACI" | Diagramming Specialist | HLD/LLD Writer or Technical Designer (if the underlying design is also requested) |
| "license", "licensing", "subscription", "SKU", "entitlement", "fulfiller", "Now Assist Assists", "App Engine units", "custom table entitlements", "App Engine subscription", "Pro vs Enterprise" | Licensing & Entitlement Specialist | App Engine / Now Assist / Integration (whichever the licensed capability sits in) |
| "estimate", "estimation", "sizing", "LOE", "level of effort", "story points", "T-shirt size", "how long", "how big", "ballpark", "ROM", "rough order of magnitude" | Estimation & Sizing Specialist | Discovery (if scope is unclear) or SPM (to record the estimate) |

---

## 5. Anti-routing rules

Explicit "do not route X to Y" cases to prevent known confusion.

| Rule | Reason |
|---|---|
| Do NOT route "design a Flow that uses an AI Agent" entirely to Now Assist Specialist. | This task has two parts. The Flow design goes to Flow Designer Specialist; the AI Agent design goes to Now Assist Specialist. The Chief Architect must split it. |
| Do NOT route "review this code for security issues" to Security & GRC Specialist. | Code-level security review belongs to Code Reviewer's security checklist. Security & GRC is for architectural security design, not code review. |
| Do NOT route "extract requirements from this transcript and write Gherkin stories" entirely to either Discovery or Story Writer. | This is a two-step task. Discovery extracts the requirements; Story Writer converts them to Gherkin. The Chief Architect must sequence both. |
| Do NOT route "implement and review this Script Include" to Developer in one shot. | Developer writes; Code Reviewer reviews. Two specialists, two passes, two artefacts. |
| Do NOT route "build a runbook" to HLD/LLD Writer. | HLD/LLD has architect audience; runbooks have operator audience. Different style, different structure. Operational Documentation owns this. |
| Do NOT auto-route "Azure DevOps" to Integration Specialist without checking context. | Could be: integration design (Integration), pipeline orchestration (Flow Designer), DevOps tooling (DevOps/Release Manager). Read the task. |
| Do NOT route "what does the customer need" to Technical Designer. | That's a Discovery question. Technical Designer answers "how do we build it." |
| Do NOT route "design for high volume" to Code Reviewer. | Forward-looking design questions go to Performance & Scale. Code Reviewer reviews what already exists. |
| Do NOT skip the §6.2 post-build evaluation when a code-emitting builder sub-agent returns. | The Code Reviewer consult is mandatory whenever code is generated. Even if the user did not ask for review, the proposal must be surfaced. The user may decline, but the offer must be made. |
| Do NOT route "draw the form layout / wireframe / mockup" to Diagramming Specialist. | Product screens and wireframes are the UI/UX Specialist's. Diagramming owns architecture / process / data / project diagrams, not the product UI surface. |
| Do NOT route "chart / dashboard of <live data>" to Diagramming Specialist. | Live-data visualisation is Reporting & Analytics. Diagramming produces static, design-time depictions, not runtime charts over instance records. |
| Do NOT let Diagramming Specialist render an unapproved custom object as accepted. | A diagram must not launder a §1.1 violation. An unapproved custom table/scope/state is drawn dashed + PENDING and flagged back; the Chief Architect owns the ruling. |

---

## 6. Resolution algorithm

The algorithm runs in two phases that map directly onto the CLAUDE.md routing protocol: routing-time (§6.1 = CLAUDE.md Phase 1) and post-build evaluation (§6.2 = CLAUDE.md Phase 2). The numbered sub-steps below are taxonomy's finer-grained resolution procedure; the canonical phase/step references used across CLAUDE.md, the SKILL.md files, and the validation tests (in the engineering checkout) are Phase 1 Step 5 (Domain Expert gateway) and Phase 2 Step 4 (Domain Expert post-build review).

### 6.1 Routing-time phase

1. **Read the task verbatim.** Identify all noun phrases and verb phrases.
2. **Apply trigger-keyword map (§4)** to identify candidate specialists.
3. **If only one candidate** — propose that specialist. Skip to step 7.
4. **If multiple candidates** — apply the relevant boundary table (§2) using the trigger differentiator.
5. **If still ambiguous** — apply anti-routing rules (§5) to eliminate impossible routes.
6. **If still ambiguous after §5** — the task may legitimately require *multiple* specialists in sequence. Propose a sequenced plan: "Specialist A produces X, then Specialist B consumes X to produce Y."
7. **Apply the Domain Expert gateway (mandatory — this is CLAUDE.md Phase 1 Step 5).** Check whether the task falls within a domain covered by a v2.0 gateway (ITSM, CSM, HRSD, ITOM, CMDB & CSDM, FSO Insurance — see §4.4 domain triggers). If yes, load and adopt the relevant Domain Expert skill before dispatching any builder — **or before finalizing a domain-scoped *document* deliverable (implementation proposal, scoping document, HLD/LLD/PDD) that asserts baseline-process, data-model, or §1.1 claims about a gateway domain.** The Domain Expert produces its 5-Part Constraint Envelope (OOB Process Map · Data Model Alignment · §1.1 Verdict · Routing Recommendation · Anti-Patterns). **For document deliverables** the gateway grounds/ratifies the document's domain claims even with no builder dispatched; for a multi-domain document each touched gateway fires and sections are marked *gateway-ratified* vs *freehand, pending gateway*. **Multiple gateways co-fire** for cross-domain tasks (e.g., CSM ↔ ITSM ↔ CSDM) — reconcile their envelopes into one dispatch context. For the CMDB & CSDM ↔ ITOM/Discovery boundary, ITOM owns CI *population* and CMDB & CSDM owns the CI *model*; fire both only when the task spans both. No builder sub-agent is dispatched until every Envelope is produced and the §1.1 Verdict is resolved. Verdict C (custom object required) is a hard stop — surface the OPEN QUESTION and wait for explicit user approval before proceeding. **Part 3 is the turn's conclusion: no closing recommendation, proposed default or summary may lean against it or against Part 5, and an Architect who disagrees with the gateway raises that disagreement as its own OPEN QUESTION rather than as a default.** **Adoption is an action in the turn, with a trace: invoke the gateway's skill (`Skill` with its name) or read `.claude/skills/<gateway>/SKILL.md`, then write the Envelope.** A gateway is a skill, never a sub-agent — nothing to dispatch, propose or approve; a turn that asks permission to run one, declares a Verdict with no Envelope, or loads nothing has not fired it, and the Envelope does not wait on an engagement folder. Naming a custom object fixes Part 3 to Verdict C and nothing else — Parts 1, 2, 4 and 5 are still written. **§4.4 is a trigger, not a definition, and the gateway is never deferred.** It fires on the DOMAIN — a scope fragment, a baseline table, or the domain's own semantics fire it with no listed keyword present — and *"it fires once X is known"* is a gateway that did not fire; unknowns are recorded IN the Envelope. When it is unclear whether a domain applies, fire. (Observed: T-10, 2026-09-12 — the prompt named `x_acme_itsm_escalation_log` and escalation semantics, matched no §4.4 ITSM keyword, and the gateway was made conditional on a parent table, so the §1.1 halt was raised generically instead of as Part 3.)
8. **Surface routing-time consult relationships (§3.1).** Mention any cross-cutting consultants whose trigger conditions fire. Do not invoke them yet — surface them as part of the proposal.
9. **Stop and wait** for user approval before proceeding to specialist invocation.

### 6.2 Post-build evaluation phase

Triggered when a builder sub-agent returns an artefact, *before* the artefact is presented as final.

10. **Inspect the returned artefact.** Classify content: code block, flow definition, configuration, pure design.
11. **Check for §1.1 violations.** Scan the artefact for new table names (`x_*_*` or non-baseline `<scope>_<table>`), new scoped app prefixes, new Connection & Credential Aliases, new state values, or new sys_user_group structures that were not approved in the dispatch envelope. If any are found, halt immediately and re-dispatch the originating builder with the §1.1 halt protocol as the rework brief. Do not proceed to step 12 until the violation is resolved.
12. **Domain Expert post-build review (domain tasks only — this is CLAUDE.md Phase 2 Step 4).** If the task was routed through a Domain Expert gateway at Phase 1 Step 5, re-adopt the same Domain Expert skill in review mode and validate the artefact against the Constraint Envelope (§3.2, first row). If a deviation is found, re-dispatch the builder with findings. Do not proceed to step 13 until the Domain Expert clears the artefact.
13. **Evaluate remaining post-build consult triggers (§3.2).** For each remaining post-build consult whose detection signal matches the artefact (Code Reviewer, ATF Author, Operational Documentation), prepare a consult proposal using the verbatim Action wording from §3.2.
14. **Present artefact + consult proposals together.** The user receives the builder's artefact alongside a clearly labelled set of post-build consult proposals. The user chooses which to invoke.

If no post-build consult triggers match (e.g., Technical Designer returned a pure design doc with no code and the task had no domain tag), step 14 still runs but contains zero proposals — the artefact is presented as final.

---

## 7. Maintenance

This document is updated when:

- A new specialist is added to the roster.
- A real misroute is observed in production use (add to §5 anti-routing rules).
- A new trigger keyword pattern emerges (add to §4).
- ServiceNow ships a major release that changes terminology meaningfully (add new keywords, deprecate old ones in a `RELEASE NOTES:` block at the bottom of relevant tables).

Updates are committed to git with a clear message: `taxonomy: <change-summary>`.

---

*End of taxonomy.md v1.6 — FSO Insurance Specialist (28) added as the sixth Domain Expert gateway, skill only: §1 roster row and count; §2.3 boundary row (CSM vs FSO Insurance); §3.2 Domain Expert gateway row; §4.4 trigger row; §6.1 Step 7 gateway list. Prior — v1.5: Delivery-governance layer (engine v2.8.0): two skill-only cross-cutting consults added — Licensing & Entitlement Specialist (26) and Estimation & Sizing Specialist (27); roster renumbered to 27; §0 governance reference gains §4 (Delivery Artefact Governance — ADR/RTM/RAID-NFR); §2.4 boundary rows added (Estimation vs SPM, Estimation vs Discovery, Licensing vs DevOps, Licensing vs App Engine); §3.1 routing-time consult rows added for both; §4.5 trigger rows added for both. Prior — v1.4: §6.1 Step 7 extended: Domain Expert gateways fire before finalizing domain-scoped document deliverables (proposals, scoping docs, HLD/LLD/PDD) that make domain claims, not only before builder dispatch (document-gateway rule; aligns with CLAUDE.md v2.7.8). Prior — v1.3: Diagramming Specialist added as the 23rd specialist and 9th sub-agent (skill + batch diagram-pack sub-agent): roster renumbered to 23, §2.1 builder boundaries added (vs HLD/LLD Writer, Technical Designer, UI/UX, Reporting & Analytics), §3.2 post-build consult row added, §4.5 trigger row added, three §5 anti-routing rules added (UI/UX wireframe boundary, Reporting live-data boundary, §1.1 PENDING-render guard). Prior — v1.2: CMDB & CSDM Specialist promoted from planned routing-time consult to active v2.0 Domain Expert gateway (roster marked ✅, §3.1 consult row retired with promotion note, §3.2 post-build Domain Expert row and §6.1 Step 7 gateway list updated, co-fire boundary with ITOM/Discovery documented).*
