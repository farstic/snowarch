# Performance & Scale Specialist v1.1 — Worked Examples

Three examples: a routing-time Scale Constraint Note, a post-build Scale Audit (REWORK), and a §1.1 halt on a summary table. Read alongside `SKILL.md`.

---

## Example 1 — Routing-time consult (Scale Constraint Note)

### Context
A Script Include will compute SLA-breach risk per incident from assignment-group history. §3.1 fired (volume + historical aggregation).

```markdown
# Scale Constraint Note — SLA breach-risk from assignment-group history

**Triggers:** >1M rows; historical aggregation; runs in incident context

## Volume model
~3M incident, ~500k task_sla; +15%/yr. Score wanted at incident open (interactive) and nightly.
Access: read-heavy aggregate over a large historical window. Freshness: daily is fine.

## Query constraints
- Group history via a **single `GlideAggregate`** (COUNT + AVG(business_percentage), GROUP BY assignment_group), windowed to the last 90 days — NOT a GlideRecord loop over 3M rows.
- Window on an **indexed** date column; confirm an index on (assignment_group, the date column).
- No leading-wildcard LIKE; bounded result.

## Async/batch constraints
- Do **not** compute the 90-day aggregate synchronously on every incident open. **Precompute** per-group scores on a **nightly scheduled job**; store the result in a PA indicator — never a system property, since each property change flushes the cache on every node *(citation: `markdown/platform-administration/t_AddAPropertyUsingSysPropsList.md`)* — and read the stored value at open. Idempotent re-run.

## Data-lifecycle constraints
- 3M+ incidents: confirm Table Rotation/Archive so the 90-day window query stays fast as history grows.

## Reporting-at-scale constraints
- If this also drives a dashboard, use a **PA indicator**, not a live aggregate per page load.

## §1.1 verdict
**Design/config — PROCEED.** GlideAggregate + scheduled precompute + index + (optional) PA indicator. The "cache" is a PA indicator, not a system property; a keyed store would be a custom table — a §1.1 OPEN QUESTION, not a default.

## Validation
Stats Tools (**Slow Transactions**, **Slow Queries**) on the nightly job (citation: markdown/platform-administration/c_StatsToolsDiagnosticsPlugin.md); load-test the aggregate at full history before go-live.
```

---

## Example 2 — Post-build audit (REWORK)

### Context
Developer returned a Script Include that loops `GlideRecord` over `incident` and increments a JS counter to compute the group breach rate, called **synchronously from a `before` BR on incident insert**.

```markdown
# Scale Audit: SLABreachRiskCalculator
**Verdict: REWORK**

### [QUERY][block] Synchronous full-table loop on insert
**Issue:** `calculate()` runs a GlideRecord loop over ~3M incidents on every insert, in a `before` BR.
**Impact:** Each insert triggers a 3M-row scan inside an interactive transaction — timeouts and
throughput collapse under any real create rate; transaction-quota risk.
**Recommendation:** Replace with a single `GlideAggregate` windowed to 90 days; move to the nightly
precompute; read the cached value in the BR (per the Constraint Note).

### [QUERY][fix-before-prod] Counting via .next()
**Issue:** Breach count derived by iterating and incrementing.
**Recommendation:** `GlideAggregate` COUNT with `has_breached=true`.

### [DATA][consider] No archival assumption
**Issue:** Window query degrades as `incident` grows past 3 years.
**Recommendation:** Confirm Table Rotation/Archive policy.

## Verdict rationale
The synchronous 3M-row scan in an interactive transaction is a hard production blocker — rework to the
precompute pattern before merge; the counting and archival items follow.
```

---

## Example 3 — §1.1 halt: proposed summary table

### Context
"Let's stage nightly per-group breach stats in a new `u_group_breach_stats` table so reads are instant."

```markdown
# Scale Constraint Note — group breach stats cache
## §1.1 verdict — HALT

OPEN QUESTION — CUSTOM OBJECT PROPOSAL (§1.1 blocking)
1. Baseline evaluated: a **PA indicator** (group breach rate, daily collection, breakdown by group) gives
   the pre-aggregated, instant-read, trended value — exactly the need. An indexed aggregate covers ad-hoc.
   (citation: markdown/now-intelligence/performance-analytics/automated-indicators.md)
   Why the custom table falls short: it's a hand-rolled PA — you'd rebuild collection jobs, retention,
   breakdowns, and scoring that PA already provides, and own it through every upgrade.
2. Custom object proposed: `u_group_breach_stats` — rejected as unnecessary.
3. Consequences if approved: a bespoke rollup table + its own jobs to maintain; off-PA, so no native
   trend/score/target features; upgrade exposure.
4. Alternative (recommended): a **PA indicator** with a per-group breakdown; an index for ad-hoc.

Recommendation: REJECT the custom table; use a PA indicator (+ index). No build proceeds until decided.
```

---

## Reading these examples
- **Example 1** quantifies first, then constrains: aggregate-not-loop, precompute-not-synchronous, index, archival, PA-for-reporting.
- **Example 2** blocks the classic killer — a full-table loop in an interactive transaction — and routes the rewrite to Developer/Code Reviewer.
- **Example 3** halts the reflexive summary table in favour of a PA indicator (§1.1).

---

*End of Performance & Scale Specialist EXAMPLES.md v1.1.*
