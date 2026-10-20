# RELICENSING.md — ARC-00-S02 (D-02)

**Status: COMPLETE (2026-09-07).** Both owner-gated items have landed and are recorded verbatim with
their provenance: the owner's relicensing confirmation (§4) and the second contributor's consent
(§3, resolution (a)). **D-02 is fully closed and ADR-0002 is Accepted.**

Produced 2026-09-06 from `AI-Architect-Claude` HEAD `21bdf69` and `snow-mcp` HEAD `bb09bde`.
Neither source repository was modified. Companion files: `LICENSE` (canonical Apache-2.0),
`NOTICE`, `header-sweep.txt`, `README.md` (the ARC-00-S02 record).

---

## 1. The relicensing sentence ARC-01 pastes into the first commit message

> snow-mcp (ServiceNow MCP Toolkit) and claude-servicenow-live (ServiceNow Architecture Engine) are
> relicensed under the Apache License, Version 2.0, effective 2026-09-04, by Cvetomir Grigorov for
> all contributions he authored (he is the sole author of snow-mcp); the single third-party
> contribution to claude-servicenow-live (RobertBH17, commit 5b40835) is handled per the Resolution
> section below; this repository is the successor to both.

**This is the agreed wording, and it deviates deliberately from the sentence printed in the
ARC-00-S02 design notes.** The story's version reads "relicensed by their sole author, Cvetomir
Grigorov" — but the story's own design note (the "Second contributor in the engine history"
paragraph) establishes that "sole author" is false for the engine: `git shortlog` shows two authors.
A first commit message asserting sole authorship would be a licence statement contradicted by the
repository's own history in the same commit. The amended sentence keeps D-02's substance — Apache-2.0,
effective 2026-09-04, author-only IP — while scoping the unilateral statement to the contributions
the owner actually authored and pointing at the Resolution section for the one that he did not.
Agreed with the architect on 2026-09-06.

**The `@farstic/snow-mcp@1.0.0` npm record is not relicensed, deprecated, unpublished or edited**
(D-01 owner constraint). Nothing in this relicensing reaches it; anything the unified product
publishes goes under the new `@farstic/snowarch` record.

---

## 2. Authorship of record

### `claude-servicenow-live` (`~/work/AI-Architect-Claude`) — HEAD `21bdf69`

```
$ git shortlog -sn HEAD
    57	farstic
     1	RobertBH17
```

### `snow-mcp` (`~/work/snow-mcp`) — HEAD `bb09bde`

```
$ git shortlog -sn HEAD
    15	Cvetomir Grigorov
    13	cvetomirgrigorov
```

Both `snow-mcp` rows are the owner under two `user.name` spellings on one email address, so the
server is single-author and D-02's "unilateral author statement" holds for it without qualification.
The engine has one commit by a second contributor, which is what section 3 is for.

---

## 3. Resolution — the engine's second contributor

**Resolved 2026-09-07 — resolution (a), written consent (below); ARC-01-S02's import proceeded under Apache-2.0.**
and recorded here. No one has been contacted: outreach is the owner's, not the delivery team's.

### The commit

```
commit    5b40835641c0edd0bae8d15df0c6059f7d7559bf
author    RobertBH17            (email withheld — this file is imported into a public repository)
committer GitHub                (squash-merge of pull request #1)
date      2026-06-09
subject   New agent/skills (#1)
parents   6f11dfa877abe0afd814181f6d43705bc76c3f79   (single parent — squashed, not a merge commit)
stat      138 files changed, 10424 insertions(+), 358 deletions(-)
```

> **Scope note — this commit is materially larger than the ARC-00-S02 design note describes.** The
> note summarises it as adding `.claude/agents/atf-author.md`, `diagramming-specialist.md`,
> `skills/app-engine-specialist/`, `atf-author/`, `cmdb-csdm-specialist/` "and edits several other
> skills". The actual commit is **138 files changed, 10424 insertions(+), 358 deletions(-)** — 83 files added and 55
> modified, including the engine's core governance documents (`CLAUDE.md`, `README.md`,
> `governance-rules.md`, `taxonomy.md`, `prompt-patterns.md`, `VALIDATION-TESTS.md`), the
> `.githooks/pre-commit` hook, seven `scripts/`, the four `reference/templates/`, and sixteen
> complete skills, each duplicated in `skills/` and `.claude/skills/`. That materially changes the cost of
> resolution (b), and the story's risk note — "the affected skills are rewritten in ARC-02 anyway
> (description cap), so resolution (b) costs nothing extra" — holds only for the skills, not for the
> governance documents, the scripts or the templates.
>
> **What git can and cannot tell you.** Because pull request #1 was squash-merged, the individual
> commits are not in this repository and git attributes all 10,424 inserted lines to the
> PR author. Git authorship records who opened the pull request; it does not establish who wrote
> each line. If some of this content originated with the owner, only the owner knows that. The
> decision between (a) and (b) therefore needs the owner's own knowledge of the collaboration, not
> just this file list.

### Resolution (a) — written consent  ·  **CLOSED 2026-09-07**

> **Resolution (a) — consent obtained.** Contributor **RobertBH17**: **"yes, agreed"** — channel: **MS
> Teams chat**, **2026-09-07**; supplied by the owner via the architect session
> (`ai-architect-claude-d0`) and recorded in `docs/plans/02-DECISIONS-NEEDED.md` D-02 @ `3611587`.
>
> Preceded by the owner's own statement of the same day, „Имаме разрешение от RobertBH17" *("We have
> RobertBH17's permission")*, recorded at `cf2dde7`.

**What this settles.** Resolution **(b) — rewrite before import — is withdrawn**, and **ARC-01-S02 may
import the 138 files of `5b40835` under Apache-2.0**. This is the "agreed in writing" evidence the ARC-00
README's acceptance criterion asks for, and with it **D-02 is fully closed** and **ADR-0002 moves to
*Accepted***.

Provenance verified before writing, as for the owner's confirmation: commit `3611587` exists, is authored
by the owner's own git identity (2026-09-07 21:56 +0300), and its D-02 block carries the quote, the
channel and the date. No email address or handle beyond the GitHub login already in the git history
appears in this file.

To be recorded verbatim here when it arrives: the consent text, its date, and the channel it came
through (email, GitHub PR comment, signed statement). Suggested minimum content, for the owner to
send and obtain — **not to be sent by the delivery team**:

```
CONSENT TEXT:   <verbatim>
DATE:           <YYYY-MM-DD>
CHANNEL:        <email | GitHub comment (link) | signed document>
COVERS:         all contributions in commit 5b40835 of claude-servicenow-live
GRANTS:         relicensing under the Apache License, Version 2.0
```

If (a) is recorded, ARC-01-S02 imports every file below unchanged and this section's blocking note
is lifted.

### Resolution (b) — rewrite before import  ·  **WITHDRAWN 2026-09-07 (resolution (a) chosen)**

If consent does not arrive, the files below may **not** be imported verbatim; ARC-01 rewrites them
from scratch (or omits them). This is the no-dependency fallback and must be chosen by the end of
ARC-00 if (a) has not arrived.

**Added by `5b40835` — 83 files (no pre-existing version exists; a rewrite is a fresh authoring)**

```
    .claude/agents/atf-author.md
    .claude/agents/diagramming-specialist.md
    .claude/skills/app-engine-specialist/EXAMPLES.md
    .claude/skills/app-engine-specialist/SKILL.md
    .claude/skills/atf-author/EXAMPLES.md
    .claude/skills/atf-author/SKILL.md
    .claude/skills/cmdb-csdm-specialist/EXAMPLES.md
    .claude/skills/cmdb-csdm-specialist/SKILL.md
    .claude/skills/devops-release-manager/EXAMPLES.md
    .claude/skills/devops-release-manager/SKILL.md
    .claude/skills/diagramming-specialist/EXAMPLES.md
    .claude/skills/diagramming-specialist/SKILL.md
    .claude/skills/diagramming-specialist/templates/house-style-reference.drawio
    .claude/skills/diagramming-specialist/templates/house-style-reference.svg
    .claude/skills/discovery-specialist/EXAMPLES.md
    .claude/skills/discovery-specialist/SKILL.md
    .claude/skills/estimation-specialist/EXAMPLES.md
    .claude/skills/estimation-specialist/SKILL.md
    .claude/skills/licensing-specialist/EXAMPLES.md
    .claude/skills/licensing-specialist/SKILL.md
    .claude/skills/migration-specialist/EXAMPLES.md
    .claude/skills/migration-specialist/SKILL.md
    .claude/skills/now-assist-genai/EXAMPLES.md
    .claude/skills/now-assist-genai/SKILL.md
    .claude/skills/operational-documentation/EXAMPLES.md
    .claude/skills/operational-documentation/SKILL.md
    .claude/skills/performance-scale-specialist/EXAMPLES.md
    .claude/skills/performance-scale-specialist/SKILL.md
    .claude/skills/reporting-analytics-specialist/EXAMPLES.md
    .claude/skills/reporting-analytics-specialist/SKILL.md
    .claude/skills/security-grc-specialist/EXAMPLES.md
    .claude/skills/security-grc-specialist/SKILL.md
    .claude/skills/spm-specialist/EXAMPLES.md
    .claude/skills/spm-specialist/SKILL.md
    .claude/skills/ui-ux-specialist/EXAMPLES.md
    .claude/skills/ui-ux-specialist/SKILL.md
    agents/atf-author.md
    agents/diagramming-specialist.md
    reference/templates/adr-template.md
    reference/templates/nfr-checklist-template.md
    reference/templates/raid-log-template.md
    reference/templates/traceability-matrix-template.md
    scripts/md-to-docx.ps1
    scripts/mermaid-theme.json
    scripts/render-diagrams.ps1
    scripts/render-diagrams.sh
    scripts/render-pdf-pages.ps1
    scripts/verify-citations.sh
    scripts/verify-structure.sh
    skills/app-engine-specialist/EXAMPLES.md
    skills/app-engine-specialist/SKILL.md
    skills/atf-author/EXAMPLES.md
    skills/atf-author/SKILL.md
    skills/cmdb-csdm-specialist/EXAMPLES.md
    skills/cmdb-csdm-specialist/SKILL.md
    skills/devops-release-manager/EXAMPLES.md
    skills/devops-release-manager/SKILL.md
    skills/diagramming-specialist/EXAMPLES.md
    skills/diagramming-specialist/SKILL.md
    skills/diagramming-specialist/templates/house-style-reference.drawio
    skills/diagramming-specialist/templates/house-style-reference.svg
    skills/discovery-specialist/EXAMPLES.md
    skills/discovery-specialist/SKILL.md
    skills/estimation-specialist/EXAMPLES.md
    skills/estimation-specialist/SKILL.md
    skills/licensing-specialist/EXAMPLES.md
    skills/licensing-specialist/SKILL.md
    skills/migration-specialist/EXAMPLES.md
    skills/migration-specialist/SKILL.md
    skills/now-assist-genai/EXAMPLES.md
    skills/now-assist-genai/SKILL.md
    skills/operational-documentation/EXAMPLES.md
    skills/operational-documentation/SKILL.md
    skills/performance-scale-specialist/EXAMPLES.md
    skills/performance-scale-specialist/SKILL.md
    skills/reporting-analytics-specialist/EXAMPLES.md
    skills/reporting-analytics-specialist/SKILL.md
    skills/security-grc-specialist/EXAMPLES.md
    skills/security-grc-specialist/SKILL.md
    skills/spm-specialist/EXAMPLES.md
    skills/spm-specialist/SKILL.md
    skills/ui-ux-specialist/EXAMPLES.md
    skills/ui-ux-specialist/SKILL.md
```

**Modified by `5b40835` — 55 files (the pre-`5b40835` version at `6f11dfa` is the owner's
own work and may be imported; only this commit's hunks need rewriting — `git diff 6f11dfa 5b40835 -- <path>`
is the exact set for each)**

```
    .claude/agents/developer.md
    .claude/agents/flow-designer-specialist.md
    .claude/agents/hld-lld-writer.md
    .claude/agents/integration-specialist.md
    .claude/agents/now-assist-specialist.md
    .claude/agents/story-writer.md
    .claude/agents/technical-designer.md
    .claude/skills/code-reviewer/EXAMPLES.md
    .claude/skills/code-reviewer/SKILL.md
    .claude/skills/csm-specialist/SKILL.md
    .claude/skills/developer/SKILL.md
    .claude/skills/flow-designer-specialist/SKILL.md
    .claude/skills/hld-lld-writer/SKILL.md
    .claude/skills/hrsd-specialist/SKILL.md
    .claude/skills/integration-specialist/SKILL.md
    .claude/skills/itom-discovery-specialist/EXAMPLES.md
    .claude/skills/itom-discovery-specialist/SKILL.md
    .claude/skills/itsm-specialist/EXAMPLES.md
    .claude/skills/itsm-specialist/SKILL.md
    .claude/skills/story-writer/SKILL.md
    .githooks/pre-commit
    .gitignore
    CLAUDE.md
    README.md
    VALIDATION-TESTS.md
    agents/developer.md
    agents/flow-designer-specialist.md
    agents/hld-lld-writer.md
    agents/integration-specialist.md
    agents/now-assist-specialist.md
    agents/story-writer.md
    agents/technical-designer.md
    docs/ADVANCED-WEB-SETUP.md
    docs/BUSINESS-OVERVIEW.md
    docs/CHANGELOG.md
    docs/INSTALLATION-GUIDE.md
    docs/README.md
    docs/TECHNICAL-ARCHITECTURE.md
    docs/nowaikit-field-notes.md
    governance-rules.md
    prompt-patterns.md
    skills/code-reviewer/EXAMPLES.md
    skills/code-reviewer/SKILL.md
    skills/csm-specialist/SKILL.md
    skills/developer/SKILL.md
    skills/flow-designer-specialist/SKILL.md
    skills/hld-lld-writer/SKILL.md
    skills/hrsd-specialist/SKILL.md
    skills/integration-specialist/SKILL.md
    skills/itom-discovery-specialist/EXAMPLES.md
    skills/itom-discovery-specialist/SKILL.md
    skills/itsm-specialist/EXAMPLES.md
    skills/itsm-specialist/SKILL.md
    skills/story-writer/SKILL.md
    taxonomy.md
```

---

## 4. Owner confirmation

```
Owner confirmation:  „Потвърждавам relicensing под Apache-2.0, 2026-09-06"
                     English gloss: "I confirm the relicensing under Apache-2.0, 2026-09-06."
Date received:       2026-09-07
Channel:             relayed from the owner through the Claude Code session
                     `ai-architect-claude-d0` (the architect), and recorded by the owner's own
                     git identity in docs/plans/02-DECISIONS-NEEDED.md D-02, commit 695167a
                     (farstic, 2026-09-07 21:49 +0300) on branch arc-00/spikes.
Covers:              the relicensing of both predecessor projects under Apache-2.0 for the
                     contributions the owner authored (see the sentence in section 1).
Resolution chosen:   (a) consent obtained — CLOSED 2026-09-07; see section 3.
```

**Provenance, stated precisely because this is the "agreed in writing" evidence.** The confirmation did
not arrive in the session that wrote this file. It was relayed by the architect session and is recorded
in the plans repository by the owner's own git identity at `695167a`; that commit is the primary
artefact, and this file quotes it. Verified independently before being written here: the commit exists,
its author is the owner, and its D-02 block carries the sentence above verbatim.

**What this does and does not unblock.** ARC-00-S02 acceptance criterion 3 is now **MET**. Acceptance
criterion 6 stays **PARTIAL** and **ADR-0002 stays *Proposed***: the (a)/(b) resolution for the engine's
second contributor — commit `5b40835`, 138 files — is untouched by this confirmation, and ARC-01-S02's
import of those files stays blocked until the owner rules on it.

ARC-01-S01 / ARC-01-S02 / ARC-04-S01 read this block as their gate.
