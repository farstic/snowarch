# Non-Functional Requirements (NFR) Checklist — {{capability / programme}}

> **What this is:** the structured capture of *how well* the solution must behave, as opposed to *what* it must do. Functional requirements become stories; NFRs become design constraints. Capture these at Discovery/design time — an NFR discovered at UAT is a re-architecture. See `governance/governance-rules.md` §4.3.
>
> **How to use:** fill the target column for every row in scope; mark `N/A` (with a one-line why) for the rest. Each NFR with a target hands to the owning consult as a constraint and becomes a RAID risk if it is at risk. Targets are the client's to confirm — never assert a target from memory.

---

| # | NFR category | Question to answer | Target / SLA | Owning consult | RAID if at risk |
|---|---|---|---|---|---|
| 1 | **Performance — response** | Acceptable form-load / list / query / API response time? | {{e.g., <2s p95}} | Performance & Scale | {{RSK-…}} |
| 2 | **Performance — throughput / volume** | Record volumes (now + 3yr growth)? transactions/sec? batch windows? | {{e.g., 5M incidents, 200 tps}} | Performance & Scale | |
| 3 | **Scalability** | Concurrent users? peak vs steady-state? large-table query patterns? | {{…}} | Performance & Scale | |
| 4 | **Availability / RTO-RPO** | Uptime expectation? maintenance windows? recovery objectives? | {{e.g., 99.9%, RPO 24h}} | DevOps / Release | |
| 5 | **Security — access** | RBAC model, separation of duties, least-privilege expectations? | {{…}} | Security & GRC | |
| 6 | **Security — data sensitivity** | PII / financial / health? classification, encryption, masking? | {{…}} | Security & GRC | |
| 7 | **Auditability** | What must be provably logged (who/when/what)? retention of the log? | {{…}} | Security & GRC | |
| 8 | **Compliance / regulatory** | GDPR / SOX / ISO / industry rules in scope? attestation/evidence? | {{…}} | Security & GRC | |
| 9 | **Data retention / archival** | How long is data kept? archive/rotation? right-to-erasure? | {{…}} | Performance & Scale | |
| 10 | **Usability / accessibility** | WCAG level? supported browsers? portal vs workspace? | {{e.g., WCAG 2.1 AA}} | UI/UX | |
| 11 | **Localization / i18n** | Languages? time zones? multi-currency? domain separation? | {{…}} | relevant domain | |
| 12 | **Mobile** | Native mobile / responsive portal expectations? offline? | {{…}} | UI/UX | |
| 13 | **Integration NFRs** | Latency, retry, idempotency, rate limits, DLQ for each interface? | {{…}} | Integration | |
| 14 | **Maintainability / supportability** | Config-over-code expectation? upgrade-safe? documentation/runbooks? | {{…}} | Op-Docs / Architect | |
| 15 | **Licensing / entitlement** | Subscription/SKU/App-Engine/AI-consumption envelope the design must fit? | {{…}} | Licensing | |
| 16 | **Capacity / cost** | Transaction quota, storage, AI Assists budget the design must respect? | {{…}} | Licensing / Perf | |

## Out of scope (state explicitly)
{{List the NFR categories marked N/A and the one-line reason each — explicit scoping prevents a "but we assumed…" at UAT.}}

## Open NFR questions → RAID
{{Any row where the target is unknown becomes an Assumption or Risk in the RAID log until the client confirms it.}}

---

*NFR checklist template — ServiceNow Architecture Engine. NFRs are design constraints, not afterthoughts: capture at design time, hand each to its owning consult, and track unconfirmed targets in RAID (governance/governance-rules.md §4.3).*
