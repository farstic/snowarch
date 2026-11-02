// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C239 — where a `/snowarch finding` note lives: `clients/<engagement>/findings/<name>`, `/`-separated and
// relative to the root. ONE definition with two readers: finding.mjs, which accepts no other path, and the citation hook,
// which does not send such a note back, because it records a path as the user saw it. It imports nothing, so the hook
// can read it before it decides whether to import anything at all.
export const FINDING_PATH = /^clients\/([^/]+)\/findings\/([^/]+)$/;
