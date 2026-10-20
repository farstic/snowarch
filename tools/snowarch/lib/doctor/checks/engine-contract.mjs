// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S02 — E-19…E-22: the contract, and the governing text that has to agree with it.
//
// Four checks, four calls into code that already exists: L03 (retired names), L02 (registration
// prefix), L06 (generated files) and B05's `checkContract` (the pin). The lint runs from the same
// context object CI builds — `packages/contract/lint/lib/context.mjs` — so a checkout the doctor
// clears is a checkout `npm run lint:contract` clears, on the same inputs, with the same findings.
//
// Why that matters more here than anywhere else: E-19's whole subject is a name that USED to be
// right. A doctor with its own copy of the retired list would eventually hold a different list
// from the ratchet, and the checkout would pass one and fail the other with no way to tell which
// was stale.
import { dirname, resolve } from 'node:path';
import { bootstrapOf, cliOf } from '../spell.mjs';
import { fileURLToPath } from 'node:url';

import * as l02 from '../../../../../packages/contract/lint/checks/l02-prefix.mjs';
import * as l03 from '../../../../../packages/contract/lint/checks/l03-retired.mjs';
import { buildLintContext, LintInputError } from '../../../../../packages/contract/lint/lib/context.mjs';
import { prefix } from '../../../../../packages/contract/lib/contract.mjs';
import { checkContract } from '../../steps/B05.mjs';
import { defineCheck } from '../registry.mjs';
import { isEngineeringCheckout } from '../../engineering-checkout.mjs';
import { restoreRemedy } from '../../licence/manifest.mjs';

import { fail, ok, skip } from './result.mjs';

/**
 * This code's own checkout, for `isSelfRoot`.
 *
 * L06 skips the two generators that take no `--root` unless the tree being linted IS the tree the
 * generators live in — they resolve from their own location, so against any other tree they would
 * check this repository and report a reassuring pass about a tree nobody asked about. Passing
 * `ctx.root` as the self root would make that claim true by construction, including for a fixture.
 * `fileURLToPath`, never `new URL(...).pathname`: the latter is `/C:/…` on Windows.
 */
export const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', '..');

/** The lint's inputs, built once per run. `null` when they cannot be read — with the reason. */
export function lintContextFor(ctx) {
  if (ctx._lint === undefined) {
    try {
      const built = buildLintContext({ root: ctx.root, selfRoot: ctx.selfRoot ?? SELF_ROOT });
      // A test plants a generator that crashes; the list has to reach the check that runs it.
      if (ctx.generators) built.generators = ctx.generators;
      ctx._lint = { ctx: built, error: null };
    } catch (e) {
      if (!(e instanceof LintInputError)) throw e;
      ctx._lint = { ctx: null, error: e.message };
    }
  }
  return ctx._lint;
}

const where = (f) => (f.line ? `${f.file}:${f.line}` : f.file);

/**
 * ARC-09-C185a — the contract, the pin and the lint's inputs are shipped files. In an install a wrong one is E-32's
 * business, and its remedy is E-32's; the build and the pin are maintainers' tools, named in the engineering checkout.
 * No command in an install: `doctor --fix` would list one under REFUSED while E-32's own restore is the action it runs.
 */
const repair = (ctx, maintainer) => (isEngineeringCheckout(ctx.root) ? maintainer : { remedy: restoreRemedy(cliOf(ctx)) });

/** One lint check, as a doctor result. `lines` shapes the findings a reader sees first. */
function runLint(ctx, check, { remedy, command, describe }) {
  const lint = lintContextFor(ctx);
  if (!lint.ctx) {
    return fail(`the lint inputs could not be read — ${lint.error}`, {
      ...repair(ctx, { remedy: 'run node scripts/build-dist.mjs, then re-run the doctor',
        command: 'node scripts/build-dist.mjs' }),
      data: { ran: false },
    });
  }
  const findings = check.run(lint.ctx);
  if (findings.length === 0) return ok(describe(lint.ctx), { ran: true, findings: 0 });
  const lines = findings.slice(0, 10).map((f) => `${where(f)} ${f.message}`);
  return fail(lines.join('; '), {
    remedy,
    ...(command ? { command } : {}),
    data: { ran: true, findings: findings.length, first: lines },
  });
}

/**
 * The four files whose only `mcp__…__` prefix must be the configured one.
 *
 * L02 already scans the whole tree, so E-20's extra job is to NAME these four when one diverges —
 * P-05 was three registration prefixes live at once, and "somewhere in the tree" is not a finding
 * anybody can act on.
 */
export const PREFIX_FILES = Object.freeze([
  '.claude/rules/00-mode-and-mcp-gate.md',
  'governance/mcp-protocols.md',
  '.claude/settings.json',
  '.mcp.json',
]);

export function engineContractChecks() {
  return [
    defineCheck({
      id: 'E-19',
      section: 'contract',
      title: 'no retired tool names',
      severity: 'fail',
      // ARC-09-C8 — `quick` is a COST contract: no process, no tree walk, no network, under
      // 50 ms on the slowest Windows cell. This one walks the tree for retired names — 137 ms locally, ~384 on Windows,
      // and the banner's re-run path pays it before a user's first word. It still runs on
      // every `./snowarch doctor`, and the cache the banner reads first is written by one.
      quick: false,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => runLint(ctx, l03, {
        remedy: 'replace with the snow_* name shown',
        describe: (lint) => `${Object.keys(lint.retiredNames).length} retired name(s), none in use`,
      }),
    }),

    defineCheck({
      id: 'E-20',
      section: 'contract',
      title: 'prefix consistency',
      severity: 'fail',
      // ARC-09-C8. The THIRD shared cost, and the same shape as the other two:
      // `buildLintContext` is built once and cached on the ctx, so whichever of E-19, E-20,
      // E-21 and E-22 runs first pays for all of them. Moving E-19 out put its 66 ms onto
      // E-20, measured — so the group moves, not a member of it.
      quick: false,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        const expected = prefix(ctx.config);
        const result = runLint(ctx, l02, {
          remedy: 'maintainer: npm run gen:governance',
          command: 'npm run gen:governance',
          describe: () => expected,
        });
        if (result.status === 'ok') return { ...result, data: { ...result.data, prefix: expected } };
        // The four files, named. L02's findings carry the file; this adds the ones a reader is
        // meant to look at first, in the order the gate, the protocol and the two registrations
        // are read.
        const lint = lintContextFor(ctx).ctx;
        const divergent = lint
          ? PREFIX_FILES.filter((f) => (l02.run(lint) ?? []).some((x) => x.file === f))
          : [];
        return { ...result, data: { ...result.data, prefix: expected, divergent } };
      },
    }),

    defineCheck({
      id: 'E-21',
      section: 'contract',
      title: 'generated files fresh',
      severity: 'fail',
      // Excluded from `--quick`, and honest about why: L06 runs every generator's own `--check`,
      // which is one Node process per generator. That is the cost being avoided, not the seconds.
      quick: false,
      network: false,
      spawns: true,
      fixable: false,
      run: async (ctx) => {
        // ARC-09-C185a — L06 runs every generator, and the generators are maintainers' tools that do not ship. Outside
        // the engineering checkout the generated files are what the signed manifest verifies (E-32), so this skips with
        // that reason. L06 is imported only here, behind the predicate: it imports scripts/lib/generators.mjs, which a
        // distribution install does not have, and a static import would stop the doctor loading before any skip ran.
        if (!isEngineeringCheckout(ctx.root)) {
          return skip("the generated files are verified by the signed manifest (E-32); their generators are maintainers' "
            + 'tools, run in the engineering checkout', { ran: false });
        }
        const l06 = await import('../../../../../packages/contract/lint/checks/l06-generated.mjs');
        const result = runLint(ctx, l06, {
          remedy: 'maintainer: npm run gen && node scripts/gen-docs-areas.mjs',
          command: 'npm run gen',
          describe: () => 'every generated file matches its generator',
        });
        // A generator that COULD NOT RUN is not a stale file. L06 says which, and a design-only
        // install — no `npm ci` there by design — is the case that made this necessary: the doctor
        // reported a crashing generator as "the README differs from generator output", which sent
        // a reader to regenerate a file that was correct. `skip` with the reason is the honest
        // answer; every other crash is already a finding, and stays a FAIL.
        const lint = lintContextFor(ctx).ctx;
        const notes = (lint?.skipNotes ?? []).filter((n) => n.startsWith('L06:'));
        if (result.status === 'ok' && notes.length > 0) {
          return skip(notes[0].replace(/^L06: /, ''), { ran: false, couldNotRun: notes.length });
        }
        return notes.length > 0
          ? { ...result, data: { ...result.data, couldNotRun: notes.length } }
          : result;
      },
    }),

    defineCheck({
      id: 'E-22',
      section: 'contract',
      title: 'contract pin',
      severity: 'fail',
      // ARC-09-C8. The THIRD shared cost, and the same shape as the other two:
      // `buildLintContext` is built once and cached on the ctx, so whichever of E-19, E-20,
      // E-21 and E-22 runs first pays for all of them. Moving E-19 out put its 66 ms onto
      // E-20, measured — so the group moves, not a member of it.
      quick: false,
      network: false,
      spawns: false,
      fixable: false,
      // B05's check, re-run. The bootstrap asks it once at install time; the doctor asks it again
      // on a checkout that has since been pulled, and the sentence a user reads is the same one.
      run: async (ctx) => {
        const lint = lintContextFor(ctx);
        if (!lint.ctx) {
          return fail(`the contract could not be read — ${lint.error}`, {
            ...repair(ctx, { remedy: 'node scripts/build-dist.mjs, then re-run the doctor',
              command: 'node scripts/build-dist.mjs' }),
            data: { ran: false },
          });
        }
        const problems = checkContract({ root: ctx.root, config: ctx.config, pin: lint.ctx.requiredTools });
        const pinned = String(lint.ctx.requiredTools.contractSha256 ?? '').slice(0, 12);
        const data = { pinned, required: (lint.ctx.requiredTools.tools ?? []).length,
          declared: (lint.ctx.contract.tools ?? []).length };
        return problems.length === 0
          ? ok(`${pinned}… · ${data.required} required of ${data.declared} declared`, data)
          : fail(problems.join(' '), {
            ...repair(ctx, { remedy: 'node packages/contract/pin.mjs, after reviewing the diff' }),
            data: { ...data, problems },
          });
      },
    }),
  ];
}
