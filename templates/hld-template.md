# HLD Template — High-Level Design

**Purpose:** Standard 8-section HLD skeleton for ServiceNow solution architecture documents.
**Audience:** HLD/LLD Writer specialist; Solution Architects producing design documents for review boards.
**Last updated:** 2026-05-31

---

# {{Solution / Programme name}} — High-Level Design

| | |
|---|---|
| **Document version** | 0.1 (draft) |
| **Author** | {{author}} |
| **Reviewers** | {{reviewers}} |
| **Approvers** | {{approvers}} |
| **Status** | Draft / In Review / Approved |
| **Release family** | Australia |
| **Last updated** | {{YYYY-MM-DD}} |

## Change log

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | {{date}} | {{author}} | Initial draft |

---

## 1. Executive Summary

**Business problem.** {{One paragraph.}}

**Solution.** {{One paragraph.}}

**Key benefits.**
- {{Benefit 1}}
- {{Benefit 2}}
- {{Benefit 3}}

**High-level cost / timeline.** {{If known.}}

---

## 2. Solution Overview

### 2.1 Scope

| In scope | Out of scope |
|---|---|
| {{...}} | {{...}} |

### 2.2 Assumptions and constraints

- {{Assumption 1}}
- {{Constraint 1}}

### 2.3 Dependencies

- {{Dependency on other initiative or system}}

---

## 3. Functional Architecture

### 3.1 End-to-end process flow

![Figure 1 — {{Process name}} end-to-end flow](diagrams/fig-01-{{process-flow}}.svg)

*Figure 1 — {{What the reader should take away.}} Source: `diagrams/fig-01-{{process-flow}}.drawio` (Diagramming Specialist).*

### 3.2 User journeys per persona

{{Per persona — onboarding, day-in-the-life, exception handling.}}

### 3.3 Module and feature mapping

| Capability | ServiceNow product / module | Notes |
|---|---|---|
| {{Capability}} | {{Module}} | {{Note}} |

---

## 4. Technical Architecture

### 4.1 Data model summary

{{Tables, key relationships, scoped app structure.}}

### 4.2 Integration architecture

{{Systems, protocols, MID Server placement.}}

### 4.3 Environment topology

{{Dev, test, UAT, prod; clone strategy.}}

### 4.4 Performance and scaling

{{Volume estimates, query patterns, async strategy.}}

---

## 5. Security & Compliance

### 5.1 Role model
### 5.2 Data classification and handling
### 5.3 Audit, logging, compliance
### 5.4 Privacy considerations

---

## 6. Operations

### 6.1 Support model and SLAs
### 6.2 Monitoring and alerting
### 6.3 Backup, restore, DR
### 6.4 Runbook references

---

## 7. Open Decisions

### OD-01: {{Short title}}
- **Context:** {{Why this needs a decision.}}
- **Options:**
  1. {{Option}} — pros / cons
  2. {{Option}} — pros / cons
- **Recommendation:** {{Option}} because {{reason}}
- **Owner:** {{Decider}}
- **Decision by:** {{Date or sprint}}
- **Status:** Open
