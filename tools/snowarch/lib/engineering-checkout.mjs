// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C185a — is `root` the engineering checkout, where the maintainers' tools live?
 *
 * By the tree's shape: `tests/` and `.github/` are both present. A distribution install has neither, because neither
 * ships. This is not the version-based "development tree" the integrity check (E-32) uses: that asks whether the
 * version of record ends in `-dev`, and a release candidate installed from the distribution repository is neither a
 * `-dev` version nor an engineering checkout. The doctor's E-21, `docs family` and the distribution guard's named
 * exceptions ask this question, and only this function answers it.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function isEngineeringCheckout(root) {
  return existsSync(join(root, 'tests')) && existsSync(join(root, '.github'));
}
