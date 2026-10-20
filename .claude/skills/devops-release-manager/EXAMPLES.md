# DevOps / Release Manager v1.0 — Worked Example

One example. Read alongside `SKILL.md`.

---

## Example — Deploy a CSM enhancement (config + a scoped app) from dev to prod, with pipeline-driven change

```markdown
# Release / Deployment Plan — CSM enhancement (config + x_acme_csm_ext app)

## Artefact & vehicle
Two artefact types, two vehicles:
- **Baseline CSM configuration** (form/list/flow/ACL changes on baseline tables) → **update set**.
- **The scoped app** `x_acme_csm_ext` → **App Repository** (publish a version, install/upgrade per instance) — NOT update sets for the whole app. *(citation: markdown/application-development/application-repository-self-hosted/app-repo.md)*

## Update-set strategy
One update set per logical change (not a giant set); ensure no work lands in Default. Order: any referenced records (groups, choices) before the records that reference them. **Preview** on the target to catch collisions; document a **backout** (revert the set). *(citation: markdown/application-development/releaseops/promote-update-set-for-deployment.md)*

## App publish/upgrade
Publish `x_acme_csm_ext` v1.x to App Repository; install on test, then prod. Version bump per release; rollback = install prior version.

## Pipeline & change automation
Use **DevOps Change Velocity** so the deployment auto-creates a **change request** with the right approvals, tying the CI/CD run to governed change. CI/CD APIs run the **ATF suite** and an **instance scan** as gates. *(citation: markdown/it-service-management/devops-change-velocity/dev-ops-overview.md, markdown/api-reference/rest-apis/cicd-update-set-api.md)* The **wire to the external pipeline tool** (auth, REST) is an **Integration Specialist** deliverable.

## Environment path
dev → test/UAT → prod. Refresh sub-prod via **clone** with **data preservers** (keep test users/config) and **clone exclusions** for secrets/credentials. Never develop on prod.

## Validation gates
Before prod: ATF suite green (ATF Author), instance scan clean, UAT sign-off, change approved via DevOps Change Velocity.

## Backout / rollback
Config: revert the update set. App: reinstall prior App Repository version. Rehearse on the clone first.

## §1.1 verdict
**Baseline mechanics — PROCEED.** Update sets + App Repository + DevOps Change Velocity + CI/CD APIs + clones. No custom deployment framework, no custom release-tracking table.

## Handoffs & consults
- **Integration Specialist** — the pipeline-tool connection (Jenkins/GitHub/ADO auth + REST).
- **ATF Author** — the gate suite.
- **ITSM** — the change process/approval policy behind DevOps Change Velocity.
- **Operational Documentation** — the cutover runbook.
- **Security & GRC** — clone secret-exclusion.

## Open questions
OQ-CN-1. Is DevOps Change Velocity licensed, or is change created manually for now?
OQ-CN-2. Which external CI/CD tool drives the pipeline (→ Integration Specialist scope)?
OQ-CN-3. Clone cadence for sub-prod refresh?
```

---

## Reading this example
The plan picks the **right vehicle per artefact** (update set for config, App Repository for the app), governs the deploy through **DevOps Change Velocity + CI/CD gates**, and routes the **external-tool wire to Integration** — staying entirely on baseline release mechanics (§1.1).

---

*End of DevOps / Release Manager EXAMPLES.md v1.0.*
