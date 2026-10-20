# Migration Specialist v1.1 — Worked Examples

Three examples covering the common paths: a full design + runbook (Verdict A), a §1.1 halt on a custom legacy table, and a post-load review. Read alongside `SKILL.md`.

---

## Example 1 — Full migration design (Verdict A): ~200k legacy incidents → `incident`

### Input
**Source:** retiring ITSM tool, CSV export. **Target:** baseline `incident` (confirmed by ITSM gateway). **History:** 3 years, open + closed, with work-notes; attachments TBC. **Volume:** ~200k tickets, ~600k notes. **Coalesce key:** legacy ID → `correlation_id`. **Cutover:** weekend freeze. **Sensitivity:** caller PII.

### Output

```markdown
# Migration Design — Legacy ITSM → incident

## Scope
~200k tickets (3y, open+closed) + ~600k work-notes; attachments pending decision. One-time + cutover; no ongoing sync.

## Target mapping
Target **`incident`** (ITSM gateway, Verdict A — no custom table). Field maps:
legacy_id → `correlation_id` (coalesce); title → `short_description`; body → `description`;
reporter_email → `caller_id` (reference; resolve on `sys_user.email`); team → `assignment_group`
(reference; resolve on `sys_user_group.name`); legacy_status → `state` (choice map below); priority →
`impact` + `urgency` (choice map — `priority` is read-only by default and set from them); opened → `opened_at`; resolved → `resolved_at`; resolution_text → `close_notes` *(citations: `markdown/it-service-management/incident-management/def-prio-lookup-rules.md`, `markdown/it-service-management/benchmarks/t_ConfigResIncBenchKPIs-cf.md`)*.
**State choice map:** New→1, WorkInProgress→2, Pending→3(On Hold), Resolved→6, Closed→7, Cancelled→8.
**Assumption:** `resolved_at` exists on the target instance. The corpus says the field "may not exist in some environments" and that the Incident Resolution Fields plugin (`com.snc.incident_resolution_fields`) adds it — verify on the instance before mapping to it.

## Pipeline
CSV **data source** → **import set** + staging → **transform map** to `incident`.
- `onBefore` (→ Developer): normalise date formats; trim; set `ignore=true` for rows with no resolvable caller AND route them to the error report (don't silently insert with a blank caller).
- Field maps + reference coalesce for caller/group; choice map for state.
- `onAfter` (→ Developer): write each ticket's notes to `sys_journal_field` (work_notes) on the inserted incident, oldest-first, preserving original timestamps in the note body.
*(citations: markdown/integrate-applications/system-import-sets/c_ImportSetsKeyConcepts.md, markdown/integrate-applications/system-import-sets/r_MapWithTransformationEventScripts.md)*

## Dependency sequence
1. **Foundation** — ensure `sys_user` (callers) + `sys_user_group` (teams) exist; load/confirm first.
2. **Incidents** — coalesce on `correlation_id`.
3. **Work-notes** — via `onAfter` (parent now exists).
4. **Attachments** — if in scope, after incidents, keyed on `correlation_id`.

## Data quality & cleansing
Profile: % rows with unresolved caller/team, bad dates, statuses with no clean baseline equivalent.
Cleanse in `onBefore`; **every unresolved row goes to an error report**, never a silent insert.

## Reconciliation plan
- Count: source rows vs `incident` where `correlation_id` set (target ≥ inserted; updates on re-run).
- Sample: 50 records field-by-field (incl. state + dates + caller).
- Critical fields: `opened_at`/`resolved_at`, `state`, `caller_id`, `assignment_group` exact.
- Error/skipped report reviewed + signed off before cutover.

## Cutover & rollback runbook
Rehearse on a sub-prod clone (time it). Cutover: freeze legacy → final delta export → load in
sequence → reconcile → business sign-off → hypercare. **Coalesce on `correlation_id`** ⇒ re-runnable.
Backout: delete migrated set by `correlation_id` / import-set marker (rehearsed).

## §1.1 verdict
**Baseline mechanics — PROCEED.** Data source + import set + transform map → baseline `incident`;
coalesce for dedup; staging is the auto-created import table. No custom table, no custom dedup.

## Handoffs & consults
ITSM gateway (target confirmed); **Developer + Code Reviewer** (onBefore/onAfter scripts);
**Performance & Scale** (200k load — scheduled off-hours, batch, monitor transform throughput);
**Security & GRC** (caller PII; clone secret-exclusion); **Operational Documentation** (cutover runbook).

## Open questions
OQ-CN-1. Attachments in scope (size/volume)? OQ-CN-2. Statuses with no clean baseline equivalent — map to which state? OQ-CN-3. Callers with no ServiceNow account — create, or map to a generic "legacy" user?
```

---

## Example 2 — §1.1 halt: proposed custom "legacy tickets" table

### Input
"Load the old tickets into a `u_legacy_ticket` table so we keep them separate from real incidents."

### Output (Verdict C)

```markdown
# Migration Design — legacy tickets

## §1.1 verdict — HALT

OPEN QUESTION — CUSTOM OBJECT PROPOSAL (§1.1 blocking)
1. Baseline mechanic evaluated: load to **`incident`** with `correlation_id` + a `migrated`/source marker;
   reporting can filter migrated vs net-new. (citation: markdown/integrate-applications/system-import-sets/c_ImportSetsKeyConcepts.md)
   Why a custom table falls short: `u_legacy_ticket` is permanent technical debt — it sits outside SLA,
   reporting, search, KCS, and every ITSM feature; agents work two systems; it never gets retired.
2. Custom object proposed (smallest scope): the user's `u_legacy_ticket` table — rejected as unnecessary.
3. Consequences if approved: duplicate ticket model; split reporting; ongoing maintenance; upgrade exposure.
4. Alternatives if rejected (recommended): migrate to `incident` with a `migrated=true` marker; if leadership
   wants closed legacy tickets visually segregated, use a saved filter/view, not a new table.

Recommendation: REJECT the custom table; migrate to `incident` with a marker. No design proceeds until
the Chief Architect decides in a separate message.
```

---

## Example 3 — Post-load review (closed loop)

### Context
The rehearsal load ran. Re-adopt the skill to validate before promoting to the real cutover.

```markdown
# Migration Post-Load Review — Legacy ITSM → incident (rehearsal)
**Verdict: APPROVE-WITH-FIXES**

- **Reconciliation:** source 201,344 vs incident-with-correlation_id 201,180 → **164 short**.
  Cause: 164 rows skipped (unresolved caller) — correctly in the error report. APPROVE (accounted for);
  business to decide create-vs-generic-user for those 164.
- **Target fidelity:** all records in baseline `incident` (no custom table); states mapped correctly;
  callers/groups resolved (0 orphans in the sample). PASS.
- **Idempotency:** re-ran the same file → 0 inserts, 201,180 updates (coalesce working). PASS.
- **Error accounting:** 164 skipped all in the report with reasons. PASS.
- **[fix-before-prod]:** 3 sampled records have `resolved_at` earlier than `opened_at` (legacy data bug) —
  add an `onBefore` guard to flag/repair before the real cutover.

Verdict rationale: clean except the 164 caller decision (business) and the date-order guard (Developer).
Fix both, re-rehearse, then promote to cutover.
```

---

## Reading these examples
- **Example 1** is the full gateway-depth deliverable — mapping (incl. choice/reference resolution), the `onBefore`/`onAfter` script intents, strict dependency sequence, reconciliation, and a rehearsed idempotent cutover.
- **Example 2** halts the cardinal §1.1 reflex (a `u_legacy_*` table) and routes to `incident` + marker.
- **Example 3** shows the **post-load review loop** — reconciliation, target fidelity, idempotency, error accounting — with a precise APPROVE-WITH-FIXES.

---

*End of Migration Specialist EXAMPLES.md v1.1.*
