# User Guide and Examples

**Repository:** [`farstic/snowarch`](https://github.com/farstic/snowarch)
**Purpose:** The day-to-day operator's guide — four worked scenarios covering the most common ways the team uses the engine, including live deployment to a ServiceNow instance.
**Audience:** Whole team
**Last updated:** 29 May 2026
**Reading time:** 18 minutes

For each scenario: what you type, what the engine does, what you receive, and what to do next.

---

## How to send a prompt

Open Claude Code (`claude` from the repo root) and type your request at the `❯` prompt. Live deployment to an instance (Scenario 4) runs through Claude Code as well, because that is where the MCP connection runs. See [`INSTALL.md`](./INSTALL.md) if you haven't set up yet.

Describe what you need in plain English — that is the whole interface for design work. There is one
exception, the `/snowarch` command below, which configures and reports on the engine itself rather
than doing ServiceNow work. Mention the module (ITSM, CSM, HRSD, ITOM) if it's obvious, mention "Australia release" so the engine doesn't recommend a feature you don't have, and let the engine handle the rest.

---

## `/snowarch` commands

Three sub-commands, none of which design anything: they tell you what state this checkout is in, and
they walk you through connecting a ServiceNow instance.

| You type | What you get |
|---|---|
| `/snowarch status`, or just `Status` | The authoritative `Mode:` line, then the engine version, the docs pin, the roster and the capability flags in force. |
| `/snowarch setup-instance` | The steps for adding an instance — with the credential part handed to your own terminal. |
| `/snowarch setup-instance --resume` | Picks up after you have finished in the terminal, and confirms what is now configured. |
| `/snowarch doctor` | The full health check: `DOCTOR: n ok, n warn, n fail`, then every failure with its remedy. |

### What `/snowarch status` prints

Eight lines, in this order, each filled from one key of the doctor's JSON — the same report the
terminal prints, formatted for reading:

```
Mode: live — pdi (pdi) · preset pdi-developer · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=off FLUENT=off · 398 tools (contract)   [modeLineDetailed]
Licence: ok · LIC-2026-0002 · until 2027-10-31                                               [checks: E-31's data]
Engine: snowarch 2.0.0 · tag v2.0.0 · contract a1b2c3d                                       [engine.version, engine.tag, engine.contractSha]
Docs: vendor/ServiceNowDocs @ ba513f2 (australia) · sparse · citations checked: 181 | dead: 0 [engine.docs]
Roster: 29 skills / 9 agents                                                                 [engine.roster]
Capabilities: docx yes (python3) · PDF QA no · draw.io yes · Mermaid no                       [engine.capabilities]
Instances: pdi (pdi, custom, default) · uat (test, read-only)                                 [server.instances]
Doctor: 41 ok, 1 warn (E-23), 0 fail — quick run 2026-09-10 10:00 · full report: ./snowarch doctor  [summary, checks, ranAt, options.quick]
```

A line whose key is empty is left out rather than guessed. Two usually are: capability packs and
citation counts come from checks that spawn a process or walk the whole corpus, so a quick run —
which is what a session always does — leaves them out and says so. `./snowarch doctor` reports
them. `Instances:` is absent in design-only, and when anything failed, one line per failure follows
with its remedy. A warning is **named but not listed** — its id appears in the count, as `1 warn
(E-23)` above, and its remedy stays in `./snowarch doctor`, because a panel that printed every
warning's remedy would be a report rather than a panel.

The `Licence:` line is the session banner's, in every state: `Licence: missing` on a checkout with no
licence, and `Licence: ok · LIC-… · until <date>` with one in force. From 2.0.13 a state that is not in
force refuses every MCP tool, and every command but `licence`, `doctor`, `status`, `version`, `upgrade`,
`bootstrap` and `mode design`, and nothing turns that off. `./snowarch licence check` says why. A licence's
`valid_until` is a calendar date in UTC: the last day counts, until 00:00 UTC of the next day, and the
commands print it as `<date> (UTC, N days)`.

### Reading the Mode line

`Mode:` is the answer to "can this session touch a real instance?", and it comes from the doctor —
never from what the session infers. Four shapes:

```
Mode: live — instance=pdi (pdi) preset=pdi-developer
Mode: design-only
Mode: unknown — this checkout has not been bootstrapped; run ./bootstrap.sh (Windows: bootstrap.cmd)
Mode: <mode> — from bootstrap state; doctor unavailable until Node 20+ is installed
```

The first two are the **base** line, produced by one function (`tools/snowarch/lib/text.mjs`
`modeLine()`) and quoted verbatim by the bootstrap's summary, the SessionStart banner,
`/snowarch status` and `snowarch mode` — four programs, one string, so they cannot answer "what am
I in" three different ways. The doctor additionally prints a **detailed** variant that appends its
own findings (` — doctor <date> <n> ok`, flags, tool count); that is a longer line for a longer
report, not a second definition of the Mode line.

If you ever see a mode stated without one of these shapes, the session has guessed and you should
ask it to run `/snowarch status` again. **Live mode is not the same as permission to write** — every
write still needs its own `write approved` message (see *Approving a write*, below).

### Adding an instance

`/snowarch setup-instance` asks you, in chat, for two things only: a short label and the instance URL.
Everything else — environment, authentication method, preset — the terminal wizard proposes and shows
you for review.

It then hands you a five-step block to run in your own terminal, ending with
`/snowarch setup-instance --resume` to come back here. That hand-off is the point of the command:
**your password never passes through the chat.** The session will not ask you for a password, token or
client secret, and if anything claiming to be this command does, stop and report it.

Nothing is written to the instance by any of this. Setup configures a connection; using it is a
separate, explicitly approved act.

---

## Scenario 1 — Business Analyst: requirements to user stories

**Use this when:** you have stakeholder notes or workshop output and need sprint-ready user stories.

### What you type

```
We had a workshop yesterday with the IT Service Desk leads about incident
escalation. Here is what they want:

- L1 agents should be able to escalate an incident to L2 with a one-click
  action from the form, recording the escalation reason.
- The escalation must trigger an email to the L2 assignment group AND a
  Teams notification to the on-call engineer.
- Once escalated, the L1 agent retains read access but cannot reassign or
  close the incident.
- We need a weekly report of escalation volume by category and by L1 agent.

Module: ITSM. Workspace: Service Operations Workspace. Australia release.

Please produce sprint-ready Gherkin user stories with acceptance criteria
and propose any supporting stories I may have missed.
```

### What the engine does

The **ITSM Specialist** picks up the request first. It confirms the requirements map to baseline ServiceNow features — the existing escalation field, on-call rotation tables, the OOB notification framework, and `sys_history_set` for audit history. No custom build needed. The **Story Writer** then produces the deliverable.

### What you receive

A Gherkin Feature file containing:

- The **main scenario** — L1 escalates to L2 with reason, recipients get notifications.
- **Edge cases** — insufficient role, on-call engineer unavailable, Teams integration fails.
- **Proposed supporting stories** — access control, notification, audit, reporting, ATF test coverage, KBA documentation. (The stories you'd otherwise discover mid-sprint.)
- **Open questions** — e.g. *"Does the Teams notification need a new spoke, or is the existing Microsoft Teams spoke already deployed?"*

### What to do next

- Answer any open questions in your next message (or accept the defaults).
- Hand the Feature file to the sprint team, or continue with *"Please write the access control story as a separate Feature file."*

---

## Scenario 2 — Architect: integration design

**Use this when:** you need a full architectural specification for an integration with an external system.

### What you type

```
Design the integration that sends resolved P1 and P2 incidents from
ServiceNow to our Azure DevOps tenant. Each ServiceNow incident becomes
a work item in the Engineering project. The payload includes incident
number, short description, full description, resolution notes, resolved-by
user, and impacted CI.

Volume: approximately 100 P1/P2 resolves per day.
Authentication: OAuth2 against Azure DevOps.
Network: outbound traffic must go via the MID Server.
SLA: best effort, but failures must not be silent.

Module: ITSM. Australia release. Scoped app: x_acme_itsm.
```

### What the engine does

The **ITSM Specialist** confirms the integration trigger (resolved P1/P2 incidents) maps to baseline fields — no custom table needed on the source side.

The engine then proposes a **sequenced plan**:

1. **Integration Specialist** — designs the spoke architecture: REST Message definition, OAuth2 credential setup, retry logic (exponential backoff, 3 attempts), dead-letter handling, observability.
2. **Flow Designer Specialist** — designs the flow that triggers on incident resolution, filters for P1/P2, and calls the spoke.
3. **Developer** — implements any custom Action server script the flow needs.

Before the sequence starts, the engine flags **two consults** automatically: a Security & GRC review (outbound payload contains incident data) and a DevOps & Release Manager review (update set strategy for the spoke).

You approve the plan. The three specialists run in sequence, with the engine reviewing each output before moving on.

### What you receive

- Integration architecture specification (spoke, auth, retry, DLQ, logging)
- Flow Designer specification (trigger, filter, branches, error handling)
- Custom Action server code (if needed)
- An **automatic Code Reviewer pass** on any code produced
- Security & GRC consult notes, DevOps update set strategy notes

### What to do next

Review the Code Reviewer verdict. If it flagged anything as `FIX-BEFORE-PROD`, fold those into the next iteration. If anything is `BLOCK`, the engine offers to dispatch a rework cycle automatically — just say yes.

---

## Scenario 3 — Developer: the §1.1 halt in action

**Use this when:** you're about to ask the engine to build something custom and you want to see the governance discipline that makes the engine valuable.

### What you type

```
Design and implement an audit trail for case escalations on the customer
service case form. We need a separate structured log of every escalation
event with timestamp, escalated-by user, escalated-to group, and escalation
reason. Show me the table model and the Script Include. Australia release.
```

### What happens — and the visual

This request *looks* like it needs a custom table. The engine's job is to interrogate that assumption against baseline ServiceNow — now confirmed against the **live instance schema**, not just documentation — before writing a single field.

```mermaid
sequenceDiagram
    autonumber
    actor You as Developer
    participant CA as Chief Architect
    participant CSM as CSM Specialist
    participant Builder as Builder Specialists<br/>(NOT invoked yet)

    You->>CA: Design a custom escalation log table

    rect rgb(245, 240, 230)
    Note over CA,CSM: Engine checks baseline first
    CA->>CSM: Take a look — this is CSM territory
    CSM->>CSM: Evaluate baseline candidates:<br/>• work_notes (free text only)<br/>• sys_history_set (no reason field)<br/>• case.escalation (flag, not a log)<br/>• sn_customerservice_escalation — the case escalation record (baseline)
    CSM-->>CA: The baseline escalation record covers it —<br/>who escalated, the reason, the history.<br/>The request names a separate log, so the decision is yours.
    end

    rect rgb(254, 235, 235)
    Note over CA,You: §1.1 HARD STOP — engine pauses
    CA->>You: Here is the baseline that covers it (recommended).<br/>Here is the table you named, rejected as unnecessary.<br/>Here are the consequences if you approve it anyway.<br/><br/>What's your decision?
    Note over CA: NO table model produced.<br/>NO code produced.<br/>NO design artefact of any kind.
    CA-x Builder: ❌ Builders not dispatched
    end

    Note over You,CA: You think about it. Make a conscious decision.

    You->>CA: Approved. Use a new table in x_acme_csm.

    rect rgb(235, 254, 235)
    Note over CA,Builder: Now the engine builds it
    CA->>Builder: Dispatch with the approved scope and<br/>the CSM Specialist's anti-patterns as constraints
    Builder-->>You: Table model + ACLs + business rules + code<br/>(plus an automatic Code Reviewer pass)
    end
```

The key moment is the red zone. The engine **pauses**: no table model, no field list, no ACL matrix, no code. It shows the baseline it evaluated and what that covers, names the custom object you asked for — with no design — lists the consequences of approving it, and offers the baseline path. Then it waits.

### What you receive (before you've decided)

A pause. The message contains:

1. **The baseline evaluated** — what it covers, and where it falls short.
2. **The custom object you named** — its kind, its place in the §1.1 hierarchy and what it would hold, or why it is not needed.
3. **Consequences of approval** — data model impact, deployment, support cost, upgrade risk.
4. **Alternatives if rejected** — the baseline path, with any gap as an open question.

What you will *not* see: a field list, column types, an ACL matrix, code, or an ERD. If you do see those in the same response as the OPEN QUESTION, the engine has bypassed §1.1 — that's a bug; please flag it. (This is regression-tested as **T-10**.)

### What to do next

Four legitimate responses:

| Reply | What happens |
|---|---|
| `"Approved. Use a new table in the existing x_acme_csm scoped app."` | The engine resumes and builds it with the approved scope as a constraint |
| `"Rejected — use the baseline escalation record."` | The engine designs on the baseline, with any gap as an open question |
| `"Re-evaluate option 2 more carefully — I think there's a baseline path."` | The CSM Specialist re-runs with the refined constraint |
| `"Defer this feature to the next release."` | The engine acknowledges and closes the thread |

The choice is yours, made consciously, documented in the thread.

---

## Scenario 4 — Deploying to a live instance (the two write gates)

**Use this when:** a design has been approved and reviewed, and you want the engine to build it *directly on your ServiceNow instance* rather than hand you code to paste. **CLI only** — this uses the MCP connection.

### What you type

```
The SLA breach-risk Script Include we designed is approved. Deploy it to
the instance. Put it in a new Update Set called "SLA Risk — May 2026".
Australia release.
```

### What the engine does — and what it asks you

The engine has already cleared §1.1 (the Script Include touches only baseline tables — `incident`, `task_sla`, `contract_sla`, `sys_user_group`). If no engagement is named in the session, it first asks `Which engagement is this for?` — once, and the answer approves nothing; it is the engagement in the Update Set's name (`<engagement>-<topic>`). Before it writes anything, it then runs the **two write gates** in order:

```mermaid
flowchart LR
    A([Approved design]) --> G1{§2.1<br/>'write approved'?}
    G1 -->|asks you| You[You reply:<br/>'write approved']
    You --> G2[§2.2: set Update Set<br/>preference to target]
    G2 --> W[Create Script Include<br/>on the instance]
    W --> V[Verify capture in<br/>sys_update_xml]
    V --> D([Live + captured])

    classDef gate fill:#2563eb,stroke:#1e3a8a,color:#fff
    classDef act fill:#16a34a,stroke:#14532d,color:#fff
    class G1,G2 gate
    class W,V act
```

1. **Gate 1 — §2.1 Write Approval.** Even though you said "deploy it", the engine pauses and asks, verbatim: *"About to create the SLABreachRiskCalculator Script Include on the instance — write approved?"* Your original instruction is **not** sufficient on its own; the engine needs a discrete approval naming the write. You reply `write approved`.
2. **Gate 2 — §2.2 Update Set Capture.** The engine creates the "SLA Risk — May 2026" Update Set, points your `sys_update_set` user preference at it, *then* creates the Script Include — so ServiceNow captures it automatically.
3. **Verify.** The engine confirms the object appears in `sys_update_xml` for that Update Set.

### What you receive

- Confirmation the Script Include is live, with its name.
- Confirmation it was captured in the named Update Set (so it can be promoted).
- Any `warnings` on the result. `VALUE_TRUNCATED` means the write succeeded but the platform stored a value cut at its column limit (PN-07 and PN-10 in [`PLATFORM-NOTES.md`](./PLATFORM-NOTES.md)): the record exists with the cut value, so ask the engine to modify it rather than add it again. `FIELD_NOT_STORED` means the response did not show a field the tool sent, such as a Business Rule's filter.

### What to do next

- Inspect the object in the instance, or ask the engine to query it back for you.
- When ready to promote, export the Update Set per your release process.

> **Why the friction is the point.** The engine will never write to your instance off the back of a general instruction. "Deploy it", "go ahead", or a tier upgrade are not write approvals. Each write is a discrete, named, logged decision — and every write lands in an Update Set, so nothing is ever stranded outside change control. Full detail: [`governance/mcp-protocols.md`](../governance/mcp-protocols.md) for the write gate and the update-set capture, and [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) when a call is refused.

---

## Tips for working with the engine

### Approving a proposal (design)

The engine always proposes before it builds. Design approvals are simple: `Yes, proceed.` · `Approved — go.` · `Continue with the plan as stated.`

### Approving a write (deployment)

A **live write** needs an explicit, specific approval — `write approved` — naming what's being written. A design approval does not carry over to a deployment. This is deliberate (§2.1).

### Redirecting

When the proposed plan is wrong, push back specifically: `No — route this to the Integration Specialist first.` · `Skip the Performance & Scale consult; volumes are small.` · `Re-route to Story Writer; I want Gherkin, not a technical design.`

### Declining the automatic Code Reviewer pass

The Code Reviewer fires automatically on any JavaScript. You can decline — `Skip the Code Reviewer pass — this is a throwaway prototype.` — but keep it on for anything destined for an instance.

### `Status` is your orientation command

Type `Status` any time to see the loaded engagement, the locked release family, the full specialist roster, and any drift the engine has noticed. Useful at session start or after a long pause.

### Switching engagements

`Switch context to clients/<client-name>/.` The engine reads that engagement's `<name>-engagement-state.md` and applies its defaults silently from then on.

---

## Where to next

- For what the engine is and the team metaphor: [`README.md`](../README.md).
- For the routing and post-build protocol: [`CLAUDE.md`](../CLAUDE.md), and the rules behind it in [`governance/governance-rules.md`](../governance/governance-rules.md).
- For live-instance operations: [`governance/mcp-protocols.md`](../governance/mcp-protocols.md), and [`MODES-AND-PRESETS.md`](./MODES-AND-PRESETS.md) for what each preset grants.
- For setup: [`INSTALL.md`](./INSTALL.md) — the one install page.

---

*Documents the [AI ServiceNow Architect](https://github.com/farstic/snowarch) v2.6 for day-to-day operators.*
