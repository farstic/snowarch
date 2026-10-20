#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S02 — the entry point. Everything it does is in `lib/`; this file exists to be executable.
import { homedir } from 'node:os';

import { main } from '../lib/cli.mjs';

// `process.exitCode`, not `process.exit()`: an explicit exit truncates stdout when it is a pipe,
// which is how a `--json` object reaches a caller cut in half.
// The home directory is read HERE and passed down: nothing under `lib/` may reach into it, and
// the doctor needs it only to shorten an absolute path to `~` in a report a reader will paste.
process.exitCode = await main(process.argv.slice(2), { home: homedir() });
