# Reporting & Analytics Specialist v1.0 — Worked Example

One example. Read alongside `SKILL.md`.

---

## Example — "A CSM leadership dashboard: open cases, SLA attainment trend, and resolution time by tier."

```markdown
# Reporting & Analytics Design — CSM leadership dashboard

## Metrics
- **Open cases** — count of `sn_customerservice_case` where state ∈ {New, Open, Awaiting…}; unit = cases; grain = now.
- **SLA attainment %** — % of `task_sla` met vs breached on cases; unit = %; grain = daily trend over 12 months.
- **Avg resolution time by customer tier** — mean (resolved_at − opened_at) grouped by account tier; unit = hours; grain = monthly trend.

## Report vs PA decision
- **Open cases** → **Report** (operational, real-time, small live result).
- **SLA attainment % (12-mo trend)** → **PA indicator** — it's a *trend over time*; a live report can't show historical movement, and re-querying `task_sla` per load is wasteful. Snapshot daily.
- **Resolution time by tier (monthly trend)** → **PA indicator with a breakdown by tier** — trend + dimension; PA is the right tool, not a custom monthly-rollup table.

## PA model
- Indicator: *SLA attainment* (formula indicator over met/breached counts), daily collection.
- Indicator: *Avg resolution time*, monthly, **breakdown = customer tier** (Platinum/Gold/Silver).
- Targets/thresholds: SLA attainment target 95% (red <90, amber 90–95, green ≥95).
- Widgets: time-series + scorecard with target; breakdown widget for resolution-by-tier.

## Reports
- *Open cases* — source `sn_customerservice_case`, filter on open states (indexed `state`), bar by priority, drill-down to the list.

## Dashboard composition
Audience: CSM leadership. One tab: top row = Open cases + SLA attainment scorecard (with target); second row = SLA trend line + resolution-by-tier breakdown. Consistent date filter.

## Visibility & ACL
Dashboard shared to a CSM-leadership group. Customer-identifying detail stays out of leadership aggregates → confirm with **Security & GRC** that drill-downs don't expose PII beyond the audience's rights.

## §1.1 verdict
**Configuration — PROCEED.** Reports + PA indicators/breakdowns/targets. **No custom rollup table** — the monthly/daily aggregates are PA snapshots, which is exactly what PA is for.

## Handoffs & consults
- **Performance & Scale** — confirm the SLA indicator collection job is efficient on `task_sla` at volume.
- **UI/UX** — if this dashboard lives inside the CSM workspace as a surface.
- **Security & GRC** — drill-down visibility on customer data.

## Open questions
OQ-CN-1. Is PA (and PA Premium for advanced breakdowns) licensed in this engagement?
OQ-CN-2. How far back should the trend history go (drives initial PA data-collection backfill)?
OQ-CN-3. Tier values source — `customer_account` tier field or entitlement level?
```

---

## Reading this example
The specialist makes the **report-vs-PA call per metric** (operational → report; trend/dimension → PA), and explicitly blocks the reflexive **custom monthly-rollup table** in favour of a **PA indicator** (§1.1). Scale and visibility are routed to the right consults.

---

*End of Reporting & Analytics Specialist EXAMPLES.md v1.0.*
