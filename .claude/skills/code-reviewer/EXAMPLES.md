# Code Reviewer — EXAMPLES

**Version:** 1.0
**Pairs with:** Code Reviewer SKILL.md v1.0
**Purpose:** Three gold-standard task → output pairs that exemplify the Code Reviewer skill in production use.

Each example: input prompt → expected output (review report) → explanation.

---

## Example 1 — APPROVE verdict on a clean Script Include

### Input prompt

*Triggered automatically per taxonomy §6.2 after the Developer sub-agent returned the SLABreachRiskCalculator from Developer Example 1.*

> Code Reviewer pass — review the SLABreachRiskCalculator artefact returned by the Developer sub-agent against the four checklists. Spec: LLD-ITSM-SLA-RISK v1.0 §4.2. Scope: x_acme_itsm. Volume context: ~3M historical incidents, ~50K active.

### Expected output

# Code Review: SLABreachRiskCalculator

**Reviewer:** Code Reviewer skill
**Artefact:** SLABreachRiskCalculator, Script Include, x_acme_itsm
**Spec ref:** LLD-ITSM-SLA-RISK v1.0 §4.2
**Verdict:** APPROVE

## Summary
The artefact meets the spec and follows ServiceNow coding standards. Role check, input validation, GlideRecordSecure on the user-surfaced read, and GlideAggregate for the historical-rate query are all correct. One `consider`-level finding on externalising the priority-weight table to a system property; otherwise the code is production-ready.

## Findings

### [BEST][consider] Priority-weight table is inline
**Location:** `_priorityWeight()` method.
**Issue:** Priority weights `{1:100, 2:75, 3:50, 4:25, 5:10}` are hardcoded.
**Impact:** Domain-stable, but if business decides to retune (e.g., make P1 vs P2 more aggressive), this requires a code change rather than a configuration change.
**Recommendation:** Externalise to a JSON-typed system property `x_acme_itsm.sla_breach.priority_weights` with the current values as default. Cast on read with `JSON.parse(gs.getProperty(...))`.
**Source:** `ServiceNowDocs/markdown/platform-administration/r_AvailableSystemProperties.md`

## Strengths
- Header comment includes spec reference — easy to trace back to LLD §4.2.
- `GlideRecordSecure` correctly used on the user-facing read path; `incident.get(incidentSysId)` honours ACLs.
- `GlideAggregate` for historical breach rate is exactly right at this volume — counting in JS against ~3M rows would be a P1-grade defect.
- Caching of historical rate per assignment_group within the Script Include instance is a sensible micro-optimisation given the BR call pattern.
- Returns structured `{ risk, score, basis }` with explicit basis string — debuggable from production logs alone.
- Errors thrown explicitly with method-name prefix; no silent fails.

## Verdict
**APPROVE** — zero `block`, zero `fix-before-prod`. The single `consider` finding is genuine but non-blocking.

## Handoff
Recommend ATF Author for unit-test coverage (`calculateRisk` happy path, missing incident, unauthorised caller, zero historical data) and Performance & Scale for a 3M-row plan validation against the GlideAggregate query. Both proposals stand whether or not the `consider` finding is actioned.

### Why this is the gold standard

The reviewer correctly issues an APPROVE verdict — there are no production-blockers and no fix-before-prod issues. Many reviewers manufacture severity to appear thorough; this reviewer resists that temptation. The single `consider` finding is genuine (priority weights *are* business-tunable, even if domain-stable enough to defend keeping inline) and is presented as a tradeoff, not a defect.

The strengths section is non-negotiable in a clean review — surfacing what the artefact does well prevents the review from reading as adversarial and helps the Developer (and orchestrator's downstream personas) understand which patterns to reuse. The handoff continues the §3.2 chain: ATF Author and Performance & Scale are both legitimate next steps after a Developer artefact lands, and the reviewer surfaces them so the Chief Architect doesn't have to re-derive them.

---

## Example 2 — REWORK verdict on a flawed Script Include

### Input prompt

> Code Reviewer task: review the code below.
>
> Artefact type: Script Include
> Context: x_acme_csm scope, called from a Business Rule on case insert and from a Client Script via GlideAjax.
> Volume context: ~500K cases/year.
>
> Code:
> ```javascript
> var CaseRouter = Class.create();
> CaseRouter.prototype = {
>     initialize: function() {},
>
>     route: function(caseId) {
>         var c = new GlideRecord('sn_customerservice_case');
>         c.get(caseId);
>         var acct = c.account.toString();
>
>         var cases = new GlideRecord('sn_customerservice_case');
>         cases.addQuery('account', acct);
>         cases.query();
>         var count = 0;
>         while (cases.next()) {
>             count++;
>         }
>
>         var query = "active=true^assignment_group.name=" + c.category;
>         var groups = new GlideRecord('sys_user_group');
>         groups.addEncodedQuery(query);
>         groups.query();
>
>         if (groups.next()) {
>             c.assignment_group = groups.sys_id;
>             c.update();
>         }
>
>         gs.log('routed case ' + caseId + ' for account ' + acct + ' with ' + count + ' cases, customer ' + c.contact.email);
>     },
>
>     type: 'CaseRouter'
> };
> ```

### Expected output

# Code Review: CaseRouter

**Reviewer:** Code Reviewer skill
**Artefact:** CaseRouter, Script Include, x_acme_csm
**Spec ref:** not supplied
**Verdict:** REWORK

## Summary
The artefact has multiple production-blocking defects across security, performance, and best-practice checklists. Most critical: an injection vulnerability via string-concatenated query, no role check on a GlideAjax-reachable endpoint, JS-side counting against a high-volume table, and PII in logs. Rework required before any merge.

## Findings

### [SEC][block] Query injection via string concatenation
**Location:** `route()`, the line constructing `query`.
**Issue:** `var query = "active=true^assignment_group.name=" + c.category;` — `c.category` is concatenated directly into an encoded query string. Although sourced from the case record, `c.category` is user-controlled at case creation and is not sanitised. A category value like `XYZ^ORacc=admin` would manipulate the query semantics.
**Impact:** Attacker-controlled routing — a crafted category could route cases to an arbitrary assignment_group, including privileged ones.
**Recommendation:** Replace with `addQuery`:
```javascript
var groups = new GlideRecord('sys_user_group');
groups.addQuery('active', true);
groups.addQuery('name', c.category.toString());
groups.query();
```
**Source:** `ServiceNowDocs/markdown/platform-security/bp-before-query-business-rules.md`

### [SEC][block] No role check on a client-reachable endpoint
**Location:** Top of `route()`.
**Issue:** Method is reachable via GlideAjax (per the spec context) but performs no `gs.hasRole(...)` check. Any authenticated user can invoke this endpoint and re-route cases.
**Impact:** Authorisation bypass. Any authenticated user can re-assign cases to any group matching a category.
**Recommendation:** Add at the top of the method:
```javascript
if (!gs.hasRole('x_acme_csm.case_router')) {
    throw new Error('CaseRouter.route: caller lacks x_acme_csm.case_router');
}
```
The Script Include must also explicitly mark the client_callable surface — currently absent from the prototype declaration.
**Source:** `ServiceNowDocs/markdown/platform-security/access-control/access-control-rules.md`

### [SEC][block] PII leaked into logs
**Location:** `gs.log` call at end of method.
**Issue:** Log line includes `c.contact.email` — direct PII.
**Impact:** Logs are widely accessible (admins, support, syslog forwarders); writing PII into them is a GDPR / data-residency violation and unnecessarily expands the data-protection scope.
**Recommendation:** Replace with a correlation reference:
```javascript
gs.info('routed case ' + caseId + ' account=' + acct + ' caseCount=' + count);
```
If contact-level traceability is needed, log the contact `sys_id`, not `email`.
**Source:** `ServiceNowDocs/markdown/platform-security/audit-mgmt-console.md`

### [PERF][block] JS-side counting against case volume
**Location:** The `while (cases.next()) { count++; }` block.
**Issue:** Querying every case for the account and counting in JS — at 500K cases/year, an account with 10K cases triggers 10K row materialisations per route call. Plus the count is then used only for logging.
**Impact:** Unbounded latency on the BR path; will cause case-save timeouts for high-volume accounts.
**Recommendation:** Replace with `GlideAggregate`:
```javascript
var agg = new GlideAggregate('sn_customerservice_case');
agg.addQuery('account', acct);
agg.addAggregate('COUNT');
agg.query();
var count = agg.next() ? parseInt(agg.getAggregate('COUNT'), 10) : 0;
```
Better yet — reconsider whether `count` is needed at all; the log line is the only consumer.
**Source:** `ServiceNowDocs/markdown/application-development/business-rules-and-script-includes.md`

### [BEST][block] No `c.get(caseId)` return-value check
**Location:** `route()`, second line.
**Issue:** `c.get(caseId)` return value is discarded. If the case sys_id is invalid or not visible, `c.account.toString()` evaluates against an empty record and returns `''`, then routes against an empty account.
**Impact:** Silent miss-routing on invalid input.
**Recommendation:** Guard explicitly:
```javascript
if (!c.get(caseId)) {
    throw new Error('CaseRouter.route: case not found: ' + caseId);
}
```

### [STYLE][fix-before-prod] No `'use strict';`, no header comment, no input validation
**Location:** Top of artefact and top of `route()`.
**Issue:** Header comment block missing; `'use strict';` absent; `caseId` not validated for type/presence.
**Impact:** Discipline drift; consistent header comments are required across the scoped app per coding standards.
**Recommendation:** Add header block referencing the (missing) spec, add `'use strict';`, and validate `caseId` before use.

### [BEST][fix-before-prod] No try/catch around the update
**Location:** `c.update()` line.
**Issue:** No error handling. If the update fails (ACL denial, validation rule, integration), the failure is silent and the misroute is invisible.
**Impact:** Operational blindness on failure cases.
**Recommendation:** Wrap in try/catch with `gs.error(...)` logging including correlation.

## Strengths
- Class structure is correct (logic in a Script Include, not embedded in a BR).
- Use of `addEncodedQuery` for the group query (notwithstanding the injection issue inside it) is the right shape.
- Clean separation of "find group → assign → update" into distinct steps.

## Verdict
**REWORK** — three `block`-level security defects (query injection, missing role check, PII in logs), one `block`-level performance defect (JS-side counting), one `block`-level correctness defect (missing `get()` check). Cannot ship in any environment.

## Handoff
Propose Developer rework with the seven findings as the rework brief. After rework, this Code Reviewer skill will re-review the revised artefact. Also propose Security & GRC Specialist consult on the role model for `x_acme_csm.case_router` — the role didn't appear in any spec and may not exist yet.

### Why this is the gold standard

The reviewer surfaces seven distinct findings across all four checklists, with severity ratings that genuinely match impact: the injection vulnerability and the missing role check are correctly `block`-rated (production-grade authorisation defects); the JS-side count is `block`-rated because at this volume it's a latency cliff, not a stylistic concern; the missing `'use strict';` is `fix-before-prod` (real but not catastrophic). Each finding has a concrete location, a specific recommendation with code, and a documentation citation where relevant.

The strengths section is honest: even on a REWORK verdict, the class structure is correct and surfacing that prevents the Developer from rewriting parts that work. The handoff explicitly proposes Security & GRC consult because a previously unspecified role (`x_acme_csm.case_router`) emerged as part of the recommended fix — exactly the kind of cross-specialist surfacing the §3.1 routing-time consult logic is designed for. A lesser review would have just listed the bugs; this one identifies a downstream architectural question.

---

## Example 3 — APPROVE-WITH-FIXES verdict on mostly-clean code with one specific issue

### Input prompt

> Code Reviewer task: review the code below.
>
> Artefact type: Business Rule
> Context: x_acme_hrsd scope, on hr_case table, async, on insert.
> Volume context: ~10K HR cases/year.
> Sensitivity context: HR data — PII in scope.
>
> Code:
> ```javascript
> /**
>  * Business Rule: HR Case PII Notification
>  * Table: hr_case
>  * When: async, insert
>  * Scope: x_acme_hrsd
>  * Purpose: Trigger PII-flag notification when a new HR case contains sensitive data.
>  * Spec ref: LLD-HRSD-PII v1.1 §3.4
>  */
> (function executeRule(current, previous) {
>     'use strict';
>
>     try {
>         var notifier = new x_acme_hrsd.PIINotifier();
>         var details = {
>             caseNumber: current.number.toString(),
>             subjectFullName: current.subject_person.name.toString(),
>             subjectEmail: current.subject_person.email.toString(),
>             notes: current.short_description.toString()
>         };
>         notifier.notifyHRBP(details);
>     } catch (e) {
>         gs.error('PIINotifier failure: ' + e.message + ' details=' + JSON.stringify(details));
>     }
> })(current, previous);
> ```

### Expected output

# Code Review: HR Case PII Notification (Business Rule)

**Reviewer:** Code Reviewer skill
**Artefact:** HR Case PII Notification, Business Rule, x_acme_hrsd, hr_case
**Spec ref:** LLD-HRSD-PII v1.1 §3.4
**Verdict:** APPROVE-WITH-FIXES

## Summary
Structurally sound: thin async BR delegating to a Script Include, header comment with spec ref, `'use strict';`, try/catch around the external call. One critical issue in the catch block: PII (full name, email, notes) is logged via `JSON.stringify(details)` on failure, which is the exact data this BR exists to protect. Fix before prod; no architectural rework needed.

## Findings

### [SEC][fix-before-prod] PII leaked into error log on failure
**Location:** `gs.error(...)` line in catch block.
**Issue:** `JSON.stringify(details)` includes `subjectFullName`, `subjectEmail`, and `notes` — all PII. `gs.error` writes to syslog and the system log, both broadly accessible. Ironically, this is the exact failure mode the BR exists to detect-and-notify.
**Impact:** GDPR violation; PII forwarded to SIEM via syslog, increasing the data-protection scope unnecessarily.
**Recommendation:** Log a correlation reference only:
```javascript
gs.error('PIINotifier failure: ' + e.message + ' caseNumber=' + (details && details.caseNumber));
```
If detail is needed for triage, log the case number only: the full details already sit on the HR case, behind its own ACLs. A separate restricted log table would be a new custom table; raise it as an `OPEN QUESTION — CUSTOM OBJECT PROPOSAL` under §1.1, never as a fix.
**Source:** `ServiceNowDocs/markdown/platform-security/audit-mgmt-console.md`

### [BEST][consider] `details` referenced in catch outside its declaring try
**Location:** Catch block.
**Issue:** `details` is declared inside `try`; referencing it inside `catch` works (var-scope hoisting) but is fragile if the throw happens before `details` is assigned (e.g., constructor failure on `new PIINotifier()`).
**Impact:** A throw before `details` assignment yields `JSON.stringify(undefined)` → `"undefined"` in the log, masking the real error context.
**Recommendation:** Either declare `details` outside the try block, or guard the catch:
```javascript
gs.error('... caseNumber=' + (typeof details !== 'undefined' && details ? details.caseNumber : 'unknown'));
```

## Strengths
- Header comment with spec reference (LLD-HRSD-PII §3.4) — clear traceability.
- `'use strict';` present at the top of the IIFE.
- Async BR — correct timing for an external notification.
- Logic delegated to Script Include (`PIINotifier`) — BR is appropriately thin.
- Try/catch around the external call — error path is handled.
- Field references use `.toString()` consistently — no implicit-cast traps.

## Verdict
**APPROVE-WITH-FIXES** — one `fix-before-prod` finding (PII in logs); one `consider` finding (catch-block scope hardening). Acceptable in dev/test as-is; both must be resolved before production.

## Handoff
Recommend Security & GRC Specialist consult to formalise the PII-handling pattern (sanitised logs that carry the case number, never the payload) — this should become a scoped-app-wide standard, not a per-BR fix. After fix, ATF Author for negative-path coverage (notifier failure → correct log content).

### Why this is the gold standard

The reviewer correctly distinguishes between architectural soundness (which this artefact has — async BR, thin trigger, delegated logic, error handling, header with spec ref) and a specific implementation defect (PII leaking on the error path). This is the difference between a `REWORK` verdict — which would require redesigning the artefact — and `APPROVE-WITH-FIXES`, where the structure is correct and the defect is bounded.

The PII-in-log finding is rated `fix-before-prod` rather than `block` because the failure path is rare and the artefact is structurally correct everywhere else; in dev/test the leakage is contained. The `consider` finding on var-scope hoisting is genuine but appropriately weighted — fragile rather than broken. The handoff escalates the underlying pattern (PII-safe logging) to Security & GRC because a one-off fix here would leave the same defect waiting to be repeated in the next BR — exactly the kind of scoped-app-wide standardisation the architecture engine is designed to enable.

---

*End of Code Reviewer EXAMPLES.md v1.0.*
