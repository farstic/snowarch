# RAID Log — {{client}} / {{engagement or PI}}

> **What this is:** the engagement's running register of **R**isks, **A**ssumptions, **I**ssues, and **D**ependencies. One living file per engagement at `clients/{{client-short-name}}/raid-log.md`. See `governance/governance-rules.md` §4.3.
>
> **How it is fed:** specialists surface RAID items as they work — Estimation surfaces sizing risks and assumptions, Discovery surfaces dependencies and open assumptions, Performance/Security/Licensing surface their own risks, and every `OPEN QUESTION` that is not immediately resolved becomes a RAID entry, keeping its coded id and the artefact's name in `Linked` (`OQ-ST-2` · `case-escalation.feature`; `governance/governance-rules.md` §4.4). The Chief Architect owns the file and reviews it at each design checkpoint.
>
> **The distinction (keep them in the right quadrant):** a **Risk** *might* happen (future, probabilistic); an **Issue** *is* happening (present, actual); an **Assumption** is something taken as true but unconfirmed; a **Dependency** is something we need from elsewhere.

---

## Risks (might happen — manage the probability and impact)
| ID | Risk (if/then) | Prob | Impact | Score | Owner | Mitigation | Status | Linked |
|---|---|---|---|---|---|---|---|---|
| RSK-01 | If {{condition}} then {{consequence}} | H/M/L | H/M/L | {{P×I}} | {{owner}} | {{action}} | Open/Closed | {{RTM R-0xx / ADR}} |

## Assumptions (taken as true — confirm or convert to a risk)
| ID | Assumption | Confirmed? | If false → | Owner | Confirm-by date |
|---|---|---|---|---|---|
| ASM-01 | {{e.g., Pro SKU is owned}} | No | {{becomes RSK / cost}} | {{owner}} | {{YYYY-MM-DD}} |

## Issues (happening now — resolve)
| ID | Issue | Raised | Severity | Owner | Resolution / next step | Status | Linked |
|---|---|---|---|---|---|---|---|
| ISS-01 | {{actual problem}} | {{YYYY-MM-DD}} | Critical/High/Med/Low | {{owner}} | {{action}} | Open/Resolved | {{…}} |

## Dependencies (needed from elsewhere — track the supplier and the date)
| ID | Dependency | Type | Needed from | Needed by | Status | If late → | Linked |
|---|---|---|---|---|---|---|---|
| DEP-01 | {{e.g., external API sandbox credentials}} | Internal/External | {{party}} | {{YYYY-MM-DD}} | Pending/Met | {{blocks RTM R-0xx}} | {{…}} |

## Review cadence
Reviewed at each design checkpoint and before any release sign-off. Closed items stay in the log (struck through or status=Closed) for audit — never deleted.

---

*RAID template — ServiceNow Architecture Engine. Convert every unresolved OPEN QUESTION into a RAID item so nothing falls through the gap between sessions (governance/governance-rules.md §4.3).*
