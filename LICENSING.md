# Licensing

This page explains, in plain language, what you may do with the AI ServiceNow Architect
("snowarch") and when you need permission. The legal terms are in `LICENSE` and `NOTICE`; where
this page and `LICENSE` differ, `LICENSE` governs.

## Summary

| You want to… | Status |
|---|---|
| Install and run snowarch for your own ServiceNow work, at your company, or as a consultancy delivering to your own clients | **Allowed** under the Additional Use Grant in `LICENSE`, with attribution (see below). |
| Read, modify and keep a private fork | **Allowed**, with attribution. |
| Redistribute it, modified or not | **Allowed** under the code licence, provided `LICENSE` and `NOTICE` travel with it, your changes are marked as yours, and the copy stays under the same licence. |
| Offer snowarch to others as a hosted or managed service, or as a product or a substantial part of one | **Not allowed** without a commercial licence from the author (contact: see `NOTICE`). |
| Call your product, service or fork "snowarch" or anything confusingly similar | **Not allowed** without a written trademark licence — see `TRADEMARKS.md`. |
| Present snowarch as endorsed by, affiliated with, or made by ServiceNow, Inc. or Anthropic | **Not allowed.** |
| Remove or alter copyright notices, `LICENSE` or `NOTICE` | **Not allowed.** |
| Contribute code or text to this repository | Allowed, after signing the Contributor Licence Agreement — ask through the contact in `NOTICE`. |

## The code

The engine — the orchestration rules, the specialist skills and agents, the MCP server, the
scripts and the tests — is © 2026 Cvetomir Grigorov. From 2.1.0 it is licensed under the
**Business Source License 1.1** (`LICENSE`, SPDX `BUSL-1.1`); 2.0.x and earlier stay under the
Apache License, Version 2.0, as the `LICENSE` in their release tags says. The Business Source
License lets you copy, modify, redistribute and make non-production use of the software, and its
Additional Use Grant adds the production use in the summary above, on these conditions:

- `LICENSE` is displayed with every copy, modified or not, and every copy and derivative work stays
  under it;
- use outside the Additional Use Grant needs a commercial licence from the author;
- the licence grants no right in the author's trademarks or logo (`TRADEMARKS.md`);
- the software is provided **"as is"**, without warranty of any kind.

Each version also becomes available under the Apache License, Version 2.0, on its Change Date, or
four years after it is first published if that comes first.

Every release is an annotated git tag with its assets published on GitHub. From 2.1 (ARC-11-C3)
releases are signed and ship a checked integrity manifest; a copy whose files do not match that
manifest is not a release of this project.

From 2.1 a licensed copy is also held to that manifest (ARC-11-C141). A change to the product's own
files — the core files, or a skill, agent or rule added under `.claude/` — does not take effect: at
the next start or command the signed files are put back from the release's tag, and what was
replaced or added is moved to `.local/integrity-removed/`, never deleted. Your own material belongs
under `clients/<name>/`. A copy that cannot be put back — no signed manifest held, or no release
tag to restore from — runs no MCP tool, and no command but those that show and repair the state.
What this does not reach, by design: a development version, and a copy whose version has been
edited to one or removed; a change that removes the check itself; a change made together with its
file's time stamp, until the next full check (every server start, `doctor` and `status`); and a
session already running, which reads a restored `CLAUDE.md` from its next start.

## The ServiceNow documentation corpus

`vendor/ServiceNowDocs/` is ServiceNow product documentation, © ServiceNow, Inc., licensed by
ServiceNow under the Apache License 2.0 and vendored at a pinned commit. Its own `LICENSE` and
`legal/` folder are present in every checkout. ServiceNow®, Now Platform® and related marks are
trademarks of ServiceNow, Inc. **This project is not affiliated with, sponsored by or endorsed by
ServiceNow, Inc.**

## Claude and Anthropic

snowarch runs inside Claude Code and calls no language model itself. Every user needs their own
Claude account and plan; the use of Claude, the handling of the data you send to it and any data
processing agreement are governed by **your** agreement with Anthropic, not by this project.
Claude® is a trademark of Anthropic, PBC; this project is not affiliated with or endorsed by
Anthropic.

## Your data stays yours

Engagement material — the `clients/` folder, instance credentials in `.local/`, Envelopes,
decisions and designs produced for a client — is not part of this repository and is not covered
by the code licence. It belongs to whoever produced it for whom, under their own contract.

## What is not granted

Nothing here grants you:

- any right to the **snowarch** name or logo (`TRADEMARKS.md`);
- any right to present the software as certified, supported or warranted by its author;
- any right to the author's services, support or future versions.

Commercial support, a commercial licence for use outside the Additional Use Grant, and a trademark
licence are available by agreement. Contact: see `NOTICE`.

## Future versions

The author may release future versions under a different licence. A version's licence is the
`LICENSE` file shipped in its release tag; this page is updated with it.

From 2.0.13 the product checks for a valid licence from the author on every build: without one, no
MCP tool runs, and no command runs but the few that show and repair the state (`docs/USER-GUIDE.md`).
Releases 2.0.x and earlier stay under the Apache License 2.0. From 2.1.0 the code is under the
Business Source License 1.1, and the `LICENSE` file in each release's tag says so (ADR-0011).

*This page is an explanation, not legal advice.*
