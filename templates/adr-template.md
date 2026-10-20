# ADR-{{NNN}} — {{Short decision title}}

> **What this is:** an Architecture Decision Record. One file per significant decision. Copy this template to `clients/{{client-short-name}}/decisions/ADR-{{NNN}}-{{slug}}.md` and fill it in. ADRs are the durable "why" behind the build — they survive sessions, laptops, and handovers. See `governance/governance-rules.md` §4.1.
>
> **When to write one (governance/governance-rules.md §4.1):** any §1.1 custom-object approval or rejection; any baseline-vs-custom call; any routing override; any choice between two viable ServiceNow patterns (spoke vs Scripted REST, report vs PA, flow vs business rule, workspace vs portal); any release/scope/security trade-off a reviewer would later ask "why did we…?" about.

---

| Field | Value |
|---|---|
| **ADR ID** | ADR-{{NNN}} |
| **Title** | {{Short decision title}} |
| **Status** | Proposed / Accepted / Superseded by ADR-{{NNN}} / Rejected |
| **Date** | {{YYYY-MM-DD}} (absolute date) |
| **Decision owner** | {{name / role with decision authority}} |
| **Engagement** | {{client}} — {{module(s)}} |
| **Release family** | {{Australia / other}} |
| **§1.1 relevance** | None / Custom-object APPROVED / Custom-object REJECTED / Baseline confirmed |
| **Related** | RTM rows {{IDs}} · RAID {{IDs}} · stories/HLD/LLD {{refs}} · supersedes/superseded {{ADR}} |

## Context
{{The forces at play: the requirement, the constraint, the volumes, the sensitivity, what the client already runs. Enough that someone new understands the decision without asking. State the release family if the decision is version-sensitive.}}

## Decision
{{The decision, stated plainly in one or two sentences. "We will use X." Name the ServiceNow constructs precisely (real table/feature names).}}

## Options considered
| Option | Summary | Pros | Cons | Licensing / effort note |
|---|---|---|---|---|
| **A (chosen)** | {{...}} | {{...}} | {{...}} | {{Licensing Specialist / Estimation note if relevant}} |
| B | {{...}} | {{...}} | {{...}} | {{...}} |
| C (do nothing / defer) | {{...}} | {{...}} | {{...}} | {{...}} |

## §1.1 record (if a custom object was in play)
- **Baseline option evaluated:** {{what baseline construct was considered and why it fell short — "didn't think of one" is not acceptable}}
- **Custom object:** {{smallest-scope variant, per governance/governance-rules.md §1.1 hierarchy}}
- **Approval:** {{who approved/rejected, in which message/meeting, on what date}}
- **Consequences:** {{data-model / deployment / support / upgrade-risk / App Engine licensing impact}}

## Consequences
{{What becomes true once this is in place — positive and negative. What it constrains downstream. What it costs (effort → Estimation; licensing → Licensing Specialist). What we accept as a known limitation.}}

## Follow-ups
- {{Action / owner / date — e.g., "Confirm Pro SKU before build — {{owner}} — {{date}}"}}

---

*ADR template — ServiceNow Architecture Engine. Keep ADRs short, dated, and decisive. One decision per file; never edit a decision's history — supersede it with a new ADR.*
