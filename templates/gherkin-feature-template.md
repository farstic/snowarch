# Feature Template — ServiceNow Convention

**Purpose:** Reusable Gherkin Feature file skeleton following ServiceNow story-writing conventions.
**Audience:** Story Writer specialist; Business Analysts producing sprint-ready stories.
**Last updated:** 2026-05-31

> Replace `{{...}}` placeholders. Delete this header before delivering.

```gherkin
Feature: {{Short, action-oriented feature name}}
  As a {{role from the engagement's stakeholder/role matrix}}
  I want {{capability}}
  So that {{business outcome}}

  Background:
    Given the user is logged into {{ServiceNow workspace or portal}}
    And the user holds the role {{role}}
    And {{any other shared precondition}}

  Scenario: {{Happy-path scenario name}}
    Given {{precondition specific to this scenario}}
    When {{single action}}
    Then {{primary expected outcome}}
    And {{secondary verification — e.g., field value, state, notification}}

  Scenario: {{Edge case — e.g., insufficient role}}
    Given {{precondition}}
    When {{action}}
    Then {{expected denial / fallback outcome}}
    And {{audit/trace expectation}}

  Scenario: {{Edge case — e.g., integration failure}}
    Given the {{integration}} is unavailable
    When {{action}}
    Then {{expected fallback}}
    And the user receives {{notification}}

  # OPEN QUESTIONS
  # OQ-ST-1. {{Question for the product owner}}
  # OQ-ST-2. ASSUMPTION: {{stated assumption that needs confirmation}}
  # OQ-ST-3. {{Decision the client must make before build}}
```

## Standard supporting stories to consider proposing

When you submit this Feature, also propose these supporting stories if applicable:

- **Access control story** — who can perform / view / approve
- **Audit and traceability story** — what gets logged, what fields capture the change reason
- **Notification story** — emails, Teams/Slack, in-platform notifications
- **Reporting story** — dashboards, reports, KPIs surfacing the new data
- **Test data and ATF story** — required test data, ATF test scenarios
- **Documentation story** — KB article or runbook required

## Conventions checklist before submitting

- [ ] Roles use ServiceNow role names or engagement aliases (no generic "user")
- [ ] Tables and fields use real ServiceNow names
- [ ] State values include label + value where ambiguity exists (`Awaiting Info (state=3)`)
- [ ] Workspaces/portals named explicitly (`Service Operations Workspace`, etc.)
- [ ] Each `When` is a single action
- [ ] Each `Then` describes an observable outcome
- [ ] Negative cases covered
- [ ] At least one open question (or explicit "OPEN QUESTIONS: None.")
- [ ] Output language is corporate professional English
