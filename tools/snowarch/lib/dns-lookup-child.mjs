// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C261 — the child that dns-probe.mjs runs: one lookup of its first argument, through getaddrinfo as git's own is. It prints the
// resolver's code when the lookup fails, and exits 1; a lookup that never answers is the parent's to kill at its budget. A file and not a
// script handed to `node -e`, because the engine's printed-redaction test masks `process.argv` in any string literal as a name.
import { lookup } from 'node:dns';

lookup(process.argv[2], (error) => {
  if (error) process.stdout.write(`${error.code || 'ERROR'}\n`);
  process.exitCode = error ? 1 : 0;
});
