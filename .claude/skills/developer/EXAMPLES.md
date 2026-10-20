# Developer — EXAMPLES

**Version:** 1.0
**Pairs with:** Developer SKILL.md v1.0
**Purpose:** Three gold-standard task → output pairs that exemplify the Developer skill in production use.

Each example: input prompt (verbatim) → expected output (the actual artefact) → explanation (why this is the gold standard).

---

## Example 1 — Script Include with role check and bounded query

### Input prompt

> Developer task: implement a Script Include named SLABreachRiskCalculator per the spec below.
>
> Spec:
> - Class: SLABreachRiskCalculator
> - Scope: x_acme_itsm
> - Method: calculateRisk(incidentSysId)
> - Returns: { risk: 'low' | 'medium' | 'high', score: 0-100, basis: string }
> - Calculation: based on assignment_group historical breach rate from task_sla over the past 90 days, weighted by current priority and elapsed % of SLA.
> - Caller: Business Rule on incident insert/update; also exposed to Service Operations Workspace via GlideAjax.
>
> Volume context: ~3M historical incidents, ~50K active. Must complete in <100ms when called from Business Rule.
> Scoped app prefix: x_acme_itsm
> Roles required: x_acme_itsm.user

### Expected output

*Developer first surfaces routing-time consults: Performance & Scale (3M historical records on Task SLA [`task_sla`] *(citation: `markdown/it-service-management/service-level-management/r_InstalledWithServiceLevelMgmt.md`)*), Security & GRC (Workspace exposure may need ACL review). Then produces:*

```javascript
/**
 * Script Include: SLABreachRiskCalculator
 * Scope: x_acme_itsm
 * Purpose: Score the breach risk of an incident based on assignment-group
 *          historical breach rate, current priority, and elapsed % of SLA.
 * Spec ref: LLD-ITSM-SLA-RISK v1.0 §4.2
 * Author: {{author}}
 * Last updated: {{YYYY-MM-DD}}
 */
'use strict';

var SLABreachRiskCalculator = Class.create();
SLABreachRiskCalculator.prototype = {

    initialize: function() {
        this._historicalRateCache = {};
    },

    /**
     * Calculate breach risk for a given incident.
     * @param {string} incidentSysId - sys_id of the incident
     * @returns {Object} { risk: 'low'|'medium'|'high', score: 0-100, basis: string }
     */
    calculateRisk: function(incidentSysId) {
        // Role check — every public method gates on role; never trust caller context.
        if (!gs.hasRole('x_acme_itsm.user')) {
            throw new Error('SLABreachRiskCalculator.calculateRisk: caller lacks x_acme_itsm.user');
        }

        if (!incidentSysId || typeof incidentSysId !== 'string') {
            throw new Error('SLABreachRiskCalculator.calculateRisk: incidentSysId required');
        }

        var inc = new GlideRecordSecure('incident');
        if (!inc.get(incidentSysId)) {
            return { risk: 'low', score: 0, basis: 'incident not found or not visible' };
        }

        var assignmentGroup = inc.assignment_group.toString();
        var priority = parseInt(inc.priority.toString(), 10);

        // Historical rate via GlideAggregate — JS-side counting on task_sla
        // would materialise hundreds of thousands of rows on this volume.
        var historicalRate = this._loadHistoricalRate(assignmentGroup);

        var elapsedPct = this._loadElapsedPct(incidentSysId);

        var score = Math.min(100, Math.round(
            (historicalRate * 0.5) +
            (this._priorityWeight(priority) * 0.2) +
            (elapsedPct * 0.3)
        ));

        var risk = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
        var basis = 'historicalRate=' + historicalRate.toFixed(1) +
                    '%, priorityWeight=' + this._priorityWeight(priority) +
                    ', elapsedPct=' + elapsedPct.toFixed(1) + '%';

        return { risk: risk, score: score, basis: basis };
    },

    _loadHistoricalRate: function(assignmentGroup) {
        if (this._historicalRateCache[assignmentGroup] !== undefined) {
            return this._historicalRateCache[assignmentGroup];
        }

        var ninetyDaysAgo = new GlideDateTime();
        ninetyDaysAgo.addDaysUTC(-90);

        var totalAgg = new GlideAggregate('task_sla');
        totalAgg.addQuery('task.assignment_group', assignmentGroup);
        totalAgg.addQuery('start_time', '>=', ninetyDaysAgo.getValue());
        totalAgg.addAggregate('COUNT');
        totalAgg.query();
        var total = totalAgg.next() ? parseInt(totalAgg.getAggregate('COUNT'), 10) : 0;

        if (total === 0) {
            this._historicalRateCache[assignmentGroup] = 0;
            return 0;
        }

        var breachedAgg = new GlideAggregate('task_sla');
        breachedAgg.addQuery('task.assignment_group', assignmentGroup);
        breachedAgg.addQuery('start_time', '>=', ninetyDaysAgo.getValue());
        breachedAgg.addQuery('has_breached', true);
        breachedAgg.addAggregate('COUNT');
        breachedAgg.query();
        var breached = breachedAgg.next() ? parseInt(breachedAgg.getAggregate('COUNT'), 10) : 0;

        var rate = (breached / total) * 100;
        this._historicalRateCache[assignmentGroup] = rate;
        return rate;
    },

    _loadElapsedPct: function(incidentSysId) {
        var sla = new GlideRecord('task_sla');
        sla.addQuery('task', incidentSysId);
        sla.addQuery('active', true);
        sla.orderByDesc('sys_created_on');
        sla.setLimit(1);
        sla.query();
        if (!sla.next()) return 0;

        var pct = parseFloat(sla.percentage.toString());
        return isNaN(pct) ? 0 : pct;
    },

    _priorityWeight: function(priority) {
        // P1 = 100, P2 = 75, P3 = 50, P4 = 25, P5 = 10
        var weights = { 1: 100, 2: 75, 3: 50, 4: 25, 5: 10 };
        return weights[priority] || 50;
    },

    type: 'SLABreachRiskCalculator'
};
```

*Closing post-build proposal:*

> *Code artefact produced. Proposing a Code Reviewer pass (style, performance, security, best-practice) before final delivery — proceed?*
> *Additional consults: ATF Author for unit + integration coverage; Performance & Scale to validate the GlideAggregate plan against the 3M-row historical set.*

### Why this is the gold standard

The artefact ticks every Developer SKILL output rule: header comment with spec reference, `'use strict'`, scope-aware naming, role check at the top of the public method, input validation, `GlideRecordSecure` for the user-surfaced read path, `GlideAggregate` instead of JS-side counting against a 3M-row table, bounded `setLimit(1)` for the active SLA lookup, no hardcoded sys_ids, and inline comments that explain *why* (the GlideAggregate choice, the role-check non-trust, the priority-weight policy) rather than *what*.

Equally important is what the Developer did *not* do: did not skip the role check on the basis that the Business Rule caller is "trusted", did not write a JS-side loop counting `task_sla` rows, did not silently return zero on missing inputs (it throws with explicit messages), did not hardcode the 90-day window without rationale. The post-build proposal correctly surfaces the §6.2 Code Reviewer handoff verbatim plus both relevant additional consults — Performance & Scale for the volume context, ATF Author for the release path. Both are surfaced even though the user did not ask, exactly as the SKILL mandates.

---

## Example 2 — Async Business Rule with delegation to Script Include

### Input prompt

> Developer task: implement a Business Rule named "Trigger Major Incident Notification" on the incident table per the spec below.
>
> Spec:
> - When: async
> - Operation: insert OR update
> - Filter condition: priority changesTo 1 (P1)
> - Action: invoke x_acme_itsm.MajorIncidentNotifier.notify(incidentSysId), which fans out Slack, email, and SMS notifications.
> - Idempotency: a single P1 transition must produce exactly one notification cycle, even if the BR runs twice.
>
> Scoped app prefix: x_acme_itsm

### Expected output

*Developer surfaces no §3.1 routing-time consults — straightforward thin BR, no high-volume read paths, no PII expansion. Produces:*

```javascript
/**
 * Business Rule: Trigger Major Incident Notification
 * Table: incident
 * When: async
 * Operation: insert, update
 * Condition (BR config): priority changesTo 1
 * Scope: x_acme_itsm
 * Purpose: Fan out P1 notifications via x_acme_itsm.MajorIncidentNotifier.
 *          Idempotency enforced by the Notifier's notification ledger.
 * Spec ref: LLD-ITSM-MIM v1.2 §3.1
 */
(function executeRule(current, previous /*null when async*/) {
    'use strict';

    // Defensive re-check: BR conditions can be edited by admins independently
    // of the script. Belt-and-braces against config drift.
    if (current.priority.toString() !== '1') return;

    // For async BRs, previous is null — we cannot use previous.priority to
    // detect "changesTo 1". Idempotency is delegated to the Notifier ledger.
    if (new x_acme_itsm.MajorIncidentNotifier().alreadyNotified(current.sys_id.toString())) {
        gs.info('MIM notification skipped (already sent) incident=' + current.number);
        return;
    }

    try {
        new x_acme_itsm.MajorIncidentNotifier().notify(current.sys_id.toString());
    } catch (e) {
        gs.error('MajorIncidentNotifier failure: ' + e.message +
                 ' incident=' + current.number +
                 ' stack=' + (e.stack || 'n/a'));
        // Do not rethrow — async BR rethrow does not abort the original
        // transaction and pollutes scheduler logs.
    }
})(current, previous);
```

### Why this is the gold standard

The Developer correctly identifies this as a *thin trigger* and pushes the actual fan-out logic into a Script Include (`MajorIncidentNotifier`) rather than embedding it inline — this is the SKILL's "patterns to recognise" structure: BRs are triggers, Script Includes hold logic. The async timing avoids blocking the user save; the in-code re-check of `priority === '1'` is the defensive belt-and-braces against admins editing the BR condition without realising the script depends on it. Idempotency is delegated to the Notifier's ledger rather than reinvented in the BR — that's the right separation of concerns.

What the Developer did *not* do is also instructive: no synchronous fan-out inside the BR (would blow latency budgets), no `current.update()` (would trigger recursion), no try/catch swallowing errors (the catch logs with full context and explicitly does not rethrow, with a comment explaining why). The `alreadyNotified` check is named for what it does, not how it works — the ledger is the Notifier's internal concern, not the BR's.

---

## Example 3 — Client Script + GlideAjax bridge (paired artefacts)

### Input prompt

> Developer task: implement a Client Script (onChange of assignment_group on incident form) that calls SLABreachRiskCalculator and displays the risk score in a UI message. Plus the corresponding client_callable Script Include wrapper.
>
> Spec:
> - Form: incident
> - Trigger: onChange of assignment_group
> - Behaviour: query SLA risk for the new assignment_group; display g_form.addInfoMessage with "Predicted SLA breach risk: <risk> (<score>/100, <basis>)"
> - Skip if assignment_group is empty.
> - Server: existing SLABreachRiskCalculator from Example 1, add a client_callable wrapper.
>
> Scoped app prefix: x_acme_itsm

### Expected output

*Developer produces two artefacts.*

**Client Script (incident, onChange of assignment_group):**

```javascript
/**
 * Client Script: SLA Breach Risk on Assignment Group Change
 * Form: incident
 * Type: onChange (assignment_group)
 * Scope: x_acme_itsm
 * Purpose: Surface predicted SLA breach risk to assignee on group change.
 * Spec ref: LLD-ITSM-SLA-RISK v1.0 §5.1
 */
function onChange(control, oldValue, newValue, isLoading, isTemplate) {
    'use strict';

    if (isLoading || isTemplate) return;
    if (!newValue) return;

    // Avoid noise on no-op change — some workflows re-set the same value.
    if (newValue === oldValue) return;

    var ga = new GlideAjax('x_acme_itsm.SLABreachRiskCalculatorAjax');
    ga.addParam('sysparm_name', 'calculateRiskForCurrent');
    ga.addParam('sysparm_incident', g_form.getUniqueValue());
    ga.getXMLAnswer(function(answer) {
        if (!answer) return;
        try {
            var result = JSON.parse(answer);
            if (result && result.risk) {
                g_form.addInfoMessage(
                    'Predicted SLA breach risk: ' + result.risk +
                    ' (' + result.score + '/100, ' + result.basis + ')'
                );
            }
        } catch (e) {
            // Parse failure should not surface to the user.
            jslog('SLA risk Client Script: parse failure - ' + e.message);
        }
    });
}
```

**Script Include — client_callable wrapper:**

```javascript
/**
 * Script Include: SLABreachRiskCalculatorAjax
 * Scope: x_acme_itsm
 * client_callable: true
 * Purpose: GlideAjax wrapper around SLABreachRiskCalculator for client-side use.
 * Note: Wrapper exists separately to keep the client_callable surface explicit
 *       and minimal. The internal calculator never becomes client-reachable.
 * Spec ref: LLD-ITSM-SLA-RISK v1.0 §5.1
 */
'use strict';

var SLABreachRiskCalculatorAjax = Class.create();
SLABreachRiskCalculatorAjax.prototype = Object.extendsObject(global.AbstractAjaxProcessor, {

    calculateRiskForCurrent: function() {
        // client_callable surface — gate explicitly even though the underlying
        // calculator also gates. Defence in depth.
        if (!gs.hasRole('x_acme_itsm.user')) {
            return JSON.stringify({ risk: 'low', score: 0, basis: 'unauthorised' });
        }

        var incidentSysId = this.getParameter('sysparm_incident');
        if (!incidentSysId) {
            return JSON.stringify({ risk: 'low', score: 0, basis: 'missing input' });
        }

        try {
            var result = new x_acme_itsm.SLABreachRiskCalculator().calculateRisk(incidentSysId);
            return JSON.stringify(result);
        } catch (e) {
            // Translate exceptions to safe structured responses — never return
            // a stack trace to the client.
            gs.error('SLABreachRiskCalculatorAjax.calculateRiskForCurrent: ' + e.message);
            return JSON.stringify({ risk: 'low', score: 0, basis: 'error' });
        }
    },

    type: 'SLABreachRiskCalculatorAjax'
});
```

### Why this is the gold standard

The split between `SLABreachRiskCalculator` (server-only, internal) and `SLABreachRiskCalculatorAjax` (client_callable wrapper) is deliberate: the `client_callable=true` surface is exposed to anyone with form access, so keeping it minimal and explicitly role-gated is non-negotiable. Mixing the two in one Script Include would mean every method on the calculator becomes potentially client-reachable. The wrapper validates input, role-gates, and translates exceptions into structured-but-safe responses (never returns an exception trace to the client) — the SKILL's "no exception traces returned to client" rule operationalised.

The Client Script keeps to the SKILL constraints: no DOM manipulation, no client-side GlideRecord, no heavy work — just the GlideAjax call and a UI message. The `if (newValue === oldValue) return;` guard prevents spurious server calls when a workflow re-sets the same value. Parse errors are logged client-side via `jslog` rather than surfaced to the user — production-grade error handling that fails closed silently rather than presenting a parse error to an end user.

---

*End of Developer EXAMPLES.md v1.0.*
