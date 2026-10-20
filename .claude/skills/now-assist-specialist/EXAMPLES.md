# Now Assist Specialist — Examples

Four gold-standard examples of Now Assist Specialist output, demonstrating the skill's disciplines: explicit confidence routing, human-in-the-loop boundaries, AI Control Tower attestations, the Baseline-first audit pattern with the §1.1 escalation flow, and — in Example 4 — an agentic solution's access rules and build manifest.

---

## Example 1 — Now Assist skill: Incident Chronology Summariser

### Input prompt

> Now Assist Specialist task: design a Now Assist skill that summarises an incident's chronology for an itil agent on form load.
>
> Capability: when an itil agent opens an incident, the skill produces a 2–3 sentence summary of the incident's history (from work notes, comments, state changes, assignment changes) so the agent can ramp up on the case quickly.
>
> Module: ITSM, Service Operations Workspace.
> Volume: ~500K incidents on the instance, ~50K active. ~3,000 agent form-opens per day in steady state.
> Trigger: onLoad client script.
> Sensitivity: standard ITSM (no PII flags beyond ordinary).
> Multilanguage: English only.
> Pre-approved custom objects: none.
> Release family: Australia.

### Expected output

**File suggestion:** `clients/acme/now-assist/incident-chronology-summariser-design.md`

```markdown
# Incident Chronology Summariser — Now Assist Skill Design

| | |
|---|---|
| Capability type | Now Assist skill (generative, summarisation) |
| Version | 0.1 |
| Author | Now Assist Specialist |
| Date | 2026-05-09 |
| Release family | Australia |

## 1. Purpose

Generate a 2–3 sentence summary of an incident's history for the itil agent on form load in Service Operations Workspace. The summary draws from the incident's work notes journal, comments journal, audit log of state transitions, and assignment-group changes. Goal: reduce agent ramp-up time on an unfamiliar case.

## 2. Capability statement

Summarise the incident's chronology in 2–3 sentences so the itil agent can ramp up on the case in under 10 seconds.

## 3. Trigger

onLoad Client Script on the `incident` table in Service Operations Workspace. The script invokes the skill via GlideAjax, renders a placeholder ("Loading summary..."), and updates the panel on response.

## 4. Skill type

Discriminative-summarisation (extracts and summarises existing content; does not generate new facts). Implemented as a generative skill in AI Skill Kit with a strict prompt constraint to avoid factual hallucination.

## 5. Input contract

The skill is invoked with:
- `incident_sys_id` — sys_id of the incident.

The skill retrieves at invocation time:
- `incident.short_description`, `incident.description`, `incident.state` (current).
- Up to 10 most recent `sys_journal_field` entries on the incident (work notes + comments).
- Up to 5 most recent state-change entries from `sys_audit` for the incident.
- Up to 3 most recent assignment changes from `sys_audit` for `incident.assignment_group`.

## 6. Output contract

```json
{
  "summary": "string (2-3 sentences)",
  "confidence": "float 0..1",
  "sources_used": ["work_notes", "comments", "state_audit", "assignment_audit"]
}
```

## 7. Prompt outline

**Role:** "You are a senior ITSM agent's briefing assistant. Your job is to summarise the chronology of an IT incident in 2-3 plain English sentences so a colleague picking up the ticket can ramp up quickly."

**Constraints:**
- Use only the facts in the provided context. Do not invent users, dates, or events.
- If a fact is uncertain, omit it rather than fabricate.
- Use the order: what was reported → what was tried → current state.
- Output a single JSON object matching the output contract.

**Refusal conditions:**
- If the provided context contains zero work notes, comments, or audit entries, return `{"summary": "Insufficient incident history to summarise.", "confidence": 0.0, "sources_used": []}`.
- If the provided context contains content the skill cannot interpret (e.g., embedded attachments, file references), include in summary "additional context attached" rather than hallucinating content.

**Tone:** professional, concise, factual. No emoji, no opinion.

## 8. Confidence and refusal handling

The skill returns a `confidence` score 0..1 reflecting how confident the summarisation is given the source material:

| Confidence | Caller behaviour |
|---|---|
| ≥ 0.7 | Render summary in the SOW panel as primary content. |
| 0.4 ≤ c < 0.7 | Render summary in the SOW panel with a "summary may be incomplete" disclaimer. |
| < 0.4 | Render fallback message: "Summary not available — review the work notes directly." |

Refusal (`confidence = 0.0` with the insufficient-history message) renders the fallback message. No autonomous action — this is a read-only display skill, no human-in-the-loop boundary applies.

## 9. AI Control Tower attestation

- **Capability:** Incident Chronology Summariser.
- **Purpose:** Read-only summarisation of incident chronology for itil agent ramp-up.
- **Data classes accessed:** ITSM incident operational data (short_description, description, state, assignment_group, work_notes, comments, audit log). Subject to baseline `incident` ACLs (the caller is the itil agent, so access is already authorised).
- **Output classes produced:** A short-form summary returned to the calling Client Script for in-form rendering. The skill writes nothing back to the incident; the response is kept in the Generative AI Log (see Audit retention).
- **Refusal conditions:** Insufficient history → returns the insufficient-history fallback. Uninterpretable context → omits rather than fabricates.
- **Audit retention:** Skill invocations are logged in the Generative AI Log [`sys_generative_ai_log`] — prompts and responses, retained 180 days — and each use in the Gen AI Usage Log [`sys_gen_ai_usage_log`] *(citation: `markdown/intelligent-experiences/generative-ai-controller/generative-ai-controller-tables.md`)*.
- **Periodic review cadence:** Quarterly review of accuracy by Acme ITSM Practice Lead, sampling ~50 invocations per quarter.

## 10. Performance budget

- **Latency target:** p95 ≤ 1.5s end-to-end (GlideAjax round-trip + skill inference + JSON serialisation).
- **Throughput:** ~3,000 invocations/day, ~125 peak per hour, ~3 concurrent in steady state. Well within Now LLM Service throughput envelope.
- **Token count:** input ~500-800 tokens (context summary), output ~80-120 tokens. Cost-efficient.
- **Caching:** per-form-session caching in the Client Script (the Client Script holds the result for the duration of the form session). Server-side caching not used — the summary must reflect the current state of the incident.

## 11. Test strategy

| Test ID | Coverage | Approach |
|---|---|---|
| ATF-ICS-01 | Happy path — incident with rich history | ATF + skill invocation, assert summary length 2-3 sentences, confidence ≥ 0.7. |
| ATF-ICS-02 | Insufficient history | ATF on an incident with zero work notes/comments/audits, assert insufficient-history refusal returned. |
| ATF-ICS-03 | High volume of work notes | ATF on an incident with 50+ work notes, assert summary still 2-3 sentences (no expansion). |
| ATF-ICS-04 | Latency budget | Load test in lower env, 50 concurrent calls, assert p95 ≤ 1.5s. |
| ATF-ICS-05 | AICT attestation validation | Verify `sys_generative_ai_log` entries for skill invocations match attestation data-classes; sample 10 invocations for output review. |
| ATF-ICS-06 | Hallucination resistance | Manual review of 20 random outputs against source material; assert zero invented facts. |

## 12. Open decisions

- **OD-NA-01:** Should the summary include the current SLA breach risk band? Currently no — keeps the skill scoped to chronology. Cross-reference to the `SLABreachRiskCalculator` could be added later as a separate widget.
- **OD-NA-02:** Multilanguage scope is English only per input. If multilingual is added later, the prompt and AICT attestation must be revised.

## 13. Baseline-first audit

| Item | Count | Approval status |
|---|---|---|
| Custom tables proposed | 0 | n/a |
| New scoped apps proposed | 0 | n/a |
| Custom Action tools proposed | 0 | n/a |
| Custom Connection Aliases proposed | 0 | n/a |
| Custom AI Skill Kit skill (configuration, not custom object) | 1 (Incident Chronology Summariser) | n/a — configuration within baseline AI Skill Kit framework |
| Custom LLM provider (non-Now LLM Service) | 0 | n/a — uses Now LLM Service |

**Compliance status: COMPLIANT.** The skill itself is configuration in AI Skill Kit using baseline tables (`incident`, `sys_journal_field`, `sys_audit`) and Now LLM Service. No §1.1 escalation required.

---

## Downstream handoff manifest

- **Developer** — implements the `IncidentChronologyClient` Script Include (GlideAjax wrapper) and the `Incident Chronology Summary` Client Script (form-load invoker + renderer).
- **Flow Designer Specialist** — not required (invocation is form-load, not flow-triggered).
- **Integration Specialist** — not required (Now LLM Service, no external LLM).
- **UI/UX Specialist** — consult on the SOW panel rendering for the summary (panel placement, loading state, disclaimer styling for confidence < 0.7).
- **ATF Author** — implements the 6 test cases listed in §11.
- **Performance & Scale Specialist** — does not fire at this volume.
- **Security & GRC Specialist** — does not fire (standard ITSM data, no PII flags beyond baseline ACL coverage).
```

### §6.2 post-build manifest

> *Capability design produced. The Incident Chronology Summariser is a baseline AI Skill Kit skill using Now LLM Service — no custom objects, no orchestration flow, no external integration. Proposing handoffs:*
>
> 1. **Developer** — implements `IncidentChronologyClient` Script Include and `Incident Chronology Summary` Client Script — proceed?
> 2. **UI/UX Specialist consult** — SOW panel rendering pattern (placement, loading state, confidence-based disclaimer styling) — proceed?
> 3. **ATF Author** — six test cases including hallucination resistance — proceed?
>
> **Baseline-first audit: COMPLIANT.** No custom objects.
>
> **No §1.1 escalation.** No Performance & Scale or Security & GRC consults fire.
>
> **No Code Reviewer trigger** — this artefact is a capability design, not code.

### Explanation

This is a clean baseline-first Now Assist design. The skill itself lives in AI Skill Kit (a baseline framework), uses baseline tables (`incident`, `sys_journal_field`, `sys_audit`), and consumes the Now LLM Service. The Baseline-first audit explicitly clarifies that the custom AI Skill Kit skill is **configuration within a baseline framework, not a major custom object under §1.1** — that nuance is important for Now Assist work because almost every Now Assist deliverable involves creating a "custom skill" in the colloquial sense.

The AI Control Tower attestation is non-optional and is the governance layer that makes the capability deployable: it specifies data classes accessed, output classes produced, refusal conditions, and audit retention. Without an AICT attestation, the skill cannot ship.

The confidence routing is explicit: ≥ 0.7 renders as primary content, 0.4–0.7 renders with a disclaimer, < 0.4 renders a fallback. No implicit thresholds. This is the discipline that distinguishes a buildable design from a "ChatGPT but for incidents" hand-wave.

Hallucination resistance gets its own ATF test (ATF-ICS-06) because that's the operational risk for a summarisation skill — the prompt constraint says "use only the facts in the provided context", but the test verifies that across 20 random invocations.

---

## Example 2 — AI Agent: Duplicate Case Detection with §1.1 escalation

### Input prompt

> Now Assist Specialist task: design an AI Agent that detects duplicate CSM cases on case submission. When a customer submits a new case via the portal, the Agent compares it to recent cases for the same account and, if it finds a likely duplicate at high confidence, proposes deflection to the customer. If low confidence, the case proceeds as normal.
>
> Module: CSM.
> Trigger: case-submission webhook from the customer portal.
> Tools: must read `sn_customerservice_case` (baseline), must compare semantic similarity (custom Action? baseline AI Search?), must propose deflection to the customer.
> Volume: ~10K case submissions/month.
> Sensitivity: customer-supplied content; treat as potentially containing PII.
> Multilanguage: English + Mandarin + Japanese.
> Pre-approved custom objects: none.
> Release family: Australia.

### Expected output (with §1.1 escalation)

**File suggestion:** `clients/acme/now-assist/duplicate-case-detection-agent-design.md`

```markdown
# Duplicate Case Detection Agent — AI Agent Design

| | |
|---|---|
| Capability type | AI Agent (one-shot, per case submission) |
| Version | 0.1 (draft — BLOCKED on §1.1 escalation, see §13) |
| Author | Now Assist Specialist |
| Date | 2026-05-09 |
| Release family | Australia |

## 1. Purpose

Compare a newly-submitted customer case against the customer account's recent cases (~30 days) and, on high-confidence match, propose deflection by surfacing the existing case to the customer before the new case is created. Reduces duplicate case volume and improves customer experience.

## 2. Capability statement

Detect likely duplicate case submissions at submission time and propose deflection to the customer when confidence ≥ 0.85.

## 3. Trigger and lifecycle

One-shot per case submission. Invoked by the customer portal submission flow (Flow Designer Specialist designs that flow separately) before the case record is created. Agent terminates after returning a verdict (`duplicate_found` with reference, or `proceed_with_submission`).

## 4. System prompt outline

**Role:** "You are a customer service triage assistant. Your job is to detect when a customer is submitting a case that is functionally identical to a recent case on the same account, and recommend deflection to the existing case."

**Constraints:**
- Use only the data in the provided context (the new case's subject and description, and the candidate matches retrieved from AI Search).
- A "duplicate" means the same underlying issue, even if worded differently. A "related case" or "follow-up" is NOT a duplicate.
- If uncertain whether two cases are duplicates, lean towards NOT-duplicate (false positive is more harmful than false negative — sends the customer back to a case that isn't actually theirs).
- Output a single JSON object matching the output contract.

**Refusal conditions:**
- If candidate matches are empty (no recent cases on the account), return `{"verdict": "proceed_with_submission", "confidence": 1.0}`.
- If the new case content is too short to assess (< 10 words), return `{"verdict": "proceed_with_submission", "confidence": 0.5}` with a note that low-content cases are not assessed.

**Tone:** internal — agent's verdict is not customer-facing directly. The portal renders the customer-facing UX based on the verdict.

## 5. Tools / Actions available

| Action | Type | Purpose | Side-effect class |
|---|---|---|---|
| `getRecentCasesForAccount` | **Baseline** (Read Records via standard CSM spoke) | Retrieve up to 50 cases on the account, last 30 days, active states only. | Read-only. |
| `semanticSearchCases` | **CUSTOM — §1.1 ESCALATION REQUIRED** | Compare the new case's text against the candidate cases via semantic similarity (AI Search profile). | Read-only. |
| `proposeDeflection` | **Baseline** (agent output to the calling flow) | Hands the verdict, the existing case reference and the confidence back to the portal flow, which renders the deflection UX. | None — writes no record. |

**Execution mode:** all three are read-only, with no side effect → Autonomous; a tool with a side effect would be Supervised *(citation: `markdown/intelligent-experiences/add-tool-aia-new.md`)*. In AI Agent Studio terms, `getRecentCasesForAccount` is a record operation and `semanticSearchCases` a search retrieval over the AI Search profile — both configured over baseline capabilities; `proposeDeflection` is the agent's output to the calling flow, not a tool record.

**OPEN QUESTION — CUSTOM OBJECT PROPOSAL (§1.1):** see §13 — the `semanticSearchCases` Action requires Chief Architect approval before this design can be implemented.

## 6. Confidence routing

| Confidence (`duplicate_found` verdict) | Agent behaviour |
|---|---|
| ≥ 0.85 | Return `{verdict: "duplicate_found", existing_case_sys_id: <sysid>, confidence: <c>}`. Portal renders deflection UI to customer. |
| 0.6 ≤ c < 0.85 | Return `{verdict: "uncertain_duplicate", existing_case_sys_id: <sysid>, confidence: <c>}`. Portal renders a "you may have submitted this before — see <existing case>" link but allows submission to proceed. |
| < 0.6 | Return `{verdict: "proceed_with_submission", confidence: <c>}`. Portal proceeds with case creation as normal. |

## 7. Human-in-the-loop conditions

- **PII handling** — the new case's subject/description may contain PII. The Agent does not log raw case content beyond the AI Control Tower attestation's audit scope (see §9). Customer-supplied content is never displayed back to other customers — the deflection UI shows the *existing* case's sanitised summary, not the new case's content.
- **Customer-facing communication** — the Agent itself does not communicate with the customer. The portal renders the customer-facing UX based on the verdict. This is an intentional separation: the Agent is internal-only.
- **First-time customer scenario** — if the account has zero recent cases, the Agent returns proceed-with-submission without invoking the LLM (saves cost and latency).

## 8. Memory and context

The Agent is one-shot per case submission. It retains no memory across invocations. Each submission is evaluated in isolation.

## 9. Multilanguage scope

English, Mandarin (Simplified), Japanese — per engagement requirement. The system prompt is English; user-facing content (the new case subject/description and candidate cases) is in the customer's language. AI Search profile must be configured for multilingual semantic matching — see §13 for the AI Search configuration cross-reference.

## 10. AI Control Tower attestation

- **Capability:** Duplicate Case Detection Agent.
- **Purpose:** Detect duplicate case submissions at submission time and propose deflection.
- **Data classes accessed:** Customer-supplied case content (potentially PII); CSM case records on the customer's own account; AI Search results.
- **Output classes produced:** Verdict (duplicate / uncertain / proceed) with reference to existing case; kept in the Generative AI Log with the LLM response.
- **Refusal conditions:** Empty candidate list → proceed. Low-content new case → proceed with note. Inability to interpret content (binary attachments, garbled text) → proceed with confidence flag.
- **Audit retention:** Verdict and confidence are in the LLM response, which the Generative AI Log [`sys_generative_ai_log`] keeps with the prompt for 180 days *(citation: `markdown/intelligent-experiences/generative-ai-controller/generative-ai-controller-tables.md`)*; a verdict returned without an LLM call (an empty candidate list) is not in that log. The new case content itself is in the `sn_customerservice_case` table per baseline retention.
- **Periodic review cadence:** Monthly review of false-positive rate by Acme CSM Practice Lead. Sample 100 verdicts per month.

## 11. Performance budget

- **Latency target:** p95 ≤ 3s end-to-end (perceptual budget for "customer waits at submission"). Tight.
- **Throughput:** ~10K invocations/month, ~330 per business day, ~40 per business hour at peak.
- **Token count:** input ~800-1200 tokens (new case + 5-10 candidate cases), output ~50-80 tokens.
- **AI Search latency:** must complete within 800ms to allow the LLM call to fit in budget.

## 12. Test strategy

| Test ID | Coverage | Approach |
|---|---|---|
| ATF-DCD-01 | High-confidence duplicate | ATF + mock: new case "VPN not connecting" + recent case "Cannot connect to VPN" on same account — assert verdict=duplicate_found, confidence ≥ 0.85. |
| ATF-DCD-02 | Low-confidence non-match | ATF + mock: new case "Email outage" + recent cases on unrelated topics — assert verdict=proceed_with_submission, confidence < 0.6. |
| ATF-DCD-03 | Empty candidate list (new customer) | ATF: new customer's first case — assert short-circuit return, no LLM invocation. |
| ATF-DCD-04 | Low-content case | ATF: new case with subject="help" and 5-word description — assert verdict=proceed with low-content note. |
| ATF-DCD-05 | Multilingual happy path | ATF in Mandarin and Japanese — assert duplicate detection works across the engagement's supported languages. |
| ATF-DCD-06 | Latency budget | Load test, 50 concurrent submissions, assert p95 ≤ 3s. |
| ATF-DCD-07 | False-positive sampling | Manual: monthly review of 100 verdicts, assert false-positive rate < 5%. |
| ATF-DCD-08 | AICT attestation validation | Verify Generative AI Log entries match attestation data-classes; sample 20 entries per month. |
| ATF-DCD-09 | PII leakage prevention | Manual: verify deflection UI shows the *existing* case's sanitised summary, NOT the new case's raw content. |

## 13. Open decisions and OPEN QUESTION — CUSTOM OBJECT PROPOSAL

### OQ-CUSTOM-01: Semantic similarity tool

**Baseline option evaluated:** AI Search is the baseline ServiceNow semantic search capability. It supports custom search profiles, multilingual configurations, and RBAC integration. **Baseline option is sufficient — the `semanticSearchCases` Action wraps AI Search and is NOT a custom object.**

**Correction:** the entry in §5 was overcautious. AI Search consumption is baseline functionality; the Action that invokes it is configuration in AI Agent Studio, not a custom object under §1.1.

**Outcome:** no §1.1 escalation required for this item.

### OQ-CUSTOM-02: Where the verdicts are kept

**Baseline option evaluated:** the Generative AI Log [`sys_generative_ai_log`] keeps each prompt and response — the verdict and its confidence — for 180 days *(citation: `markdown/intelligent-experiences/generative-ai-controller/generative-ai-controller-tables.md`)*. The portal's deflection-event table (`x_acme_csm_portal_deflection_event`, from the CSM portal deflection design — see `clients/acme/csm/customer-portal-deflection-design.md`) is not reused: its approval covers the articles suggested per attempt, it has no verdict or confidence field, and it is create-only by system context.

**Outcome:** baseline — no custom object, and no write to another design's table.

### OQ-CUSTOM-03: AI Search profile for multilingual semantic case matching

**Baseline option evaluated:** AI Search supports multilingual profiles via baseline configuration. A new search profile (a record in AI Search Search Profile [`ais_search_profile`] *(citation: `markdown/platform-administration/ai-search/components-installed-ais.md`)*) is configuration, not a major custom object — analogous to creating a new dashboard or report.

**Outcome:** configuration within a baseline construct, no §1.1 escalation required.

### Open decisions (non-§1.1)

- **OD-NA-DCD-01:** Confidence threshold of 0.85 is the design default. Acme CSM Practice may want to tune this based on early production data. Recommend monitoring false-positive rate in the first 90 days and adjusting.
- **OD-NA-DCD-02:** Sanitised summary format for the deflection UI — owned by UI/UX Specialist. The Agent does not produce the sanitised summary; the portal renders existing case data.
- **OD-NA-DCD-03:** Mandarin and Japanese support requires AI Search profile testing in those languages on representative case data. Plan a multilingual content sample before go-live.

## 14. Baseline-first audit

| Item | Count | Approval status |
|---|---|---|
| Custom tables proposed | 0 | n/a — verdicts are kept in the Generative AI Log |
| New scoped apps proposed | 0 | n/a |
| Custom Action tools proposed | 0 | n/a (revised — `semanticSearchCases` wraps baseline AI Search) |
| Custom Connection Aliases proposed | 0 | n/a |
| Custom AI Skill Kit skill / AI Agent (configuration) | 1 AI Agent | n/a — configuration within AI Agent Studio |
| Custom AI Search profile (configuration) | 1 | n/a — configuration within AI Search |
| Custom LLM provider | 0 | n/a — uses Now LLM Service |

**Compliance status: COMPLIANT.** Design uses configuration within baseline frameworks (AI Agent Studio, AI Search, AICT) and keeps its verdicts in the baseline Generative AI Log. No §1.1 escalation.

## 15. Access rules

- **User access:** users with specified roles — `snc_external`, the role a registered portal contact holds *(citation: `markdown/customer-service-management/manage-cust-registration-requests.md`)*. Saving the access rules in AI Agent Studio generates the Allow-If ACL from it *(citation: `markdown/intelligent-experiences/define-sec-aia-new.md`)*.
- **Identity:** Dynamic user, the default — the submitting contact. The agent then reads only the cases that contact may already see, which is what keeps a deflection safe: it cannot surface another account's case *(citation: `markdown/intelligent-experiences/aia-security-implementation.md`)*.
- **Role filtering:** approved roles `snc_external`, so a contact who also holds an internal role runs the agent as a customer *(citation: `markdown/platform-security/identity/role-masking.md`)*.

## 16. Build manifest

Live mode, preset `full`. Before the first call, the two tools are configured in AI Agent Studio (configuration, not built by these calls), and the trigger is the portal flow that Flow Designer Specialist designs.

1. `snow_ai_ai_agent_add` with both tool links and `active: false`:
   `About to create AI agent "Duplicate Case Detection Agent" (sn_aia_agent), its tool links (sn_aia_agent_tool_m2m: getRecentCasesForAccount, semanticSearchCases) and set its configuration inactive (sn_aia_agent_config) on instance "<label>", after ensuring update set acme-duplicate-case-detection and pointing capture at it — write approved?`
   Keep the update set the capture call reports as previous.
2. Read back: the configuration reads inactive, a version exists, two tool links — every warning reported first.
3. Apply item 15 in AI Agent Studio, on the page the result names, then activate the agent there.
4. `snow_us_update_set_preview` shows every record in acme-duplicate-case-detection.
5. Offer to point capture back at the previous update set — its own write question (PN-18).
6. Invoking it from the portal flow is a separate, approved step.

---

## Downstream handoff manifest

- **Flow Designer Specialist** — designs the portal submission flow that invokes the Agent (separately).
- **Developer** — not required: the Agent and its tools are configuration in AI Agent Studio.
- **Integration Specialist** — not required (Now LLM Service, baseline AI Search).
- **UI/UX Specialist** — sanitised summary rendering in the deflection UI (see OD-NA-DCD-02).
- **ATF Author** — 9 test cases including PII leakage prevention.
- **Performance & Scale Specialist** — consult on the 3s perceptual latency budget at expected volume.
- **Security & GRC Specialist** — consult on AICT attestation given customer-supplied content and multilingual scope.
```

### §6.2 post-build manifest

> *Capability design produced. The Duplicate Case Detection Agent is a baseline AI Agent in AI Agent Studio, using baseline AI Search for semantic matching and Now LLM Service for verdict generation. Keeps its verdicts in the baseline Generative AI Log; no custom objects.*
>
> **Proposing handoffs:**
>
> 1. **Flow Designer Specialist** — designs the portal submission flow that invokes the Agent before case creation — proceed?
> 2. **UI/UX Specialist consult** — sanitised summary rendering pattern for the deflection UI (OD-NA-DCD-02) — proceed?
> 3. **Performance & Scale Specialist consult** — 3s perceptual latency budget at ~10K/month volume — proceed?
> 4. **Security & GRC Specialist consult** — AICT attestation given customer-supplied content + multilingual scope — proceed?
> 5. **ATF Author** — nine test cases including PII leakage prevention and multilingual coverage — proceed?
>
> **Baseline-first audit: COMPLIANT.** All custom-object references resolved during design — see §13 OQ-CUSTOM-01..03.
>
> **No Code Reviewer trigger** — this artefact is a capability design, not code.

### Explanation

This example demonstrates two key Now Assist disciplines:

1. **The §1.1 escalation flow done correctly.** The initial design (§5) listed `semanticSearchCases` as a CUSTOM Action requiring escalation. The §13 evaluation walked through the baseline option (AI Search) and concluded the Action is actually configuration in AI Agent Studio wrapping baseline AI Search — no escalation required. The Baseline-first audit (§14) reflects the corrected position. This is exactly the discipline the rule is designed to produce: surface the question, evaluate baseline first, then proceed only if baseline is genuinely insufficient.

2. **Reuse checked against what was approved.** OQ-CUSTOM-02 looks at the portal's deflection-event table, pre-approved in Technical Designer's Example 3, and does not reuse it: that approval covers the articles suggested per attempt, the table has no verdict or confidence field, and it is create-only. The baseline Generative AI Log already keeps the verdicts. Reuse an approved object only for what it was approved for, and prefer the baseline record that already exists.

The confidence routing has *three* bands rather than two (≥ 0.85 deflect, 0.6–0.85 advisory link, < 0.6 proceed) — a more nuanced operational pattern that matches the risk: at high confidence, force the deflection; at medium, offer it but allow submission; at low, get out of the way. The human-in-the-loop section explicitly separates the Agent's role (internal verdict) from the portal's role (customer-facing UX) — that architectural separation prevents PII leakage (ATF-DCD-09) and limits the Agent's blast radius.

The multilingual scope (English, Mandarin, Japanese) drives both prompt design and AI Search profile configuration. Mandarin and Japanese are not just "Western language but Asian" — they have different morphology and case structure, which affects semantic similarity scoring. OD-NA-DCD-03 calls out the need for a multilingual content sample before go-live rather than assuming the AI Search profile will "just work".

---

## Example 3 — AI Control Tower governance attestation for a Now Assist HR skill

### Input prompt

> Now Assist Specialist task: produce an AI Control Tower attestation for an existing Now Assist HR skill that summarises HR case histories for HR business partners.
>
> Skill is already designed; only the AICT attestation is required for compliance review. The skill reads `sn_hr_core_case`, `sn_hr_core_profile`, and `sys_journal_field` entries on HR cases. Output is a 2-3 sentence summary for the HRBP.
>
> Sensitivity: HR PII (employee names, role titles, manager relationships; explicitly NOT compensation, performance ratings, or termination data — those are out of scope for this skill).
> Multilanguage: English only.
> Audit retention: per Acme's existing HR operational log policy.

### Expected output

**File suggestion:** `clients/acme/now-assist/hr-case-summariser-aict-attestation.md`

```markdown
# HR Case Summariser — AI Control Tower Governance Attestation

| | |
|---|---|
| Capability type | AICT governance attestation (referencing existing Now Assist skill) |
| Version | 0.1 |
| Author | Now Assist Specialist |
| Date | 2026-05-09 |
| Release family | Australia |
| Referenced skill | HR Case Summariser (existing, design ref: `clients/acme/now-assist/hr-case-summariser-design.md`) |

## 1. Capability under attestation

**HR Case Summariser** — a Now Assist generative skill that produces a 2–3 sentence summary of an HR case's history for an HR business partner viewing the case in Employee Center or HR Case Workspace.

## 2. Purpose

Reduce HRBP ramp-up time on an unfamiliar HR case by generating a chronological summary from the case's existing audit trail and work notes. Read-only. No autonomous action.

## 3. Data classes accessed

The skill accesses:

| Data class | Tables / fields | Sensitivity | ACL coverage |
|---|---|---|---|
| Employee identity | `sn_hr_core_profile.first_name`, `last_name`, `employee_number`, `email` | HR PII | Baseline `sn_hr_core_profile` ACLs; HRBP role enforced. |
| Employee organisational position | `sn_hr_core_profile.manager`, `department`, `location` | HR PII | Same. |
| HR case content | `sn_hr_core_case.subject`, `description`, `state`, `priority`, `assignment_group` | HR PII (case may contain sensitive content) | Baseline `sn_hr_core_case` ACLs. |
| HR case audit | `sys_journal_field` entries on `sn_hr_core_case` (work notes, comments) | HR PII | Baseline. |
| HR case state audit | `sys_audit` entries for `sn_hr_core_case.state` changes | HR PII | Baseline. |

**Explicitly NOT accessed (out of scope for this skill):**

| Data class | Reason for exclusion |
|---|---|
| Employee compensation | `sn_hr_core_profile.salary` is not in the skill's input contract. Attempted access is blocked by skill configuration and additionally by baseline ACLs (HRBPs do not read salary in baseline HRSD). |
| Performance ratings | Same — explicitly excluded from input contract. |
| Termination data | Same. |
| Health / medical information | Same. |

## 4. Output classes produced

A single text string (2-3 sentences) returned to the calling form panel. The skill writes nothing back to the case; the response is kept in the Generative AI Log (below).

The skill invocation is logged in the Generative AI Log [`sys_generative_ai_log`], which records prompts, responses and edited responses for 180 days, and each use in the Gen AI Usage Log [`sys_gen_ai_usage_log`] *(citation: `markdown/intelligent-experiences/generative-ai-controller/generative-ai-controller-tables.md`)*. The generated summary is therefore in that log, and the attestation covers it.

## 5. Refusal conditions and override conditions

**Refusal:**
- Insufficient case history (zero work notes, zero comments, zero state changes) — skill returns "Insufficient case history to summarise."
- Caller does not have the HRBP role — skill refuses to return any output. This is enforced both by the skill's role check and by baseline ACLs on the underlying tables.
- Case state is "Closed — Confidential" (Acme-specific state for sensitive HR investigations) — skill refuses to summarise. The HRBP must read the case directly with the appropriate explicit ACL clearance.

**Override conditions:**
- None. The skill is read-only with no autonomous action. There are no override conditions because there are no actions to override.

## 6. Audit retention policy

| Item | Retention | Disposition |
|---|---|---|
| Generative AI Log (`sys_generative_ai_log`) — prompts and responses | 180 days (platform retention) | Purged by the platform. |
| Skill output text | In the Generative AI Log with the response — 180 days. | As above. |
| Underlying case data | Per baseline `sn_hr_core_case` retention (engagement-specific). | Per baseline. |
| AICT attestation document | Indefinite — superseded versions retained for compliance trail. | Manual review on superseding. |

## 7. Periodic review cadence

| Review | Frequency | Owner |
|---|---|---|
| Output accuracy sampling | Monthly | Acme HR Practice Lead (samples 30 invocations) |
| Refusal-pattern review | Quarterly | Acme HR Practice Lead + Acme Security Lead |
| AICT attestation refresh | Annual | Now Assist Specialist (this design) + Acme Security Lead |
| Re-attestation trigger event | Any change to the skill's input contract, prompt, or AI Control Tower configuration | Now Assist Specialist |

## 8. Open decisions

- **OD-AICT-01:** The 30-day audit window referenced in the prior design draft is replaced by the Generative AI Log's 180-day platform retention (§6). Confirm with Acme Security Lead that 180 days satisfies Acme's operational log policy.
- **OD-AICT-02:** "Closed — Confidential" state value is referenced but the underlying state-model design has not been confirmed for this engagement. If the state does not exist, the refusal condition must be revised. Reference: HRSD Specialist consult on baseline HR case state model.
```

### §6.2 post-build manifest

> *AICT attestation produced. The attestation covers an existing Now Assist HR skill (HR Case Summariser). No new capability design is required — only the governance attestation.*
>
> **Proposing handoffs:**
>
> 1. **Security & GRC Specialist consult** — review of the attestation given HR PII scope and explicit exclusions (compensation, performance, termination, health) — proceed?
> 2. **HRSD Specialist consult** — OD-AICT-02 references the "Closed — Confidential" state which may not be baseline; confirm state-model assumption before sign-off — proceed?
>
> **Baseline-first audit: COMPLIANT.** The attestation is governance documentation, not a new capability or custom object. No §1.1 escalation.
>
> **No Code Reviewer trigger.**

### Explanation

This example is shorter and tighter because AICT attestations have a focused structure — they're not capability designs, they're governance documents.

The discipline shown here is **explicit exclusions** in §3 — listing what the skill does NOT access (compensation, performance, termination, health) alongside what it does access. For HR PII especially, this is critical: the attestation is what Security & GRC will review, and "trust us, we don't read salary" is rejected. The exclusion table makes the boundary auditable.

§5's "Override conditions: None" is also a deliberate discipline — every section must be populated. "Not applicable" with a rationale is correct; silence is rejected.

§8 (Open decisions) catches a real risk: the attestation references a "Closed — Confidential" state that may not be baseline. Rather than assert it exists, the attestation flags it as OD-AICT-02 and routes back to HRSD Specialist for verification. This is the honest-uncertainty pattern: the Now Assist Specialist designs the AICT attestation but doesn't pretend to know Acme's HR state model.

---

## Example 4 — Minimal agentic solution: one agent, one existing read-only script tool, one workflow

### Input prompt

> Now Assist Specialist task: design an AI agent that tells a service desk analyst which assignment groups a user belongs to, using a read-only script tool that already exists on the instance, and an agentic workflow that uses the agent.
>
> Trigger: chat only — the analyst asks in Virtual Agent; no automatic trigger.
> Existing tool: an AI Agent Studio script tool, **Read user groups**, which reads a user's group memberships and writes nothing.
> Sensitivity: internal; group names and a user's name, nothing else.
> Multilanguage: English only.
> Pre-approved custom objects: none.
> Mode: live, on the instance labelled `pdi`, engagement `acme`.
> Release family: Australia.

### Expected output

**File suggestion:** `clients/acme/now-assist/group-membership-agent-design.md`

```markdown
# Group membership agent and workflow — AI Agent and Agentic Workflow Design

| | |
|---|---|
| Capability type | AI Agent (chat, per question) and Agentic workflow (one agent) |
| Version | 0.1 (draft) |
| Author | Now Assist Specialist |
| Date | 2026-10-16 |
| Release family | Australia |

## AI agent — Group membership agent

### 1. Purpose

Answer a service desk analyst's question about which assignment groups a user belongs to, from the instance's own group membership, without the analyst opening the user record.

### 2. Capability statement

List the assignment groups a named user belongs to.

### 3. Trigger and lifecycle

Chat only: invoked through the agentic workflow below from Virtual Agent; no trigger, which is optional when the solution is used only in chats (citation: `markdown/intelligent-experiences/add-trigger-aia-new.md`). One-shot per question; nothing persists between questions.

### 4. System prompt outline

- **Role:** you answer which assignment groups a user belongs to, for a service desk analyst.
- **Constraints:** use only the result of the Read user groups tool; never infer a membership the tool did not return; name the user you looked up.
- **Refusal conditions:** any question that is not about a user's group membership; a request to change a membership.
- **Tone:** brief, factual, internal.

### 5. Tools

| Tool | Reuse or new | Purpose | Side-effect class | Execution mode |
|---|---|---|---|---|
| Read user groups (`sn_aia_tool`, script) | Reuse — configuration, no §1.1 review | Reads the user's group memberships | Read-only | Autonomous — a read operation (citation: `markdown/intelligent-experiences/add-tool-aia-new.md`) |

The value stored behind Autonomous is read from the instance's choice list before the build, never assumed (PN-17).

### 6. Confidence routing

At confidence ≥ 0.85 that the user is identified uniquely, the agent answers. Below 0.85 — two users share the name, or none matches — it asks the analyst which user is meant, and answers nothing until told.

### 7. Human-in-the-loop conditions

None — a read-only lookup with one Autonomous read tool. A write tool added later would be Supervised and would need a new design.

### 8. Memory and context

None retained across questions.

### 9. Multilanguage scope

English only; a question in another language gets an English answer saying so.

### 10. AI Control Tower attestation

Purpose: group membership lookup for service desk analysts. Data classes: user name, group membership, group name. Output: the chat answer. Refusal conditions: as item 4. Audit retention: the engagement's default.

### 11. Performance budget

One tool call per question; a design target of an answer within 10 seconds.

### 12. Test strategy

- Happy path: a user in two groups — both named.
- Refusal: "add this user to the network group" — refused, nothing written.
- Ambiguity: two users with the same name — the agent asks which.
- Access: an analyst without `itil` cannot invoke the agent; an analyst who also holds `admin` gets an answer computed with `itil` only.
- Governance: the attestation's data classes match the tool's reads.

### 13. Open decisions

- **OD-1:** the approved role for role filtering is `itil` on the assumption that it lets the tool read group membership — confirm on the instance before the build.

### 14. Baseline-first audit

COMPLIANT — §1.1 Verdict A. The tool exists and is reused (configuration). No new table, scope, Connection Alias or custom tool.

### 15. Access rules

- **User access:** users with specified roles — `itil`. Saving the access rules in AI Agent Studio generates the Allow-If ACL from that role (citation: `markdown/intelligent-experiences/define-sec-aia-new.md`).
- **Identity:** Dynamic user, the default — the analyst's own roles; nothing here needs roles the analysts lack (citation: `markdown/intelligent-experiences/aia-security-implementation.md`).
- **Role filtering:** approved roles `itil`, so an analyst who also holds `admin` runs it with `itil` only (citation: `markdown/platform-security/identity/role-masking.md`).
- **In AI Agent Studio:** Studio pre-fills the approved roles from the user-access roles, so remove `admin` by hand; after the save, expect a use-case override and an ECC Queue policy record in the update set (PN-19).

### 16. Build manifest

See the workflow's item 14: one manifest builds both.

## Agentic workflow — Group membership lookup

### 1. Purpose

Give Virtual Agent one entry point to the group membership agent.

### 2. Workflow narrative

The analyst asks in Virtual Agent; the workflow hands the question to the group membership agent and returns its answer.

### 3. Agent chain

Group membership agent only. Passed forward: the analyst's question.

### 4. Trigger and termination

Chat only; ends when the agent answers or refuses.

### 5. Per-Agent design references

The AI agent section above.

### 6. End-to-end confidence routing

The agent's (item 6 above); the workflow adds no threshold.

### 7. Human-in-the-loop checkpoints

None — read-only.

### 8. AI Control Tower attestation

Covers the one agent; the same data classes.

### 9. Performance budget

As the agent's.

### 10. Test strategy

The agent's cases, invoked through the workflow; plus an analyst without `itil` on the workflow's own ACL.

### 11. Open decisions

OD-1 above.

### 12. Baseline-first audit

COMPLIANT — as the agent's.

### 13. Access rules

The workflow's own: users with specified roles — `itil`; Dynamic user; approved roles `itil`. The agent admits the same role, so the invoker passes both ACLs (citation: `markdown/intelligent-experiences/aia-security-implementation.md`).

### 14. Build manifest

Live mode, instance `pdi`, preset `full` (both tools need `NOW_ASSIST_ENABLED` and `WRITE_ENABLED`).

1. `snow_ai_ai_agent_add` with the tool link and `active: false` — the agent stays inactive until its access rules are applied:
   `About to create AI agent "Group membership agent" (sn_aia_agent), its tool link (sn_aia_agent_tool_m2m: Read user groups) and set its configuration inactive (sn_aia_agent_config) on instance "pdi", after ensuring update set acme-group-membership and pointing capture at it — write approved?`
   Keep the update set the capture call reports as previous.
2. Read back: the configuration reads inactive, a version exists, one tool link — every warning reported before the next call.
3. `snow_ai_agentic_workflow_add`:
   `About to create agentic workflow "Group membership lookup": team (sn_aia_team), workflow (sn_aia_usecase), member (sn_aia_team_member: Group membership agent) on instance "pdi" — write approved?`
   The workflow is active on insert (PN-17), so step 5 follows at once.
4. Read back: the version, the one member; `snow_us_update_set_preview` shows every record in acme-group-membership.
5. Apply items 15 and 13 in AI Agent Studio, on the pages each result names, then activate the agent there.
6. Offer to point capture back at the previous update set — its own write question (PN-18).
7. Testing the workflow on a record in AI Agent Studio is a separate, approved step (citation: `markdown/intelligent-experiences/test-ai-asset-new.md`).
```

### §6.2 post-build manifest

> *Capability design produced. The agent reuses an existing tool and writes nothing, so no builder is needed before the build manifest runs.*
>
> **Proposing handoffs:**
>
> 1. **Security & GRC Specialist consult** — review of the access rules and the role filtering (OD-1) — proceed?
>
> **Baseline-first audit: COMPLIANT** — §1.1 Verdict A.
>
> **No Code Reviewer trigger** — no new script.

### Explanation

The example shows the three disciplines this skill adds for agentic solutions. The agent's tool is an AI Agent Studio tool that already exists, so linking it is configuration and the verdict is A; one of this product's server tools is never the agent's tool. The access rules are written for the agent and the workflow separately, because each has its own ACL, identity and role filtering, and the invoker must pass both. The build manifest asks one question per call, naming every record the call writes in order, builds the agent inactive because an inserted agent is active at once (PN-17), and ends by offering to restore the capture target (PN-18) — running the solution stays a separate approval.

---

*End of Now Assist Specialist EXAMPLES.md v1.0.*
