// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S03 — E-25, E-26, E-27: facts about the MACHINE, not about the checkout.
//
// Read-only, like `legacy.mjs`, and for the same reason: a cloud-sync folder, a proxy variable and
// a Claude Code approval are all things the user chose. The doctor reports them and names the
// command; it never moves a checkout, edits a shell profile or clicks an approval.
//
// E-26 says "as seen by this shell" out loud. Whether the environment the doctor sees is the
// environment Claude Code's spawned server sees is spike S-20 (`03` §A), and until that is
// answered a check that said "the server has no proxy" would be asserting something nobody has
// measured. Saying which environment was inspected costs one clause and is true today.
import { execFileSync } from 'node:child_process';
import { bootstrapOf, cliOf } from '../spell.mjs';
import { existsSync, readFileSync } from 'node:fs';

import { cloudSyncProvider } from '../../cloud-sync.mjs';
import { maskProxy } from '../../net-sentences.mjs';
import { get as claudeGet, resolveClaude } from '../../registration-claude.mjs';
import { loadStateOrReason } from '../../state.mjs';
import { remedyFor } from '../../../../../packages/contract/lib/contract.mjs';
import { NO_PROMPT_ENV } from '../../spawn-env.mjs';
import { TIMED_OUT } from '../../probe-net.mjs';
import { defineCheck } from '../registry.mjs';

import { fail, ok, skip, warn } from './result.mjs';
import { spellFor } from '../spell.mjs';

/** The four variables, in both spellings. POSIX tools read either; Windows sets the upper form. */
export const PROXY_VARS = Object.freeze([
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS',
]);

export const PEM_HEADER = '-----BEGIN CERTIFICATE-----';

/** The value of `name` in either case, with the name that carried it. */
export function readVar(env, name) {
  for (const key of [name, name.toLowerCase()]) {
    if (Object.hasOwn(env, key)) return { key, value: env[key] };
  }
  return null;
}

/**
 * The status strings `claude mcp get` prints, quoted from the S-01 record.
 *
 * `docs/spikes/S-01-preseeded-approval/README.md` recorded them character for character on two
 * Claude Code versions (2.1.214 and 2.1.258). They are Claude Code's words, not ours (`03` R-13),
 * so anything unrecognised degrades to "could not read registration status" — a WARN — rather than
 * a confident wrong answer.
 */
export const STATUS_PATTERNS = Object.freeze([
  { kind: 'rejected', approved: false, match: /Rejected/i },
  { kind: 'pending', approved: false, match: /Pending approval/i },
  { kind: 'approved', approved: true, match: /Connected|Approved|^\s*[✔✓]/i },
]);

export function classifyStatus(statusLine) {
  const text = String(statusLine ?? '');
  if (text.trim() === '') return { kind: 'unknown', approved: null };
  for (const p of STATUS_PATTERNS) if (p.match.test(text)) return { kind: p.kind, approved: p.approved };
  return { kind: 'unknown', approved: null };
}

/** The certificate bundle, as far as a file can be inspected without parsing it. */
export function inspectCa(path) {
  if (!existsSync(path)) return { ok: false, reason: 'the file does not exist' };
  try {
    const head = readFileSync(path, 'utf8').slice(0, 4096);
    return head.includes(PEM_HEADER)
      ? { ok: true, reason: null }
      : { ok: false, reason: `no ${PEM_HEADER} block in the first 4 KB` };
  } catch (e) {
    return { ok: false, reason: `it cannot be read (${e.message})` };
  }
}

export function hostChecks() {
  return [
    defineCheck({
      id: 'E-25',
      section: 'host',
      title: 'cloud-sync folder',
      severity: 'warn',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      // `cloudSyncProvider` is ARC-06-S05's, which answers to
      // `packages/snowarch/tests/fixtures/cloud-sync-paths.json` — the one list the server's
      // detector, the bootstrap's warning and this check all answer to (ARC-07-S07). A second
      // implementation here would be a fourth answer to a question with one right one.
      run: async (ctx) => {
        // ARC-08-C2: `ctx.env` is passed, and E-25 had it all along without looking at it. On a
        // Windows machine with Known Folder Move the path names no provider and `%OneDrive%` is
        // the only detector there is.
        const provider = cloudSyncProvider(ctx.root, { env: ctx.env });
        if (!provider) return ok('not under a cloud-sync folder', { provider: null });
        // Reported in design-only too: `clients/` holds engagement content, and a synced folder
        // copies that as readily as it copies a credential file.
        return warn(`checkout is under a cloud-sync folder (${provider}) — `
          + '.local/instances.json (0600) will still be synced; move the checkout outside the '
          + 'synced tree or keep this instance read-only', {
          remedy: 'move the checkout to a local path such as ~/work/ (D-04)',
          data: { provider },
        });
      },
    }),

    defineCheck({
      id: 'E-26',
      section: 'host',
      title: 'proxy and CA environment',
      severity: 'warn',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        const env = ctx.env ?? {};
        const seen = [];
        const problems = [];
        const data = { vars: {}, seenBy: 'this shell' };

        for (const name of PROXY_VARS) {
          const found = readVar(env, name);
          if (!found) continue;
          const { key, value } = found;
          if (String(value) === '') {
            // An empty proxy variable is not "no proxy": every library treats it differently, and
            // the server treats it as unset. Saying so is the only way a user learns the variable
            // they exported is doing nothing.
            problems.push(`${key} is set to an empty string — treated as unset by the server; `
              + 'unset it to silence this');
            data.vars[key] = '';
            continue;
          }
          const shown = name === 'NODE_EXTRA_CA_CERTS' ? String(value) : maskProxy(String(value));
          seen.push(`${key}=${shown}`);
          data.vars[key] = shown;
          if (name === 'NODE_EXTRA_CA_CERTS') {
            const ca = inspectCa(String(value));
            if (!ca.ok) {
              problems.push(`NODE_EXTRA_CA_CERTS points at a file where ${ca.reason} — `
                + 'see "Corporate networks" in docs/MODES-AND-PRESETS.md');
            }
          }
        }

        // SV-04 (ARC-08-S04) classifies a live network failure. When that ran in the same report,
        // its code is echoed here with the contract's remedy, so the host section and the server
        // section cannot give different advice about one failure.
        const code = ctx.networkCode ?? null;
        if (code) {
          // ARC-07-C32 — the ctx's shell, so a contract remedy quoted here spells what this reader
          // can type. `spellFor` carries both platform and env.
          const entry = ctx.contract ? remedyFor(ctx.contract, code, spellFor(ctx)) : null;
          problems.push(`the live probe reported ${code}${entry ? ` — ${entry.remedy}` : ''}`);
          data.networkCode = code;
        }

        if (problems.length > 0) {
          return warn(`${problems.join('; ')} (as seen by this shell)`, {
            remedy: 'unset or correct the variable in the shell that starts claude',
            data,
          });
        }
        return seen.length === 0
          ? ok('no proxy configured', data)
          : ok(`${seen.join(' · ')} (as seen by this shell)`, data);
      },
    }),

    defineCheck({
      id: 'E-27',
      section: 'host',
      title: 'Claude Code registration status',
      severity: 'warn',
      quick: true,
      network: false,
      // It runs `claude`, so `--quick` never selects it however fast it is: the cost being avoided
      // is the process.
      spawns: true,
      // Never fixable: the toggle is E-10's (and S06's), and the approval click is the user's.
      fixable: false,
      // AND: this check makes Claude Code run. The doctor writes nothing itself, but `claude mcp
      // get` is Claude Code touching its OWN configuration, and a real CLI rewrites `~/.claude.json`
      // while answering — measured on a redirected HOME. So "the file is unchanged after a doctor
      // run" is E-23's promise about THIS product, and it holds for `--section legacy` and for
      // `--quick` (which excludes this check), not for a full run against an installed CLI. The
      // detail says so rather than leaving a reader to discover a changed mtime and mistrust the
      // report.
      run: async (ctx) => {
        const claudePath = ctx.claudePath === undefined
          ? resolveClaude({ env: ctx.env, platform: ctx.platform })
          : ctx.claudePath;
        if (!claudePath) return skip('claude CLI not found (see E-00)', { statusLine: null });

        const serverKey = ctx.config?.mcp?.serverKey;
        const entry = claudeGet(serverKey, { root: ctx.root, claudePath, env: ctx.env,
          ...(ctx.exec ? { exec: ctx.exec } : {}) });
        const statusLine = entry.status ?? null;
        const { kind, approved } = classifyStatus(statusLine);
        const { state, reason: stateUnreadable } = loadStateOrReason(ctx.root, spellFor(ctx));
        const live = state?.mode === 'live';
        const data = { statusLine, scope: entry.scope ?? null, approved,
          registration: state?.registration ?? null, mode: state?.mode ?? null,
          ...(stateUnreadable ? { stateUnreadable } : {}) };

        // ARC-07-C37 — EVERY SENTENCE BELOW COMPARES THE REGISTRATION TO THE RECORDED MODE, so a mode
        // that could not be read makes all of them guesses. Measured on a tree with an unreadable
        // state file: this check reported `ok — project entry present, disabled in design mode
        // (expected)`, which is a checkout described as healthier than it is, in the one section
        // (`host`) where E-11 is not there to say otherwise. `--section host` said nothing at all.
        //
        // The registration itself WAS measured, so it is still reported; what is dropped is every
        // claim about the mode. A `warn` rather than a `fail` because nothing here is known to be
        // wrong — the check simply cannot answer its question, and E-11 owns the file.
        if (stateUnreadable) {
          return warn(`registration reads "${statusLine ?? 'no status'}", but the recorded mode could `
            + 'not be read, so whether that is right for this checkout is unknown (see E-11)', {
            remedy: `${cliOf(ctx)} bootstrap --reset   (rewrites .local/bootstrap-state.json)`,
            data,
          });
        }

        if (!entry.found || kind === 'unknown') {
          // The format is Claude Code's, not ours (`03` R-13): a wording change must degrade to a
          // WARN a reader can act on, never to a confident FAIL about a healthy install.
          const reason = entry.reason ?? (statusLine ? `unrecognised status "${statusLine}"`
            : 'no entry reported');
          return warn(`could not read registration status: ${String(reason).split('\n')[0]}`, {
            remedy: `check it by hand: claude mcp get ${serverKey}`,
            command: `claude mcp get ${serverKey}`,
            data,
          });
        }

        // Design-only expects the ONE string the S-01 record measured for a disabled server:
        // `✘ Rejected (see disabledMcpjsonServers in settings)`. "Pending approval" is not it —
        // that record also found that `enabledMcpjsonServers` is not honoured before trust, so a
        // pending status in design-only means the disable toggle is not in force.
        if (!live && kind !== 'rejected') {
          // ARC-06 (Sitting A) — a USER- or LOCAL-scope entry that is NOT rejected makes this a
          // FAIL, not a warning. `disabledMcpjsonServers` governs `.mcp.json` and nothing else, so
          // an entry in `~/.claude.json` keeps the server connected — in every project, for user
          // scope — while the Mode line says design-only. The owner watched `/mcp` list
          // `servicenow ✔ connected · 5 tools` under User MCPs after `mode design` reported success.
          // A project-scope entry in this state stays a WARN: the toggle covers it, so something
          // local went wrong rather than the mode being untrue of the machine.
          if (entry.scope === 'user' || entry.scope === 'local') {
            return fail(`design-only is not in force: a ${entry.scope}-scope entry keeps the server `
              + `loaded${entry.scope === 'user' ? ' in every project on this machine' : ''}`, {
              remedy: `${cliOf(ctx)} mode design   (removes an entry snowarch created), or: `
                + `claude mcp remove ${serverKey} -s ${entry.scope}`,
              data,
            });
          }
          // Sitting A: the remedy used to be `./snowarch mode design` whatever the registration was,
          // printed twice because `remedy` and `command` carried the same string. For a LOCAL
          // registration it cannot work: `--register` defaults to "unchanged", so `mode design`
          // rewrites the toggles and leaves the `claude mcp` entry exactly where it was — the very
          // entry that keeps the server visible. The scope decides the sentence, and it is said once.
          const remedy = entry.scope === 'local'
            ? `${cliOf(ctx)} mode design --register project   (or: claude mcp remove `
              + `${serverKey} -s local)`
            : `${cliOf(ctx)} mode design`;
          return warn('server is not disabled in Claude Code although the recorded mode is '
            + 'design-only', { remedy, data });
        }
        if (live && approved !== true) {
          return warn(`server is ${kind === 'rejected' ? 'rejected' : 'unapproved'} in Claude Code `
            + 'although the recorded mode is live', {
            remedy: `${cliOf(ctx)} mode live, then answer Yes once in claude (S-01)`,
            command: `${cliOf(ctx)} mode live`,
            data,
          });
        }
        // ARC-08 (Sitting A) — OUR words for the state, not Claude's raw status.
        //
        // This line used to read `✘ Rejected (see disabledMcpjsonServers in settings)` inside an
        // `ok`, which is a failure symbol reported as a success. The raw text stays in `data` for
        // `--json`, where a machine reads it and a person does not.
        const expected = !live && kind === 'rejected'
          ? 'project entry present, disabled in design mode (expected)'
          : statusLine;
        const scopeNote = entry.scope === 'local'
          ? ` · scope local (${state?.registration ?? 'registration not recorded'})`
          : '';
        return ok(`${expected}${scopeNote} · read by running claude, which maintains its own `
          + 'configuration file', data);
      },
    }),

    /**
     * E-28 — is this checkout on the newest release?
     *
     * The one check in the engine that goes to the NETWORK for a reason other than reaching a
     * ServiceNow instance, and the only one that writes a file outside the report: it refreshes
     * `.local/upgrade-check.json`, which is what the SessionStart banner reads. The banner cannot
     * fetch — it has a 300 ms budget and may run on a machine with no Node — so something else has
     * to, and a doctor run the user started is the honest place for it.
     *
     * Rate-limited to once a day. A doctor run is not rare, and `git ls-remote` against a remote
     * that is slow or behind a proxy is not free; the cache says when it was last asked, and
     * `needsRefresh` is the whole of the policy.
     *
     * `--quick` never selects it and `--no-network` skips it, both by the flags rather than by an
     * `if` in the body: the runner's rules are the rules.
     */
    defineCheck({
      id: 'E-28',
      section: 'host',
      title: 'release currency',
      severity: 'warn',
      quick: false,
      network: true,
      spawns: true,
      fixable: false,
      // ARC-09-C32 fix-up: this check has an offline answer — the cache — and `--no-network` is
      // exactly when a user most wants to know what the last check found. It stays out of
      // `--quick`, which is a cost contract about spawning rather than about the network.
      offline: true,
      run: async (ctx) => {
        const { needsRefresh, readUpgradeCheck, writeUpgradeCheck } =
          await import('../../upgrade-check.mjs');
        // ARC-09-C47 — the same parser `sortTags` uses below, so "is this a prerelease?" has one
        // answer in this file rather than a second regex that could disagree with the first.
        const { parseSemver } = await import('../../commands/upgrade.mjs');
        const cached = readUpgradeCheck(ctx.root);
        // ARC-09-C31. `ctx.now()` is EPOCH MILLISECONDS (the contract is stated where the context
        // is built); `upgrade-check.mjs` wants a `Date`, and its own default supplies one. This
        // used to be `ctx.now ?? (() => new Date())` — which reads as a sensible fallback and is
        // the bug: with the runner's real `ctx.now` the check handed a NUMBER to code that calls
        // `.toISOString()` and `.getTime()` on it, so the check crashed on any networked run with
        // either a release tag to compare against or a cache from a previous one.
        const now = () => new Date(ctx.now ? ctx.now() : Date.now());
        // The doctor passes its flags as `ctx.flags` (doctor/index.mjs), as server.mjs reads them. This read
        // `ctx.noNetwork`, which the doctor never sets, so `--no-network` still ran `ls-remote` (ARC-09-C185a).
        const noNetwork = ctx.flags?.noNetwork === true;

        // ARC-09-C47 — IS THIS RECORD EVIDENCE ABOUT CURRENCY? Three ways it is not, and each
        // catches a different sighting from the owner's sitting. Only the third works on a record
        // written by a build that predates this check.
        // This tree's exact release tag, asked once: rule 2 below and ARC-09-C210's rule read it. Never under
        // `--no-network`, whose contract is that the check spawns nothing.
        const here = cached && !noNetwork ? describeExact(ctx.root, ctx.exec) : null;
        const notCurrency = (() => {
          if (!cached) return null;
          // 1. An upgrade wrote it. It knows which tag it moved to and never asked what exists.
          if (cached.source === 'upgrade') {
            return "the last record is an upgrade's, not a currency check";
          }
          // 2. It describes a tree this one is not: the interrupted rc.5 -> rc.6 upgrade left
          //    `localTag: v2.0.0-rc.5` on a tree at rc.6. `describeExact` answers null when HEAD
          //    is not exactly on a tag, and then this says nothing rather than guessing.
          //
          //    NOT UNDER `--no-network`. That flag's contract is that the check spawns nothing —
          //    `tests/doctor/release-currency.test.mjs` asserts it — and `git describe` is a
          //    spawn even though it is local. Offline keeps checks 1 and 3, which are pure reads
          //    of the record, and says nothing about a disagreement it did not look for.
          if (cached.localTag && here && cached.localTag !== here) {
            return `stale record from an interrupted upgrade (it describes ${cached.localTag}, `
              + `this tree is ${here})`;
          }
          // 3. Its `latestTag` is a PRERELEASE, which this check's own live rule never stores.
          //    So the record cannot be a currency measurement, whoever wrote it and whether or
          //    not they stamped a source.
          if (cached.latestTag && parseSemver(cached.latestTag)?.pre) {
            return `the last record names a prerelease (${cached.latestTag}), which a currency `
              + 'check never stores';
          }
          return null;
        })();

        if (noNetwork) {
          // ARC-09-C47 — a record that is not a currency measurement cannot answer offline
          // either. Say which one was found rather than reading a verdict out of it.
          if (notCurrency) return skip(`--no-network; ${notCurrency}`);
          // ARC-09-C32. THREE cases, not two, and the third only exists because this chore starts
          // caching the empty outcome: a cache with `latestTag: null` means a check RAN and found
          // no releases. Branching on `latestTag` being truthy — as this did — would report that as
          // "nothing has been checked yet", turning a true statement into a false one.
          if (!cached?.checkedAt) return skip('--no-network, and nothing has been checked yet');
          return skip(cached.latestTag
            ? `--no-network; the last check (${cached.checkedAt}) saw ${cached.latestTag}`
            : `--no-network; the last check (${cached.checkedAt}) found no release tags`);
        }

        if (!notCurrency && !needsRefresh(cached, { now })) {
          // ARC-09-C32. A cached run that found NO release is a skip, not an "ok". The `?? 'no tag'`
          // below used to answer it, and `up to date (no tag)` claims currency with something that
          // does not exist. PAST TENSE on purpose: the live branch says what it sees now
          // (`advertises`), this says what the cache remembers (`advertised`), and the stamp says
          // when — which is the whole distinction a cache introduces.
          if (!cached.latestTag) {
            return skip(`${cached.remote ?? remote} advertised no release tags · last checked `
              + `${cached.checkedAt}`, { data: { ...cached, refreshed: false } });
          }
          // ARC-09-C210 — A RECORD NO NEWER THAN THIS TREE'S RELEASE IS UP TO DATE, WHICHEVER TREE WROTE IT. U2 of a
          // move from a tree with no reachable tag records { localTag: null, behind: true }; rule 2 needs a localTag, so
          // U7 answered from it, right after the move, that the release just installed was available.
          const { compareSemver } = await import('../../semver.mjs');
          let current = false;
          try { current = Boolean(here) && compareSemver(cached.latestTag, here) <= 0; } catch { current = false; }
          return cached.behind && !current
            ? warn(`${cached.latestTag} available — run ${cliOf(ctx)} upgrade`,
              { command: `${cliOf(ctx)} upgrade`, data: { ...cached, refreshed: false } })
            : ok(`up to date (${current ? here : (cached.localTag ?? cached.latestTag)}) · last checked `
              + `${cached.checkedAt}`, { ...cached, refreshed: false });
        }

        // `ls-remote`, not `fetch`: the question is "what tags exist there", and a doctor has no
        // business writing objects into a user's repository to answer it.
        const remote = 'origin';
        // ARC-09-C190 — with prompts off, as `upgrade`'s fetch: an origin that wants a credential no helper holds
        // answers at once, and never with a prompt the doctor's reader cannot see.
        const budget = 15_000;
        let listed;
        try {
          listed = (ctx.exec ?? execFileSync)('git',
            ['ls-remote', '--tags', '--refs', remote, 'v*'],
            { cwd: ctx.root, encoding: 'utf8', stdio: 'pipe', timeout: budget,
              env: { ...(ctx.env ?? process.env), ...NO_PROMPT_ENV } });
        } catch (e) {
          // ARC-09-C207 — A REMOTE THAT WILL NOT ANSWER IS A FACT ABOUT THE REMOTE, NOT A CRASH OF THIS CHECK. Uncaught,
          // a 401, a 404, a name that does not resolve or a blocking proxy reached the runner as "check crashed" at
          // status fail, from a check whose severity is warn, and the doctor exited 1. The reason is the upgrade's
          // sentence without its framing, then git's own last line, which is what the reason was read from. Nothing is
          // written to the cache: nothing was measured, the rule AC 4 holds the upgrade to when its fetch fails.
          const { gitFetchReason } = await import('../../commands/upgrade.mjs');
          const stderr = String(e?.stderr ?? '');
          const reason = e?.code === TIMED_OUT
            ? `${remote} did not answer within ${budget / 1000} s`
            : gitFetchReason(stderr, { remote }).reason ?? `could not list ${remote}'s release tags`;
          const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
          const said = lines.filter((l) => l.startsWith('fatal:')).pop() ?? lines.pop();
          return warn(said ? `${reason}\n${said}` : reason, { data: { remote, refreshed: false } });
        }
        const { sortTags } = await import('../../commands/upgrade.mjs');
        const names = String(listed ?? '').split('\n')
          .map((l) => l.split('/').pop()?.trim()).filter(Boolean);
        const latest = sortTags(names).filter((t) => t.pre === null)[0]?.tag ?? null;
        if (!latest) {
          // ARC-09-C32. WRITE IT. ARC-09-S07 says this check "refreshes the cache at most once per
          // 24 h"; returning before the write meant the empty outcome was never cached, so
          // `needsRefresh` was true for ever and every networked doctor run spent an `ls-remote`
          // with a 15 s budget. Measured at three runs, three calls, no cache. The banner is
          // unaffected either way: it needs `behind === true` AND a `latestTag`, and this has
          // neither.
          writeUpgradeCheck(ctx.root,
            { latestTag: null, localTag: describeExact(ctx.root, ctx.exec), behind: false, remote, now });
          // ARC-08 (Sitting A) — say WHY. `sortTags(...).filter((t) => t.pre === null)` drops
          // prereleases on purpose, so a remote carrying only `v2.0.0-rc.N` has no latest RELEASE
          // and this check has nothing to compare against. The old wording — "advertises no release
          // tags" — read as "the remote is empty" to somebody standing on `v2.0.0-rc.2`, which is
          // exactly where the owner was.
          const sawPre = names.length > 0;
          return skip(sawPre
            ? `${remote} advertises no non-prerelease tags; rc tags are ignored by this check`
            : `${remote} advertises no release tags`);
        }

        const localTag = describeExact(ctx.root, ctx.exec);

        // AN UNTAGGED HEAD IS A DEVELOPMENT CHECKOUT, NOT A CHECKOUT THAT IS BEHIND.
        //
        // This was `const behind = localTag !== latest`, and `describeExact` returns `null` when
        // HEAD is not exactly on a tag — so every `develop` checkout and every CI bootstrap cell
        // compared `null !== 'v2.0.0'`, was declared behind, and was told to `./snowarch upgrade`:
        // to move a development checkout ONTO the release tag, which is the opposite of what the
        // person wants and would discard what they are working on.
        //
        // It was invisible until 2.0.0 existed. Before the cut there was no non-prerelease tag, so
        // `latest` was null and the check skipped at the branch above — the defect was reachable
        // only on the one day the product first had a release, and then it reddened every PR.
        //
        // `null` is ABSENCE, and a comparison that treats absence as a value is the shape this
        // programme keeps finding. So absence gets its own answer, in words, with no remedy: there
        // is nothing to fix on a tree that is deliberately not a release.
        if (localTag === null) {
          const head = shortHead(ctx.root, ctx.exec);
          const written = writeUpgradeCheck(ctx.root,
            // `behind: false` on purpose: the SessionStart banner nudges on `behind === true` with a
            // `latestTag`, and a development checkout must not be nagged to upgrade itself away.
            { latestTag: latest, localTag: null, behind: false, remote, now });
          return ok(`development checkout${head ? ` at ${head}` : ''}; latest release ${latest}`,
            { ...written, refreshed: true });
        }

        // A TAGGED HEAD IS COMPARED BY THE COMPARATOR, NOT BY STRING EQUALITY. `!==` also called a
        // checkout standing on a tag NEWER than the latest release "behind" — which is what a tag
        // cut locally before it is pushed is — and ARC-09-S12 exists because string comparison of
        // versions is wrong in this repository specifically (`rc.10` sorted below `rc.9`).
        const { compareSemver } = await import('../../semver.mjs');
        let behind;
        try {
          behind = compareSemver(localTag, latest) < 0;
        } catch {
          // A tag this product cannot order — someone else's naming on the same commit. Not a
          // currency answer, and not an invented one: say so and compare nothing.
          const written = writeUpgradeCheck(ctx.root,
            { latestTag: latest, localTag, behind: false, remote, now });
          return skip(`HEAD is at "${localTag}", which is not a version this product can order; `
            + `latest release ${latest}`, { ...written, refreshed: true });
        }
        const written = writeUpgradeCheck(ctx.root,
          { latestTag: latest, localTag, behind, remote, now });

        return behind
          ? warn(`${latest} available — run ${cliOf(ctx)} upgrade`,
            { command: `${cliOf(ctx)} upgrade`, data: { ...written, refreshed: true } })
          : ok(`up to date (${localTag})`, { ...written, refreshed: true });
      },
    }),
  ];
}

/**
 * The short sha of HEAD, or `null`.
 *
 * Only ever used to SAY WHERE a development checkout is. `null` when git cannot answer — a tarball
 * with no `.git`, or a repository with no commits — and the sentence then simply omits it rather
 * than printing `at null`, which is a sentence about this function rather than about the checkout.
 */
function shortHead(root, exec = execFileSync) {
  try {
    return String(exec('git', ['rev-parse', '--short', 'HEAD'],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' })).trim() || null;
  } catch { return null; }
}

/** The tag this checkout is exactly on, or `null`. Never a guess from a nearby one. */
function describeExact(root, exec = execFileSync) {
  try {
    return String(exec('git', ['describe', '--tags', '--exact-match'],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' })).trim() || null;
  } catch { return null; }
}
