// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S02 — E-00…E-04: what has to be on the machine before anything else can be true.
//
// Three of the five are the bootstrap's own preflight, re-asked. That is deliberate and it is why
// they IMPORT B00 rather than re-checking: `./bootstrap.sh` and `./snowarch doctor` must never
// disagree about whether git is old, and two implementations of "is git old" is exactly how they
// would come to. What the doctor adds is that it asks again, later, on a machine that has since
// changed — a Node upgrade, a `claude` logout, a PATH the shell profile no longer exports.
//
// E-04 is the odd one: `severity: info`. Its subject is what the machine can PRODUCE — Word
// documents, rendered diagrams, PDF proofs — and none of that is required for the engine to work.
// A missing draw.io is a fact for whoever is about to author a client deliverable, not a fault in
// the install, so it never reaches `warn` and can never fail a run.
import { existsSync } from 'node:fs';

import { checkClaudeCode, checkGit, makeExec } from '../../steps/B00.mjs';
import { loadState, loadStateOrReason } from '../../state.mjs';
import { meetsFloor, formatVersion } from '../../versions.mjs';
import { which } from '../../which.mjs';
import { defineCheck } from '../registry.mjs';

import { fail, fromStep, ok } from './result.mjs';
import { spellFor } from '../spell.mjs';

/**
 * draw.io Desktop, in the order `scripts/render-drawio.sh` looks for it.
 *
 * Ported, not re-derived: the renderer's list is the definition of "the engine can render a
 * diagram", and a doctor that reported `yes` from a different list would be answering a question
 * nobody asked. The Windows candidates come from `scripts/render-diagrams.ps1` — note the real
 * file is `render-diagrams.ps1`, not the `render-drawio.ps1` that `01` §13 names.
 */
export const DRAWIO_CANDIDATES = Object.freeze({
  posix: [
    '/Applications/draw.io.app/Contents/MacOS/draw.io',
    '/Applications/drawio.app/Contents/MacOS/drawio',
    '/usr/bin/drawio',
  ],
  win32: [
    'C:\\Program Files\\draw.io\\draw.io.exe',
    'C:\\Program Files (x86)\\draw.io\\draw.io.exe',
  ],
});

/** LibreOffice, per `scripts/render-pdf.sh`. On Windows the PDF proof is Word (`render-pdf-pages.ps1`). */
export const SOFFICE_CANDIDATES = Object.freeze([
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
]);

/** The first of `names` on PATH, then the first existing absolute candidate. `null` when neither. */
function locate(names, candidates, { env, platform, exists = existsSync }) {
  for (const name of names) {
    const found = which(name, { env, platform });
    if (found) return found;
  }
  for (const candidate of candidates) if (exists(candidate)) return candidate;
  return null;
}

/**
 * The four capability packs, as `yes (<how>)` / `no`.
 *
 * Exported so the test can assert the shape without spawning anything, and so S09 can render the
 * same four names the setup skill prints.
 */
export function capabilityPacks({ env = process.env, platform = process.platform,
  exists = undefined } = {}) {
  exists = exists ?? existsSync;
  const win = platform === 'win32';
  // The docx converter is Python on POSIX and PowerShell on Windows — `scripts/md-to-docx.py` and
  // `scripts/md-to-docx.ps1`, which is why the two branches look for different things.
  const docx = win
    ? locate(['powershell', 'pwsh'], [], { env, platform, exists })
    : locate(['python3'], [], { env, platform, exists });
  const pdf = win
    ? locate(['powershell', 'pwsh'], [], { env, platform, exists })
    : locate(['soffice'], SOFFICE_CANDIDATES, { env, platform, exists });
  const drawio = locate(['drawio', 'draw.io'],
    win ? DRAWIO_CANDIDATES.win32 : DRAWIO_CANDIDATES.posix, { env, platform, exists });
  const mermaid = locate(['mmdc'], [], { env, platform, exists });
  return {
    docx: { how: docx, need: win ? 'PowerShell 5.1+' : 'python3' },
    pdf: { how: pdf, need: win ? 'Word (render-pdf-pages.ps1)' : 'LibreOffice (soffice)' },
    drawio: { how: drawio, need: 'draw.io Desktop' },
    mermaid: { how: mermaid, need: '@mermaid-js/mermaid-cli (mmdc)' },
  };
}

const packLine = (name, pack) => `${name} ${pack.how ? 'yes' : 'no'}`;

/**
 * The recorded mode, or the REASON it could not be read — ARC-07-C37.
 *
 * `live` when the recorded mode says so; anything else — including no state at all — is design-only,
 * and `reason` is non-null only when the file EXISTS and could not be read.
 *
 * ARC-07-C31 rethrew a `TypeError` here by hand, because finding this call site is what cost a
 * sitting: the call goes through the injected default and reads `load(root)`, so it was invisible to
 * a grep for `loadState(`, and the `catch` turned a missing argument into a silent `null` that only a
 * behavioural assertion two files away noticed. C37 moves that rule into `loadStateOrReason`, where
 * the next site written gets it for free instead of having to remember.
 *
 * It returns a PAIR rather than a mode, because the swallowing was only half the defect: E-03 turns
 * a missing npm into a `warn` in design-only and a `fail` in live, so a mode it could not read is a
 * mode it must not assume. The caller decides what to say; this says what happened.
 */
export function recordedMode(root, spell, { load = loadState } = {}) {
  const { state, reason } = loadStateOrReason(root, spell, { load });
  return { mode: state?.mode ?? null, reason };
}

export function enginePrereqChecks() {
  return [
    defineCheck({
      id: 'E-00',
      section: 'prereqs',
      title: 'Claude Code CLI',
      severity: 'fail',
      quick: false,
      network: false,
      spawns: true,
      fixable: false,
      // B00's probe, verbatim: the version floor, then `claude auth status` only when the
      // installed CLI advertises it. What "logged in" means is Claude Code's own answer, and if a
      // future release stops answering, the sentence degrades to "login: not verified" in ONE
      // place rather than in the bootstrap and the doctor separately.
      run: async (ctx) => {
        const exec = ctx.exec ?? makeExec({ env: ctx.env, plat: ctx.platform });
        const result = checkClaudeCode({ exec, floors: ctx.config.floors, plat: ctx.platform,
          skip: false });
        return fromStep(result, { floor: ctx.config.floors.claudeCode });
      },
    }),

    defineCheck({
      id: 'E-01',
      section: 'prereqs',
      title: 'git',
      severity: 'fail',
      quick: true,
      // `git` is the one child a quick check may spawn: every path in this report is resolved
      // through it, so a doctor that avoided it would be avoiding its own subject.
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        const exec = ctx.exec ?? makeExec({ env: ctx.env, plat: ctx.platform });
        return fromStep(checkGit({ exec, floors: ctx.config.floors, plat: ctx.platform }),
          { floor: ctx.config.floors.git });
      },
    }),

    defineCheck({
      id: 'E-02',
      section: 'prereqs',
      title: 'Node.js',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      // The doctor is RUNNING, so this is not a presence check — the command already exited 3 if
      // Node were below the floor. The row exists so the old D-numbered mapping table (S07) has
      // something to point at, and so a report read on its own says which Node produced it.
      run: async (ctx) => {
        const floor = ctx.config.floors.node;
        const version = ctx.nodeVersion ?? process.versions.node;
        const { ok: passes, found } = meetsFloor(version, floor);
        const data = { version, floor };
        return passes
          ? ok(`${formatVersion(found) ?? version} (floor ${floor})`, data)
          : fail(`Node ${version} is below the floor ${floor}`, {
            remedy: 'install Node 20+ (macOS: brew install node@22 · '
              + 'Windows: winget install OpenJS.NodeJS.LTS · Linux: your distribution or nvm)',
            data,
          });
      },
    }),

    defineCheck({
      id: 'E-03',
      section: 'prereqs',
      title: 'npm',
      severity: 'fail',
      quick: false,
      network: false,
      spawns: true,
      fixable: false,
      // Absent npm is a WARN in design-only and a FAIL in live mode, because the two modes need
      // different things from it: design-only never installs the server, and live cannot be
      // installed without it. Same fact, two consequences — so the mode is read, not assumed.
      run: async (ctx) => {
        const exec = ctx.exec ?? makeExec({ env: ctx.env, plat: ctx.platform });
        const recorded = ctx.mode === undefined || ctx.mode === null
          ? recordedMode(ctx.root, spellFor(ctx))
          : { mode: ctx.mode, reason: null };
        const { mode, reason } = recorded;
        const r = exec('npm', ['--version']);
        if (r.found && r.ok) return ok(r.stdout.trim(), { version: r.stdout.trim(), mode });
        const detail = r.found
          ? `npm found but did not answer --version: ${(r.stderr || '').trim().split('\n')[0]}`
          : 'npm not found on PATH';
        /*
         * ARC-09-C68 — TWO CAUSES, TWO REMEDIES, and the single one used to blame a healthy machine.
         *
         * A colleague's Windows 11 run reported `'C:\Program' is not recognized as an internal or
         * external command` here — our own quoting defect, C67's — and told them to install Node.js,
         * on a machine where B00 had already reported `npm present` and B04's `npm ci` had succeeded.
         * "npm is missing" and "npm is here and our call to it failed" are different facts, and the
         * second one is ours to own: the remedy now hands over the exact command to try, so a reader
         * can tell in one step which of the two it is rather than reinstalling a working toolchain.
         */
        const remedy = r.found
          ? `run ${r.bin ? `"${r.bin}"` : 'npm'} --version in a terminal — if that answers, this `
            + 'check is at fault rather than your installation, and the doctor wants the output'
          : 'install Node.js from nodejs.org (bundles npm)';
        if (mode === 'live') return fail(detail, { remedy, data: { mode } });
        // ARC-07-C37 — A MODE THAT COULD NOT BE READ IS NOT design-only, and this branch is where the
        // difference reaches a reader. Absent npm is a `warn` in design-only and a `fail` in live, so
        // swallowing an unreadable state into `null` downgraded a real failure and said nothing about
        // why. The status stays a `warn` — claiming `fail` on a mode nobody could read would be the
        // same guess in the other direction — but the sentence now names the uncertainty and points at
        // the check that owns the file, so an operator running `--section prereqs` alone is not left
        // with a confident "needed only for live mode".
        if (reason) {
          return { status: 'warn', remedy, data: { mode, stateUnreadable: reason },
            detail: `${detail} — the recorded mode could not be read, so this may be a failure rather `
              + 'than a warning (see E-11)' };
        }
        return { status: 'warn', detail: `${detail} — needed only for live mode`, remedy,
          data: { mode } };
      },
    }),

    defineCheck({
      id: 'E-04',
      section: 'prereqs',
      title: 'capability packs',
      severity: 'info',
      quick: false,
      network: false,
      spawns: true,
      fixable: false,
      // Never `warn`, never `fail`: see the file header. The hints are install lines, not remedies
      // — nothing here is broken.
      run: async (ctx) => {
        // `exists` is injectable for the same reason `exec` is: the machine running the tests is
        // not the machine being diagnosed, and a fixture that asked the host whether draw.io is
        // installed would assert this laptop rather than the check.
        const packs = capabilityPacks({ env: ctx.env, platform: ctx.platform, exists: ctx.exists });
        const detail = ['docx', 'pdf', 'drawio', 'mermaid']
          .map((name) => packLine(name, packs[name])).join(' · ');
        const missing = Object.entries(packs).filter(([, p]) => !p.how).map(([n]) => n);
        return ok(detail, {
          packs: Object.fromEntries(Object.entries(packs)
            .map(([name, p]) => [name, { present: Boolean(p.how), how: p.how, need: p.need }])),
          missing,
          hint: missing.length === 0 ? null
            : (ctx.platform === 'win32'
              ? 'winget install drawio.drawio · winget install TheDocumentFoundation.LibreOffice'
              : 'brew install --cask drawio libreoffice'),
        });
      },
    }),
  ];
}
