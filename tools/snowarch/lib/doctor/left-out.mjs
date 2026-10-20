// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C7 — the runner's wording for a check a caller left out by name.
 *
 * A LEAF, importing nothing, because two readers match on it: the runner writes it as a skip's detail, and the doctor
 * cache's writer looks for it to carry the check's last verdict over (`doctor-cache.mjs`). The cache module is on the
 * SessionStart banner's fast path, which must load as little as it can, so the constant lives here rather than in
 * `report-text.mjs` with the other skip reasons, which re-exports it.
 *
 * The SessionStart banner's run leaves out E-32, the one quick check that reads every covered file, and shows the
 * verdict `status` and `doctor --quick` cached instead.
 */
export const LEFT_OUT = 'left out of this run by name';
