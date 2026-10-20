// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S02 — E-12…E-16: the corpus, from `docsStatus()` and from nothing else.
//
// ARC-03-S06 exists so that "is the corpus present, pinned, on the right family, correctly sparse
// and fully cited" has ONE answer. These five checks assign ids, severities and remedies to that
// answer; not one of them re-derives a fact. That is why `docsStatus()` is called at most twice
// per run and memoised on the context — once without the citation walk for E-12…E-15, once with
// it for E-16 — rather than five times by five checks that would each pay for it.
//
// E-12 and E-16 are FAIL and never WARN or SKIP when the corpus is absent. The engine's whole
// claim is that its ServiceNow facts are grounded; reporting the failure of the thing the product
// is FOR as a note in the margin is the one report that would mislead an operator into shipping.
import { ALWAYS_DIRS, ROOT_FILES } from '../../docs/sync.mjs';
import { bootstrapOf, cliOf, spellFor } from '../spell.mjs';
import { docsStatus, E12_ABSENT, SPARSE } from '../../docs/status.mjs';
import { defineCheck } from '../registry.mjs';
import { isEngineeringCheckout } from '../../engineering-checkout.mjs';
import { restoreRemedy } from '../../licence/manifest.mjs';

import { fail, ok, skip } from './result.mjs';

/**
 * The corpus status, computed once per run per verification level.
 *
 * Memoised on the run context. Checks run sequentially in registry order, so E-12 pays for the
 * cheap read and E-16 for the citation walk, and the three between them pay nothing.
 */
export function docsFor(ctx, { verify = false } = {}) {
  const key = verify ? '_docsVerified' : '_docsPlain';
  if (!ctx[key]) {
    ctx[key] = (ctx.docsStatus ?? docsStatus)({ root: ctx.root, verify, measure: false });
  }
  return ctx[key];
}

/** Every corpus check but E-12 and E-16 says "see E-12" rather than repeating its diagnosis. */
const absent = () => skip('corpus absent — see E-12', { present: false });

export function engineDocsChecks() {
  return [
    defineCheck({
      id: 'E-12',
      section: 'docs',
      title: 'docs corpus present',
      severity: 'fail',
      // ARC-09-C8 — `quick` is a COST contract: no process, no tree walk, no network, under
      // 50 ms on the slowest Windows cell. This one `docsStatus` spawns git three times (rev-parse, branch, sparse) — 83 ms locally, ~231 on Windows,
      // and the banner's re-run path pays it before a user's first word. It still runs on
      // every `./snowarch doctor`, and the cache the banner reads first is written by one.
      quick: false,
      network: false,
      spawns: false,
      fixable: true,
      run: async (ctx) => {
        const s = docsFor(ctx);
        const mode = s.mode ?? 'skip';
        if (!s.present) {
          // The sentence is ARC-03-S11's, imported rather than retyped: the doctor, the status
          // skill and the docs command all print the same words, and a second copy here is a
          // second thing to keep in step.
          // ARC-07-C31 — THE CTX's SHELL, not the process, through the doctor's own `spellFor`:
          // this file already reads `cliOf(ctx)` and `bootstrapOf(ctx)` from that module, and
          // `spellFor` threads BOTH `platform` and `env` — `env` matters because `isWindowsShell`
          // reads SHELL and MSYSTEM, so a ctx with only a platform renders POSIX on any mac.
          const text = E12_ABSENT(mode, spellFor(ctx));
          return fail(text.replace(/^E-12 docs corpus: FAIL — /, ''), {
            remedy: `run ${cliOf(ctx)} docs sync`,
            command: `${cliOf(ctx)} docs sync`,
            data: { present: false, mode, fix: { kind: 'corpus-missing', mode } },
          });
        }
        // ADR-0008's Consequences say "ARC-03's doctor asserts corpus completeness", and until
        // ARC-03-C2 only half of that was true: E-15 checks the AREAS, and nothing checked the
        // files every corpus has. A corpus whose `LICENSE` or `llms.txt` was pruned by hand, or
        // lost to a half-finished checkout, passed every check in this file — present, on the pin,
        // on the family, correctly sparse, citations clean. The remedy is the same `docs sync`
        // that would have caught it, because `checkCompleteness` has always looked at this list;
        // it simply had no reader after the sync returned.
        //
        // Reported by E-12 rather than E-15 deliberately: these files are NOT part of the sparse
        // set — `LICENSE` and `llms.txt` are there at any cone — so failing a check named "sparse
        // set" on them would misname the defect. E-12 already reports a corpus that is on disk and
        // nonetheless wrong (the mode-says-skip case below), which is the same kind of statement.
        if (s.rootMissing?.length) {
          const names = s.rootMissing.join(', ');
          return fail(`the corpus is on disk but incomplete — missing ${names}`, {
            remedy: `run ${cliOf(ctx)} docs sync`,
            command: `${cliOf(ctx)} docs sync`,
            data: { present: true, mode, rootMissing: s.rootMissing,
              fix: { kind: 'corpus-missing', mode } },
          });
        }
        if (mode === 'skip') {
          // Present on disk while the recorded mode says the corpus was skipped: two records of
          // one fact that disagree. Which is right is not the doctor's to decide, so it reports
          // both and names the command that makes them agree.
          return fail('the corpus is on disk but the recorded docs mode is "skip"', {
            remedy: `run ${cliOf(ctx)} docs sync to record the corpus that is there`,
            command: `${cliOf(ctx)} docs sync`,
            data: { present: true, mode, fix: { kind: 'corpus-missing', mode } },
          });
        }
        return ok(`present (${mode}), ${ROOT_FILES.length + ALWAYS_DIRS.length} root entries`,
          { present: true, mode, path: s.path, rootMissing: [] });
      },
    }),

    defineCheck({
      id: 'E-13',
      section: 'docs',
      title: 'docs pin',
      severity: 'fail',
      // ARC-09-C8. Not its own cost: `docsFor` shares ONE `docsStatus` across E-12…E-15, and
      // that call spawns git three times (rev-parse, branch, sparse-checkout). Whichever of
      // them runs first pays it — moving only E-12 out shifted 143 ms onto E-13, measured —
      // so the contract applies to the GROUP that shares the cost, not to one member.
      quick: false,
      network: false,
      spawns: false,
      fixable: true,
      run: async (ctx) => {
        const s = docsFor(ctx);
        if (!s.present) return absent();
        const short = (sha) => (sha ? String(sha).slice(0, 7) : '—');
        const data = { pin: s.pin, gitlink: s.gitlink, head: s.head, staged: s.gitlinkStaged };
        // The two mismatches have different owners, so they have different remedies and different
        // `fixable`. A user can move their checkout onto the pin; only a maintainer moves the pin.
        if (s.pinMatchesGitlink === false) {
          return fail(`engine.config.json pin ${short(s.pin)} ≠ committed gitlink ${short(s.gitlink)}`
            + `${s.gitlinkStaged ? ' (gitlink staged, not yet committed)' : ''}`, {
            // ARC-09-C185a: moving the pin is the maintainer's, in the engineering checkout. In an install the pin and
            // the gitlink are both the release's, so a mismatch is a shipped file that is wrong: E-32's remedy.
            ...(isEngineeringCheckout(ctx.root)
              ? { remedy: `maintainer: node scripts/docs-bump.mjs --to ${s.gitlink}`,
                command: `node scripts/docs-bump.mjs --to ${s.gitlink}` }
              : { remedy: restoreRemedy(cliOf(ctx)) }),
            data: { ...data, fix: null },
          });
        }
        if (s.headMatchesPin === false) {
          return fail(`corpus HEAD ${short(s.head)} ≠ pin ${short(s.pin)}`, {
            remedy: `run ${cliOf(ctx)} docs sync`,
            command: `${cliOf(ctx)} docs sync`,
            data: { ...data, fix: { kind: 'head-off-pin' } },
          });
        }
        return ok(`${short(s.pin)} (HEAD, gitlink and pin agree)`, data);
      },
    }),

    defineCheck({
      id: 'E-14',
      section: 'docs',
      title: 'docs family',
      severity: 'fail',
      // ARC-09-C8. Not its own cost: `docsFor` shares ONE `docsStatus` across E-12…E-15, and
      // that call spawns git three times (rev-parse, branch, sparse-checkout). Whichever of
      // them runs first pays it — moving only E-12 out shifted 143 ms onto E-13, measured —
      // so the contract applies to the GROUP that shares the cost, not to one member.
      quick: false,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        const s = docsFor(ctx);
        if (!s.present) return absent();
        return s.familyMatches
          ? ok(s.family, { family: s.family, branch: s.branch })
          : fail(`corpus is on branch "${s.branch ?? 'unknown'}", not the configured family `
            + `"${s.family}"`, {
            remedy: `run ${cliOf(ctx)} docs sync`,
            command: `${cliOf(ctx)} docs sync`,
            data: { family: s.family, branch: s.branch },
          });
      },
    }),

    defineCheck({
      id: 'E-15',
      section: 'docs',
      title: 'sparse set',
      severity: 'fail',
      // ARC-09-C8. Not its own cost: `docsFor` shares ONE `docsStatus` across E-12…E-15, and
      // that call spawns git three times (rev-parse, branch, sparse-checkout). Whichever of
      // them runs first pays it — moving only E-12 out shifted 143 ms onto E-13, measured —
      // so the contract applies to the GROUP that shares the cost, not to one member.
      quick: false,
      network: false,
      spawns: false,
      fixable: true,
      run: async (ctx) => {
        const s = docsFor(ctx);
        if (!s.present) return absent();
        const problems = [];
        // `pattern` is the shape git 2.25–2.34 stored when it did not understand `--cone`; it
        // works, but it is not what the engine writes, and a checkout in that shape is one whose
        // area list nobody can reason about.
        // `SPARSE`, not the two words: `full` is a name the contract owns, and a literal copy of
        // it here is a second definition for ARC-05-S10's scan to find (it did).
        if (![SPARSE.cone, SPARSE.full].includes(s.sparse)) {
          problems.push(`sparse checkout is "${s.sparse}"`);
        }
        if (s.areasMissing.length > 0) {
          problems.push(`${s.areasMissing.length} area(s) missing: ${s.areasMissing.slice(0, 6).join(', ')}`);
        }
        const data = { sparse: s.sparse, areas: s.areasPresent.length,
          missing: s.areasMissing, fix: { kind: 'sparse-mismatch' } };
        return problems.length === 0
          ? ok(`${s.sparse} · ${s.areasPresent.length} area(s)`, data)
          : fail(problems.join('; '), {
            remedy: `run ${cliOf(ctx)} docs sync`,
            command: `${cliOf(ctx)} docs sync`,
            data,
          });
      },
    }),

    defineCheck({
      id: 'E-16',
      section: 'docs',
      title: 'citations',
      severity: 'fail',
      // Excluded from `--quick`: the walk over every citation in every skill is ~0.5–1 s, which is
      // most of the quick budget for one answer that changes only when a skill or the corpus does.
      quick: false,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        const s = docsFor(ctx, { verify: true });
        const c = s.citations ?? { checked: 0, dead: [] };
        if (!s.present) {
          return fail('citations unverifiable — corpus absent (see E-12)', {
            remedy: `run ${cliOf(ctx)} docs sync`,
            command: `${cliOf(ctx)} docs sync`,
            data: { checked: 0, dead: 0, present: false },
          });
        }
        if (c.dead.length === 0) return ok(`checked: ${c.checked} | dead: 0`, { checked: c.checked, dead: 0 });
        const lines = c.dead.slice(0, 10)
          .map((d) => `${d.file}:${d.line} → ${d.path}`);
        return fail(`${c.dead.length} dead citation(s): ${lines.join('; ')}`, {
          remedy: `maintainer: fix the citation; users: ${cliOf(ctx)} docs sync`,
          data: { checked: c.checked, dead: c.dead.length, first: lines },
        });
      },
    }),
  ];
}
