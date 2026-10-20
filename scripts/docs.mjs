#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-03-S03 → ARC-06-S02: a shim, not a second implementation.
//
// The dispatch moved to `tools/snowarch/lib/docs/cli.mjs` when the `snowarch` CLI mounted `docs`.
// This file keeps its name and its exit codes because CI, the npm scripts and the two workflows
// call it by path — and `./snowarch docs …` now runs exactly the same function. A test asserts the
// two entry points agree, so they cannot drift into two behaviours with one name.
import { runDocs } from '../tools/snowarch/lib/docs/cli.mjs';

// `process.exitCode`, not `process.exit()` — the same rule the launcher states three files away
// and the reason it states it: an explicit exit truncates stdout when it is a PIPE, because a write
// past the pipe buffer is asynchronous and the process is gone before it drains. This shim carried
// the old form, so `node scripts/docs.mjs status --json` handed a caller its object cut in half at
// a buffer boundary — found by the test that compares the two entry points, failing with
// `Unterminated string in JSON at position 8192`, which is 8 KiB exactly.
process.exitCode = runDocs(process.argv.slice(2));
