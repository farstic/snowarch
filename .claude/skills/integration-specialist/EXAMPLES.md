# Integration Specialist — EXAMPLES

**Version:** 1.0
**Pairs with:** Integration Specialist SKILL.md v1.0
**Purpose:** Three gold-standard task → output pairs that exemplify the Integration Specialist skill in production use.

Each example: input prompt → expected output (the integration architecture specification) → explanation.

---

## Example 1 — Outbound REST with retry, DLQ, and OAuth2 to Azure DevOps

### Input prompt

> Integration Specialist task: design the outbound integration that posts new high-priority incidents (P1, P2) to Azure DevOps as work items.
>
> Volume: ~100 incidents/day at peak.
> Authentication: OAuth2 with Azure AD.
> Retry on transient failures.
> PII redaction in description field (customer names and emails).
> Scope: x_acme_itsm.
> Pre-approved custom objects: the `x_acme_itsm` scope (the client's ITSM app; the baseline weighed was the global scope) and the dead-letter table `x_acme_itsm_ado_dlq`, approved over the flow error handler and the Outbound HTTP Logs, which record a failure but cannot replay it.
> Network: ServiceNow can reach Azure DevOps directly (no MID Server required).

### Expected output

#### Capability statement
This integration takes a `state=Resolved` event on a P1/P2 incident and produces a corresponding work item in Azure DevOps within 30 seconds (p95), with retry on transient failures and DLQ replay on permanent failures.

#### Direction
**Outbound** (ServiceNow → Azure DevOps).

#### Trigger
- **Source-side trigger:** record-triggered flow on `incident` (Flow Designer Specialist owns the flow). Trigger condition: `state changes to 6 (Resolved)` AND `priority IN (1, 2)`.
- **Async** — the flow runs in background; user save is not blocked.
- This integration spec covers what the flow's spoke Action calls; the flow itself is out of scope here.

#### Payload
- **Format:** JSON.
- **Content type:** set by the spoke's Create Work Item action, not by this design.
- **Size cap:** 16KB (Azure DevOps work item field limits).
- **Schema reference:** the spoke's Create Work Item action, work item type `Bug` (per spec — confirm in OQ-DS-1). The spoke was built for Azure DevOps Boards REST API version 4.1 and TFS 2018 Update 3 and may be compatible with later versions — confirm against the organisation's Azure DevOps *(citation: `markdown/integrate-applications/integration-hub/azure-devops-spoke.md`)*.
- **Field map:**
  | ServiceNow field | ADO field | Notes |
  |---|---|---|
  | `incident.number` | `System.Title` (prefix `[SN-]`) | Identifier prefix for searchability |
  | `incident.short_description` | `System.Title` (continuation) | |
  | `incident.description` | `System.Description` | **PII redaction applied — see Security** |
  | `incident.priority` | `Microsoft.VSTS.Common.Priority` | 1→1, 2→2 |
  | `incident.assigned_to.email` | `System.AssignedTo` | If unmapped in ADO, leave blank (no failure) |
  | `incident.sys_id` | `Custom.SnSysId` | Custom field for round-trip correlation |
  | `incident.sys_created_on` | `System.CreatedDate` | UTC ISO8601 |

#### Authentication
- **Mechanism:** OAuth2 (Authorization Code + refresh token) — Azure AD app registration. ADO does not support pure Client Credentials for personal/team scope; the app registration uses delegated permissions on a service account.
- **Connection & Credential Alias:** the spoke's default alias, configured on each instance (dev, test, uat, prod) with that environment's app registration — no custom alias *(citation: `markdown/integrate-applications/integration-hub/azure-devops-spoke.md`)*.
- **Token caching:** ServiceNow's OAuth2 plugin handles token cache and refresh.
- **Secret rotation policy:** quarterly, coordinated with Azure AD app credential rotation. Documented in operator runbook (handoff to Operational Documentation).
- **Fallback on auth failure:** integration disabled, alert sent to `integration-ops@acme`. Records continue queuing in the flow's DLQ for replay after credential is restored.

#### Network topology
- **Direct egress** — no MID Server required. Azure DevOps endpoints are public; ServiceNow instance has direct outbound HTTPS access.
- **Endpoint:** Azure DevOps Boards through the spoke's Create Work Item action; the connection URL is on the spoke's connection record on each instance, and the project stays parameterised per environment via the system property `x_acme_itsm.ado_project`.

#### Error handling
- **Retry policy:** an IntegrationHub retry policy set as the spoke alias's Default Retry Policy, so it applies to every action that uses the alias: Retry Strategy Exponential Backoff (the multiplier is 2), Interval 1 second, Count 3 — retries after 1, 2 and 4 seconds — with the retryable errors below as its conditions. The platform policy has no jitter, and Honor "Retry-After" Header is an alternative strategy, not an addition *(citation: `markdown/build-workflows/workflow-studio/retry-policy.md`)*.
- **Retryable errors:**
  - Network timeout
  - HTTP 5xx (server error)
  - HTTP 429 (rate limited) — retried on the same backoff; the `Retry-After` value is not read under this strategy
  - HTTP 408 (request timeout)
- **Non-retryable errors → DLQ immediately:**
  - HTTP 4xx (except 408, 429)
  - Auth failure (401/403)
  - Schema validation failure (422)
- **DLQ:**
  - Table: `x_acme_itsm_ado_dlq` (pre-approved in the dispatch envelope; fields: incident_sys_id, payload_redacted, error_class, error_detail, attempt_count, first_attempted_at, last_attempted_at, replay_status).
  - Replay UI Action gated by role `x_acme_itsm.dlq_replay`.
  - Manual replay; auto-replay deferred to v2.
- **Alerting:** DLQ insertion triggers email to `integration-ops@acme` if DLQ depth exceeds 10 entries within an hour (Performance Analytics indicator + alert rule).

#### Idempotency posture
- **Idempotency key:** `incident.sys_id` mapped to ADO `Custom.SnSysId`.
- **Dedup mechanism:** before the create, the spoke's **Look up Queries by Wiql** action queries for `Custom.SnSysId = '<sys_id>'`. If a work item already exists, skip the create. Either way the work item id goes to the incident's baseline `correlation_id` field, where an integration maps an external id — no link table *(citations: `markdown/integrate-applications/integration-hub/azure-devops-spoke.md`, `markdown/integrate-applications/system-import-sets/r_StandardImportSetTables.md`)*.
- **Counterparty support:** Azure DevOps does not natively support the `Idempotency-Key` header on this endpoint, so dedup is enforced via the ServiceNow-side check. Documented as a limitation.

#### Rate limiting
- **Outbound (own):** 30 TPS sustained, 60 TPS burst. Volume estimate of 100/day is well below; sized for spike days (major incident creating multiple linked tickets).
- **Counterparty:** Azure DevOps rate limit is 30 TSTUs (tracked client units) per 5 minutes per user. The flow's serial execution model stays well under this; documented for ops awareness.

#### Performance
- **TPS target:** 30 sustained (well above 100/day requirement).
- **Latency target:** p50 <500ms, p95 <2s, p99 <5s per Create Work Item action run, retries included — measured from the action's duration, which the flow execution details record for every action run *(citation: `markdown/build-workflows/workflow-studio/flow-execution-details.md`)*.
- **Concurrency model:** Async fire-and-forget from the calling flow's perspective; the calling flow runs in the background (its trigger's *Run flow in background*, the default), which handles the wait *(citation: `markdown/build-workflows/workflow-studio/flow-triggers.md`)*.

#### Security
- **TLS:** 1.2+ enforced (Azure DevOps requires this anyway).
- **Cipher constraints:** none beyond default.
- **IP allowlist:** N/A (outbound only; ADO endpoints are public).
- **Payload encryption at rest:** standard ServiceNow encrypted attachments and field encryption rules apply where used.
- **PII redaction in `description` field:** before payload assembly, the field is run through `x_acme_itsm.PIIRedactor.redact(text)` (Developer-owned Script Include — handoff). Redacts:
  - Email addresses (regex; replace with `<EMAIL>`)
  - Phone numbers (configurable patterns; replace with `<PHONE>`)
  - Names from the `incident.caller_id.name` (literal substring replace; replace with `<CUSTOMER>`)
  - Configurable extra patterns via system property `x_acme_itsm.ado_pii_patterns`.
- **Logs:** never log the un-redacted payload. Log only: incident sys_id, ADO work item id (post-success), error class, run ID. The retry attempts themselves are in System Logs > Outbound HTTP Requests *(citation: `markdown/build-workflows/workflow-studio/retry-policy.md`)*.

#### Observability
- **Logged fields per call** — a Log action in the calling flow writes them to `sys_flow_log`: run_id, incident_sys_id, error_class (if any), result (success/dlq) — retries happen inside the action, so the flow sees only the final result. Outbound web services logging also tracks every outbound REST request, at the basic level by default — elevated or all where it is configured *(citations: `markdown/build-workflows/workflow-studio/log-message-flow-designer.md`, `markdown/api-reference/web-services/outbound-request-logging.md`, `markdown/api-reference/web-services/outbound-logging-properties.md`)*.
- **Metrics (Performance Analytics indicators):**
  - `ado_outbound_success_rate` (%)
  - `ado_outbound_p95_latency_ms` (from the action durations in the flow execution details)
  - `ado_outbound_dlq_depth`
  - `ado_outbound_daily_volume`
- **Run ID:** a UUID generated at flow trigger time (`run_id`) and written with every Log action entry for the run. The corpus documents no header input for the spoke's actions, so the ID stays on the ServiceNow side and is not sent to Azure DevOps *(citation: `markdown/integrate-applications/integration-hub/azure-devops-spoke.md`)*.
- **Alerts:**
  - DLQ depth >10/hour → email ops.
  - Auth failure (any single 401) → email ops immediately.
  - Daily success rate <95% → email ops.

#### Spoke vs raw REST decision
- **Decision:** **use the baseline Microsoft Azure DevOps Boards Spoke.** This is the third request from different teams to call Azure DevOps, and HRSD has flagged a likely 4th use case in their roadmap (HR ticket → ADO work item for tooling team). The baseline spoke already ships the actions all four need — Create Work Item, Update Work Item, Look up Queries by Wiql — so they reuse it instead of a custom spoke. It requires an Integration Hub subscription *(citation: `markdown/integrate-applications/integration-hub/azure-devops-spoke.md`)*.
- **Spoke actions used:**
  - `Create Work Item` (this spec)
  - `Update Work Item` (out of scope here; planned)
  - `Look up Queries by Wiql` (used by this spec for the idempotency check)
- **Spoke version:** the installed baseline version; consumer flows are retested when it is upgraded.

#### Test approach (handoff to ATF Author)
- Happy path: P1 incident resolved → work item created → its id written to `correlation_id`.
- Retry path: simulate transient 5xx on first attempt → succeeds on second → single work item created.
- Auth failure: simulated 401 → DLQ entry created, no work item, alert email sent.
- Idempotency: duplicate trigger for same incident → second call finds the work item through the Wiql lookup, no second work item.
- Schema rejection: simulated 422 from ADO → DLQ entry, no retry.
- Rate-limit: simulated 429 → retried on the exponential backoff; the attempts show in System Logs > Outbound HTTP Requests.
- DLQ replay: replay UI Action processes a DLQ entry → work item created on success, DLQ row marked replayed.
- PII redaction: incident with email and phone in description → ADO work item description has redactions, ServiceNow log shows nothing.

#### Operational runbook items (handoff to Operational Documentation)
- Credential rotation procedure (quarterly).
- DLQ replay procedure (manual, role-gated).
- Integration disable procedure (set `x_acme_itsm.ado_integration_active = false` → flow short-circuits at trigger).
- Log access procedure (where to find a run's entries by run ID).
- ADO API deprecation tracking (subscribe to ADO release notes).

#### Open questions
- **OQ-DS-1:** Confirm work item type — spec says "work item"; assumption is `Bug`. Is it `Bug`, `Task`, `Issue`, or organisation-specific? Affects the work item type the Create Work Item action is given.
- **OQ-DS-2:** ADO project per environment — is the same ADO project used for ServiceNow dev/test/uat/prod, or are there parallel ADO projects? Affects parameterisation strategy.
- **OQ-DS-3:** Re-route on Resolved-to-Closed transition — should subsequent state updates push to ADO too? Spec only covers initial resolve.
- **OQ-DS-4:** PII redaction scope — confirm the field list and patterns with Security & GRC.

#### Handoffs proposed
- **Flow Designer Specialist** — design the consuming flow on incident resolve (trigger, idempotency guard, error path to DLQ, alert wiring).
- **Developer** — implement `x_acme_itsm.PIIRedactor.redact(text)` Script Include per redaction spec; the spoke's actions are baseline, so there are no spoke scripts to write.
- **Code Reviewer** (post-build §6.2) — fires after Developer returns scripts.
- **Security & GRC** — review PII redaction scope (OQ-DS-4) and confirm OAuth2 scope on the Azure AD app registration is minimal.
- **DevOps / Release Manager** — the spoke is a baseline install; the dead-letter table ships in the `x_acme_itsm` app, and the spoke's alias is configured on each instance.
- **Licensing & Entitlement** — confirm the Integration Hub subscription the spoke requires.
- **Operational Documentation** — author runbook items above.
- **ATF Author** — test suite per test approach above.

### Why this is the gold standard

Every section of the SKILL output checklist is filled with substance, not boilerplate. The auth choice (Authorization Code + refresh token, not Client Credentials) is justified against ADO's specific limitation; the idempotency mechanism explicitly accounts for ADO's lack of native `Idempotency-Key` support and compensates with a server-side dedup check; the retry policy distinguishes retryable from non-retryable error classes by HTTP status code with a clear DLQ destination.

The spoke decision is the most important architectural call. A junior designer would have built a one-off REST Message because the immediate spec only mentions one use case, or a custom spoke because three teams are asking. The senior designer checks the baseline first, finds the Microsoft Azure DevOps Boards Spoke, and reuses it for all four use cases. The PII redaction handoff to Developer is correctly scoped: Integration Specialist names the contract (`PIIRedactor.redact(text)` with documented patterns) and lets Developer implement. The eight handoffs proposed are all genuinely needed and none are optional given the production stakes.

---

## Example 2 — Inbound Scripted REST API with HMAC verification and rate limiting

### Input prompt

> Integration Specialist task: design an inbound API that allows an external monitoring tool to create incidents in ServiceNow.
>
> Volume: up to 1000 events/hour, deduplicated on a `correlation_id` provided by the monitoring tool.
> Authentication: OAuth2 client credentials.
> Payload: JSON.
> Must validate and reject malformed payloads.
> Scope: x_acme_monitoring.
> Pre-approved custom objects: the `x_acme_monitoring` scope (the client's monitoring app; the baseline weighed was the global scope). No custom tables.

### Expected output

#### Capability statement
This integration takes inbound monitoring events from an external tool and produces deduplicated incidents in ServiceNow within 2 seconds (p95), with payload validation and idempotency by `correlation_id`.

#### Direction
**Inbound** (external monitoring tool → ServiceNow).

#### Trigger
- **REST endpoint:** `POST /api/x_acme_monitoring/v1/events`
- Synchronous: caller waits for a structured response (sys_id on success, error envelope on failure).

#### Payload
- **Format:** JSON.
- **Content type:** `application/json` required; reject with 415 otherwise.
- **Size cap:** 32KB. Larger payloads → 413.
- **Schema reference:** `x_acme_monitoring/schemas/event_v1.schema.json` (committed to scoped app, JSON Schema draft-07).
- **Required fields:**
  | Field | Type | Notes |
  |---|---|---|
  | `correlation_id` | string (UUID) | Idempotency key |
  | `severity` | string enum (`critical`, `major`, `minor`, `info`) | Maps to incident priority |
  | `source_system` | string | Free text, ≤256 chars |
  | `summary` | string | ≤512 chars; maps to `short_description` |
  | `detail` | string | ≤8KB; maps to `description` |
  | `affected_ci` | string (CI sys_id) | Optional; resolved against `cmdb_ci` |
  | `event_time` | string (ISO 8601 UTC) | When the event occurred |
- **Severity mapping:**
  - `critical` → priority 1 (Critical)
  - `major` → priority 2 (High)
  - `minor` → priority 3 (Moderate)
  - `info` → priority 4 (Low)

#### Authentication
- **Mechanism:** OAuth2 Client Credentials (RFC 6749 §4.4).
- **Token endpoint:** ServiceNow's `/oauth_token.do` — caller registered as an OAuth2 application user with scope-restricted role.
- **Role required:** `x_acme_monitoring.api_inbound`. This role grants:
  - Execute on the Scripted REST API endpoint
  - Insert on `incident` via the API processor's elevated context (NOT directly — the role does NOT grant table-level insert; the API operation does the insert via `GlideRecord` with role context)
  - Read on `cmdb_ci` (for CI resolution)
- **Token lifetime:** 30 minutes; caller refreshes.
- **Connection & Credential Alias:** N/A on the inbound side; counterparty manages their client credential. ServiceNow stores the OAuth2 app registration only.

#### Network topology
- **Direct inbound** — no MID Server (inbound is direct to ServiceNow).
- **IP allowlist:** required. Counterparty publishes egress IP ranges; allowlist enforced at the Scripted REST API entry via a pre-process script that checks `request.getHeader('x-forwarded-for')` against a system property `x_acme_monitoring.allowed_source_ips` (CIDR list). Reject 403 on mismatch.

#### Error handling
- **Validation flow at the entry point:**
  1. Auth (OAuth2 token validation — handled by platform).
  2. Role check: `gs.hasRole('x_acme_monitoring.api_inbound')`. Fail → 403.
  3. IP allowlist check. Fail → 403.
  4. Content-Type check. Fail → 415.
  5. Body size check. Fail → 413.
  6. JSON parse. Fail → 400 with `{error: 'invalid_json', detail: <parse error>}`.
  7. Schema validation against `event_v1.schema.json`. Fail → 422 with structured field-level error list.
  8. Idempotency check (see below). Hit → return 200 with the existing incident's sys_id.
  9. CI resolution (if `affected_ci` supplied). Unresolvable → 200 with warning (`partial`), incident still created without CI link.
  10. Incident insert. Fail → 500 with correlation_id in error response (no internal detail leaked).
- **Error envelope** (consistent across all 4xx/5xx):
  ```json
  {
    "error": "<error_code>",
    "message": "<human-readable>",
    "correlation_id": "<echoed if provided, else generated>",
    "detail": <optional structured detail>
  }
  ```
- **Server-side errors logged** with full stack trace; client never sees the trace.

#### Idempotency posture
- **Idempotency key:** `correlation_id` field in the payload (required).
- **Dedup mechanism:** the incident's baseline `correlation_id` field holds the payload's key — the field an integration maps an external id to — so the key and the incident are written in one insert; no ledger table *(citation: `markdown/integrate-applications/system-import-sets/r_StandardImportSetTables.md`)*.
- **Lookup before insert:** query `incident` on `correlation_id`; if hit, return the existing `incident_sys_id` with HTTP 200 and `idempotent_replay: true` in the response body. No new incident created.
- **One write:** the key is set in the same insert as the incident, so no second write can fail and leave a retry to duplicate it. Two identical requests arriving at the same moment can both miss the lookup — the same window a separate ledger had, since it was written after the incident — accepted tradeoff, documented.

#### Rate limiting
- **Inbound rate limit:** 1500 req/min per OAuth2 client. Headroom over the 1000 events/hour expected (which is 16.7/min). Rate limit configured via `x_acme_monitoring.rate_limit_rpm` system property.
- **On exceed:** 429 with `Retry-After: 60` header.
- **Implementation:** ServiceNow's built-in inbound rate limiting plus a custom token-bucket if more granular control is needed (deferred to v2).
- **Per-endpoint rate vs per-client:** per-client (by OAuth2 token's `aud` claim).

#### Performance
- **TPS target:** sustained 25 TPS (matches 1500/min). Burst 50 TPS for 30s.
- **Latency target:** p50 <500ms, p95 <2s, p99 <5s.
- **Concurrency model:** synchronous response. The caller is a monitoring system that needs the sys_id back to log against the alert.

#### Security
- **TLS:** 1.2+ enforced.
- **Auth:** OAuth2 (per above). Tokens are short-lived; client_secret rotates per platform policy.
- **IP allowlist:** mandatory (per above).
- **Payload validation:** JSON Schema (per above). No SQL/XSS sanitisation needed at the API layer (incidents stored verbatim with platform-level XSS protection on form rendering).
- **Logs:** every request logs correlation_id, client_id, http_status, response_time_ms. Payload logged ONLY if `x_acme_monitoring.api_debug_logging = true` AND `detail` field is truncated to first 256 chars (no full payload in logs — `detail` may contain sensitive system info).
- **PII handling:** the `summary` and `detail` fields may contain user/system identifiers. Treated as non-PII per spec but flagged for Security & GRC review.

#### Observability
- **Logged per request:** each inbound request is in the Transaction logs (`syslog_transaction`), whose Response time field holds its round-trip time in milliseconds, and the API script writes correlation_id, client_id, http_status, validation_errors (if any), incident_sys_id (on success) and idempotent_replay (boolean) to the system log, which tracks script logs *(citations: `markdown/api-reference/rest-api-explorer/c_RESTAPI.md`, `markdown/platform-security/r_TransactionLogs.md`, `markdown/platform-security/r_SystemLogs.md`)*.
- **Metrics:**
  - `monitoring_api_request_rate` (per minute)
  - `monitoring_api_success_rate` (%)
  - `monitoring_api_p95_latency_ms`
  - `monitoring_api_idempotent_hit_rate` (%) — high values indicate counterparty over-retrying
  - `monitoring_api_4xx_rate` and `_5xx_rate`
- **Correlation ID:** echoed back in response; logged on both sides.
- **Alerts:** 5xx rate >1% → email ops; auth failure rate >5% → security alert; idempotent hit rate >50% → counterparty likely misconfigured.

#### Spoke vs raw REST decision
- **Decision:** **raw Scripted REST API** in scope `x_acme_monitoring`. Inbound APIs are not spokes (spokes are outbound). The Scripted REST API is the canonical inbound primitive.
- **Path versioning:** `/v1/` in the URL. New incompatible schemas → `/v2/` deployed alongside.

#### Test approach (handoff to ATF Author)
- Happy path: valid payload → 200 with sys_id and incident created.
- Auth failure: missing/invalid token → 401.
- Role missing: valid token but wrong role → 403.
- IP not allowlisted: → 403.
- Wrong content type: → 415.
- Oversize body: 33KB body → 413.
- Malformed JSON: → 400.
- Schema validation: missing required field → 422 with field-level error.
- Severity enum violation: → 422.
- Idempotent replay: same correlation_id twice → second returns 200 with same sys_id and `idempotent_replay: true`, no second incident.
- CI unresolvable: invalid `affected_ci` → 200 with `partial` warning, incident created without CI link.
- Rate limit: 1501st request in a minute → 429 with `Retry-After: 60`.
- Concurrent duplicate correlation_id: two requests with the same correlation_id at the same moment → both may miss the lookup and create two incidents — the tradeoff the idempotency posture accepts; a repeat sent after the first insert returns the existing incident with `idempotent_replay: true`.

#### Operational runbook items (handoff to Operational Documentation)
- OAuth2 client provisioning procedure (creating the app registration, role assignment, scope).
- IP allowlist update procedure (when counterparty changes egress).
- Schema versioning and migration procedure.
- Rate limit tuning procedure.
- Counterparty contact for triage.

#### Open questions
- **OQ-DS-1:** Multiple monitoring tools or one? Spec says "an external monitoring tool" — singular. If multiple, need per-tool client_id and per-tool rate limit tier.
- **OQ-DS-2:** Auto-close — should resolved alerts in the monitoring tool auto-close the corresponding incident? Out of scope for this spec; would be a separate `PUT /events/{correlation_id}/close` endpoint.
- **OQ-DS-3:** Severity-3 (`minor`) and severity-4 (`info`) — do these create incidents or Event Management events (Event [`em_event`] *(citation: `markdown/it-operations-management/event-management/exploring-event-management.md`)*)? At the volume cap (1000/hr), `info`-level mass creation could flood the incident queue. Confirm with ITSM Specialist.
- **OQ-DS-4:** Conflict between platform's built-in inbound rate limiting and per-endpoint requirement — confirm during build that 1500 rpm is achievable per-endpoint without instance-wide knock-on.

#### Handoffs proposed
- **Developer** — implement the Scripted REST API operation script (validation chain, idempotency check, incident insert) per spec.
- **Code Reviewer** (post-build §6.2) — fires after Developer returns the script.
- **Security & GRC** — review the role design (`x_acme_monitoring.api_inbound`), confirm payload field sensitivity classification, review IP allowlist mechanism.
- **CMDB & CSDM** — confirm `affected_ci` resolution behaviour against the CI Class Manager rules; specifically whether `cmdb_ci` lookup should respect any class restrictions.
- **ITSM Specialist** — confirm severity-to-priority mapping and address OQ-DS-3.
- **Performance & Scale** — validate the `correlation_id` lookup and its index on `incident` at sustained 25 TPS.
- **Operational Documentation** — runbook items above.
- **ATF Author** — test suite per test approach above.

### Why this is the gold standard

Inbound APIs are where most production integration defects happen, and this spec demonstrates why discipline matters. The validation chain (auth → role → IP → content-type → size → parse → schema → idempotency → CI resolution → insert) is ordered deliberately: cheap checks first, expensive checks last; security checks before parsing (parse errors should never expose internal detail to unauthenticated callers). The error envelope is structured and consistent, with correlation_id echoed back so the counterparty can debug end-to-end without ServiceNow log access.

The idempotency posture is honest about its tradeoff: the key lives on the incident itself, so no second write can fall out of step, and the spec states the one failure mode left (two identical requests at the same moment) explicitly rather than pretending the design is transactional. That's senior-engineer behaviour — making the tradeoff visible rather than hiding it. The five proposed handoffs cover Developer (the script), Security & GRC (role design and PII), CMDB & CSDM (CI resolution rules), ITSM Specialist (severity mapping and OQ-DS-3 about info-level flooding), and Performance & Scale (the `correlation_id` lookup at 25 TPS) — none requested by the user, all genuinely required for a production-grade build.

---

## Example 3 — IntegrationHub Spoke design as a versioned scoped app

### Input prompt

> Integration Specialist task: design a new IntegrationHub spoke for our internal ticketing system "Atlas".
>
> Spoke should expose: lookup ticket, create ticket, update ticket, close ticket.
> Auth: API key with HMAC request signing.
> Spoke must be scoped, versioned, and reusable across multiple consuming flows (incident, change, problem).
> Atlas API base URL is environment-specific.
> Pre-approved custom objects: the `x_acme_atlas_spoke` scope and its alias `x_acme_atlas_spoke.atlas_connection` — approved over a REST step in each consuming flow, because no baseline spoke exists for an internal system. No custom tables.

### Expected output

#### Capability statement
This spoke provides a versioned, reusable IntegrationHub abstraction over the Atlas ticketing system's REST API, exposing four operations to consuming flows with consistent auth, retry, idempotency, and observability behaviour.

#### Direction
**Outbound** — spoke is consumed by ServiceNow flows calling out to Atlas.

#### Trigger
N/A at the spoke level — spokes are libraries. Consumers (flows) trigger.

#### Payload
- **Format:** JSON throughout.
- **Per-operation schemas** (referenced into the spoke's schema directory `x_acme_atlas_spoke/schemas/`):
  - `lookup_request.schema.json`
  - `lookup_response.schema.json`
  - `create_request.schema.json`
  - `create_response.schema.json`
  - `update_request.schema.json`
  - `update_response.schema.json`
  - `close_request.schema.json`
  - `close_response.schema.json`
- Schema validation enforced at the Action input/output boundary so consumer flows never see raw API errors when payloads are malformed at the consumer side.

#### Authentication
- **Mechanism:** API key + HMAC-SHA256 request signing.
- **Key material:** `api_key` (sent as `X-Atlas-Key` header) + `signing_secret` (used to sign each request, sent as `X-Atlas-Signature: sha256=<hex>` header). Per Atlas docs, signature is over `<HTTP_METHOD>\n<PATH>\n<TIMESTAMP>\n<BODY_SHA256>`.
- **Connection & Credential Alias:** `x_acme_atlas_spoke.atlas_connection` — one alias per environment. Stores `base_url`, `api_key`, `signing_secret`. Aliases are per-instance, configured at install time.
- **Timestamp header:** `X-Atlas-Timestamp` — Unix epoch seconds. Atlas rejects stale (>5 min skew). Spoke must use server time, not cached.
- **Secret rotation policy:** quarterly. Rotation procedure in operator runbook.

#### Network topology
- **Decision required:** Atlas is internal. If the ServiceNow instance can reach Atlas directly (production network peering or public-with-allowlist), no MID Server. Otherwise MID Server.
- **Recommendation:** MID Server with `REST_OUT` capability, IP affinity matching the network zone where Atlas is reachable.
- **MID Server cluster:** 2 MID Servers in the cluster for HA; affinity rules ensure both can reach Atlas.
- **OQ-DS-1** captures the network topology decision.

#### Error handling
- **Retry policy (default for all four Actions, overrideable per-Action):** exponential backoff with jitter; 4 attempts; base 500ms, multiplier 2x, jitter ±20%; total cap 15s.
- **Retryable errors:**
  - 5xx
  - 429 (honour `Retry-After`)
  - 408
  - Network timeout
  - Connection refused (likely MID Server transient)
- **Non-retryable errors:**
  - 401/403 (auth issue — alert ops, do not silently retry)
  - 400/404/422 (semantic issues — surface to caller as Action error)
- **DLQ:** at the spoke level, Actions return structured error objects rather than writing to a DLQ. DLQ behaviour is the consuming flow's responsibility (different consumers have different DLQ needs — incident DLQ ≠ change DLQ).
- **Action contract:** every Action returns `{success: bool, data: <payload>, http_status, response_time_ms, error: {code, message, retryable, attempt_count}}` — the Action measures the status and the round-trip time itself, so every consuming flow logs the same fields.

#### Idempotency posture
- **Operation-by-operation:**
  | Operation | Idempotent at counterparty? | Spoke behaviour |
  |---|---|---|
  | `Lookup Ticket` | Naturally idempotent (read) | No additional handling. |
  | `Create Ticket` | Atlas accepts `Idempotency-Key` header (per Atlas docs) | Spoke generates a UUID-based key from the action's required `external_correlation_id` input and sends it. |
  | `Update Ticket` | Idempotent if all fields are absolute (PUT semantics, not PATCH-add) | Spoke uses PUT; consumer responsibility to send full state. |
  | `Close Ticket` | Idempotent (closing an already-closed ticket returns 200 with `already_closed: true`) | Pass through. |
- **Consumer-visible:** every Action accepts an optional `idempotency_key` input that overrides the default key generation, for cases where the consumer manages keys explicitly.

#### Rate limiting
- **Counterparty:** Atlas rate limit is 100 req/sec per API key. Spoke does not throttle internally; relies on flow-level coordination plus 429 retry behaviour.
- **Own:** N/A — spokes don't impose internal rate limits; consumers self-coordinate.

#### Performance
- **Per-call latency target (Atlas-side):** p50 <300ms, p95 <1s.
- **Concurrency:** Actions are stateless; concurrent invocations safe.

#### Security
- **TLS:** 1.2+ enforced (Atlas endpoints).
- **HMAC verification:** outbound — spoke signs every request. Inbound webhooks from Atlas (if added in v2) would also verify HMAC.
- **Logs:** the spoke writes no log of its own; each consuming flow's Log action records the action name, http_status, response_time_ms, error code and attempt_count the Action returns. Request and response bodies are never logged — they may contain sensitive ticket detail. If body inspection is needed, the `x_acme_atlas_spoke.debug_logging` system property (default false) makes the Actions also return the body, truncated to 256 chars and redacted for known sensitive patterns, for the consuming flow to log.

#### Observability
- **Per-call logging:** the consuming flow's Log action writes the action name, correlation_id and the http_status, response_time_ms, attempt_count and error code the Action returns to `sys_flow_log`; outbound web services logging also tracks every outbound REST request, at the basic level by default — no custom log table *(citations: `markdown/build-workflows/workflow-studio/log-message-flow-designer.md`, `markdown/api-reference/web-services/outbound-request-logging.md`, `markdown/api-reference/web-services/outbound-logging-properties.md`)*.
- **Metrics:**
  - `atlas_spoke_success_rate` (per Action)
  - `atlas_spoke_p95_latency` (per Action)
  - `atlas_spoke_retry_rate`
  - `atlas_spoke_4xx_rate` and `_5xx_rate`
- **Correlation ID propagation:** consumer flows pass `correlation_id` to the Action; Action propagates as `X-Correlation-ID`.

#### Spoke vs raw REST decision
- **Decision: spoke.** Reasoning: spec explicitly states reusability across incident, change, and problem flows. Building a spoke amortises auth, retry, idempotency, and observability across all consumers and provides a single point of upgrade when Atlas's API changes.

#### Spoke structure (scoped app `x_acme_atlas_spoke`)

```
x_acme_atlas_spoke/
  Connection & Credential Aliases:
    - atlas_connection (per-environment provisioning)
  REST Messages:
    - atlas_api (single message, parameterised by operation)
    - methods: GET_TICKET, POST_TICKET, PUT_TICKET, POST_CLOSE_TICKET
  Actions (Action Designer):
    - Lookup Ticket
    - Create Ticket
    - Update Ticket
    - Close Ticket
  Script Includes:
    - x_acme_atlas_spoke.AtlasSigner (HMAC signing utility — Developer-owned)
    - x_acme_atlas_spoke.AtlasResponseParser (parsing utility — Developer-owned)
  System Properties:
    - x_acme_atlas_spoke.debug_logging
    - x_acme_atlas_spoke.timestamp_skew_seconds (default 0)
  Logging (no custom table):
    - consuming flows' Log action (sys_flow_log); every outbound request in the outbound web services log
```

#### Versioning
- **Initial release:** `1.0.0`.
- **Semver discipline:**
  - PATCH for bug fixes that don't change Action signatures.
  - MINOR for new Actions or new optional inputs.
  - MAJOR for breaking changes to Action input/output contracts.
- **Consumers pin** the spoke version in their flows. Upgrades are deliberate.

#### Test approach (handoff to ATF Author)
- Per Action: happy path, auth failure, retryable failure → success on retry, non-retryable failure → error returned, malformed counterparty response → schema-validation failure surfaced.
- HMAC signing: verify signature header is correctly computed across a known fixture.
- Idempotency: Create with same `external_correlation_id` twice → same Atlas ticket id returned.
- Per-environment alias: smoke test in dev/test/uat/prod that the alias resolves and credentials work.

#### Operational runbook items (handoff to Operational Documentation)
- Connection Alias provisioning per environment.
- Credential rotation procedure (quarterly).
- Spoke version upgrade procedure (test in dev → uat → prod with consumer flow regression).
- Atlas API deprecation tracking.
- DLQ replay (delegated to consumers; spoke has no DLQ of its own).

#### Open questions
- **OQ-DS-1:** Network topology — direct or MID Server? Depends on whether ServiceNow can reach Atlas's network directly. Confirm with infrastructure.
- **OQ-DS-2:** Webhook return path from Atlas — does Atlas push status updates back to ServiceNow, or is ServiceNow polling? Spec covers four outbound operations only; inbound webhook may be a v2 addition.
- **OQ-DS-3:** Sensitive field detection in logs — what counts as sensitive in an Atlas ticket payload? Need a list from the Atlas team to configure the redaction patterns.
- **OQ-DS-4:** Field mapping between ServiceNow and Atlas — not in this spec; will be defined per consumer flow. Should the spoke provide a mapping helper, or let each flow handle its own mapping? Recommendation: each flow handles its own mapping; spoke stays generic.

#### Handoffs proposed
- **Developer** — implement `AtlasSigner` Script Include (HMAC computation), `AtlasResponseParser` Script Include, and the server scripts inside each Action's steps.
- **Code Reviewer** (post-build §6.2) — fires after Developer returns scripts.
- **Flow Designer Specialist** — design the consumer flows for incident, change, problem (separate engagement; this spec is the spoke).
- **DevOps / Release Manager** — App Repository workflow for the scoped app, including per-env Connection Alias provisioning and version pinning policy.
- **Security & GRC** — review HMAC signing implementation and credential storage.
- **Operational Documentation** — runbook items above.
- **ATF Author** — spoke-level test suite (separate from consumer flow tests).
- **Performance & Scale** — review Atlas's 100 req/sec limit against expected aggregate load from incident + change + problem consumers.

### Why this is the gold standard

The decision to build a spoke (versus three separate REST Messages, one per consumer) is justified explicitly against the reusability requirement, and the spoke's structure mirrors a proper scoped application — Connection Aliases, REST Messages, Actions, Script Includes, system properties, and logging (no custom table) all enumerated. The semver discipline matters: consumers pin a version and upgrade deliberately, which prevents the classic "we upgraded the spoke and broke incident-to-Atlas without anyone noticing" production incident.

The Action contract returned by every Action (`{success, data, http_status, response_time_ms, error: {code, message, retryable, attempt_count}}`) is the reusability superpower: every consuming flow handles spoke errors the same way, regardless of which Action was called, regardless of which underlying Atlas error occurred. Without that contract, every consumer rewrites its own error-handling logic and they drift. The handoffs cover all the right specialists: Developer for the script bodies (the spoke is a *spec* without scripts at this level), DevOps for the App Repository workflow, Security & GRC for the HMAC implementation, and importantly Performance & Scale for the cross-consumer aggregate load — a question only an Integration Specialist with system-wide visibility would think to raise.

---

*End of Integration Specialist EXAMPLES.md v1.0.*
