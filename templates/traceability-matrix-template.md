# Requirements Traceability Matrix (RTM) — {{client}} / {{release or PI}}

> **What this is:** the "golden thread" that links every requirement to the story, design, build, test, and deployment that satisfies it. One living file per engagement (or per release/PI), kept at `clients/{{client-short-name}}/traceability.md`. See `governance/governance-rules.md` §4.2.
>
> **Who maintains it:** the Chief Architect owns the file; each specialist **appends its row reference as it produces an artefact** (Story Writer adds the story ID, Technical Designer the design ref, Developer the build artefact, ATF Author the test ID, DevOps the update set). The matrix is updated at Phase 2 post-build, not retro-fitted at the end.
>
> **Why:** at a review board the first question is "show me this requirement is covered and tested." Without the thread, that answer is reconstructed by hand. With it, it is a lookup.

---

## Status legend
`Proposed` → `Designed` → `Built` → `Tested` → `Deployed` · plus `Blocked` / `Descoped` / `Deferred`.
Coverage flags: ✅ complete · 🟡 partial · ⬜ not started · ❌ gap (covered nowhere).

## Matrix

| Req ID | Requirement (one line) | Source | Story / Feature | Design (HLD/LLD/Tech) | Build artefact | Test (ATF / UAT) | Deploy (update set / release) | §1.1 / ADR | Status | Coverage |
|---|---|---|---|---|---|---|---|---|---|---|
| R-001 | {{requirement}} | {{Discovery Output / workshop / blueprint ref}} | {{STRY-… / .feature}} | {{LLD §… / Tech-design ref}} | {{Script Include / flow / config}} | {{ATF test/suite ID / UAT case}} | {{update set name / release}} | {{ADR-NNN / baseline}} | {{Built}} | 🟡 |
| R-002 | {{…}} | {{…}} | {{…}} | {{…}} | {{…}} | {{…}} | {{…}} | {{…}} | {{…}} | ⬜ |

## Gap report (auto-derive from the matrix)
List every row where Coverage is ❌ or where a downstream column is empty for a `Designed`+ requirement. These are the items a review board will catch — surface them as OPEN QUESTIONS before sign-off.

| Req ID | Missing link | Owner | Action |
|---|---|---|---|
| {{R-0xx}} | {{no test coverage}} | {{ATF Author}} | {{author ATF before release}} |

## Change log
| Date | Req ID(s) | Change | By |
|---|---|---|---|
| {{YYYY-MM-DD}} | {{R-001}} | {{added Build artefact ref}} | {{specialist}} |

---

*RTM template — ServiceNow Architecture Engine. The thread is only useful if it is current: update the row the moment an artefact is produced, per governance/governance-rules.md §4.2.*
