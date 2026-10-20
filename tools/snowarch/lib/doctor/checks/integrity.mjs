// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C7 — E-32, the build's integrity: the files this release ships, against the manifest the owner signed for
// its tag.
//
// ARC-11-C141 — IN THE WORDS EVERY SURFACE USES. A tree that cannot be restored FAILs with "Integrity: cannot restore
// — <reason>" and the remedy, the two halves the banner, the launcher and the server print as one line (U7 joins them
// with " — " too). A modified tree FAILs fixable: `doctor --fix` puts the signed files back through the function the
// server, the launcher and the hook run (fix kind `integrity-restore`). The launcher restores before `doctor` runs,
// so through ./snowarch E-32 sees a change only when that restore could not run. A release tree with no manifest, or
// with another release's, FAILs as well, because deleting or swapping the manifest is the cheapest tamper (the
// architect's ruling, 2026-10-13). A development tree has none to check, and skips.
//
// QUICK, AND OFFLINE. It reads the cached manifest and hashes the covered files, about 7 ms warm on an Apple M3, with
// one bounded `git` call for the tag's commit; the manifest is fetched by the bootstrap and by `licence check
// --refresh`, never here. The SessionStart hook leaves it out of its doctor run by name: the hook runs the integrity
// function itself, on its stat key.
import { integrityLine, integrityStatus, restoreCommand, restoreRemedy } from '../../licence/manifest.mjs';
import { refusalOf, restoreBlocker } from '../../../../../packages/snowarch/dist/licence/integrity.js';
import { PRODUCT_KEYS } from '../../licence/keys.mjs';
import { localDir } from '../../local-paths.mjs';
import { defineCheck } from '../registry.mjs';
import { cliOf } from '../spell.mjs';
import { fail, ok, skip } from './result.mjs';

/** The checks this file registers. */
export function integrityChecks() {
  return [
    defineCheck({
      id: 'E-32',
      section: 'repo',
      title: "this release's files against its signed manifest",
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: true,
      run: async (ctx) => {
        // `licenceKeys` is the test seam E-31 has: a suite injects the keys it generated. Nothing in the product sets it.
        const s = integrityStatus(ctx.root, { keys: ctx.licenceKeys ?? PRODUCT_KEYS, local: localDir(ctx.root) });
        const data = { state: s.state, tag: s.tag ?? null, checked: s.checked ?? null,
          modified: s.modified ?? [], manifestTag: s.manifestTag ?? null };
        // `fixable` per finding: the report falls back to the declaration's `true` (report-json.mjs), and only a
        // modified tree has a repair on offer.
        if (s.state === 'dev') return { ...skip(integrityLine(s), data), fixable: false };
        if (s.state === 'verified') return { ...ok(integrityLine(s), data), fixable: false };
        const cli = cliOf(ctx);
        if (s.state === 'modified') {
          // ARC-09-C149 — the repair offered is the one that runs: the reason the restore would refuse with comes
          // first (no local release tag, a link that leaves the checkout), in the launcher's words.
          const blocked = restoreBlocker(ctx.root, s.tag, s.modified, { cli });
          if (blocked) return fail(`Integrity: cannot restore — ${blocked.reason}`, { data, fixable: false, remedy: blocked.remedy });
          return fail(integrityLine(s), {
            data: { ...data, fix: { kind: 'integrity-restore' } },
            fixable: true,
            remedy: restoreRemedy(cli),
            command: restoreCommand(cli),
          });
        }
        const { reason, remedy } = refusalOf(s, cli);
        const refetch = remedy.startsWith(`Run ${cli} licence check --refresh`);
        return fail(`Integrity: cannot restore — ${reason}`, {
          data, fixable: false, remedy, ...(refetch ? { command: `${cli} licence check --refresh` } : {}),
        });
      },
    }),
  ];
}
