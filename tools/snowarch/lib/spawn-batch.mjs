// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C67/C68 — how a `.cmd` or `.bat` is run on Windows, in one place.
 *
 * THE HISTORY MATTERS, because this is the third answer to the same question and the first two were
 * each right about the thing they were fixing.
 *
 *   1. Spawn the file directly. Node closed CVE-2024-27980 in 20.12 by refusing to exec a batch file
 *      without a shell, and the refusal is an EINVAL — so `npm --version`, which resolves to
 *      `npm.CMD`, came back as "found but did not answer" on every Windows machine.
 *   2. `shell: true`. That fixed the EINVAL and bought two defects with it, both measured on a
 *      colleague's Windows 11 / Node 24 machine:
 *
 *        DEP0190  `Passing args to a child process with shell option true can lead to security
 *                 vulnerabilities, as the arguments are not escaped, only concatenated.` Node 24
 *                 deprecates `shell: true` WITH an args array, and printed that warning plus its
 *                 `--trace-deprecation` line on every launcher run — bootstrap, doctor, upgrade
 *                 three times (once between `Proceed? [Y/n]` and the answer), `mode live`.
 *        SPACES   `shell: true` concatenates the arguments with spaces and quotes nothing, so
 *                 `C:\Program Files\nodejs\npm.cmd --version` reached cmd as three tokens and E-03
 *                 reported `'C:\Program' is not recognized as an internal or external command`,
 *                 telling a machine with a working npm to reinstall Node. B00's own comment had
 *                 predicted it — "it re-introduces quoting rules" — one line above the defect.
 *
 *   3. This: `cmd.exe /d /s /c "<one fully quoted command line>"`, which is what Node itself does
 *      internally for `shell: true` and what `shell: true` stops doing the moment a caller passes an
 *      args array. The quoting is ours, so the space in `Program Files` survives, and there is no
 *      deprecated option in sight.
 *
 * `/d` skips AutoRun commands from the registry, so a machine with a `HKCU\…\Command Processor\AutoRun`
 * value cannot inject a command into a check. `/s` plus the outer quotes is the documented form that
 * makes cmd strip exactly the first and last quote and treat the remainder verbatim, which is what
 * lets the inner quoting be the CRT's rules rather than cmd's.
 *
 * WHAT IT REFUSES, and why refusing is the honest answer. `%` is expanded by cmd even inside double
 * quotes, and there is no escape for it on a command line (`%%` is a batch-FILE rule). A path
 * containing `%` is legal on Windows and rare, and the choice is between a sentence saying we will not
 * run it and a silently different command. Every caller in this repository passes a path this process
 * resolved plus literal sub-commands, so the refusal is a guard against a surprise rather than a
 * limitation anyone will meet.
 */

/** cmd.exe, from the environment the child will run in — `ComSpec` is what Windows itself reads. */
export const comSpec = (env = process.env) => env.ComSpec || env.COMSPEC || 'cmd.exe';

/** A token cmd would mangle whatever we did with it. Named so the callers' sentences can say why. */
export class BatchArgumentError extends Error {
  constructor(token) {
    super(`cannot pass ${JSON.stringify(token)} through cmd.exe: a "%" is expanded by the command `
      + 'processor even inside quotes, and there is no escape for it on a command line');
    this.name = 'BatchArgumentError';
    this.token = token;
  }
}

/**
 * One argument, quoted for the Windows CRT — the rules a spawned program's own parser applies.
 *
 * Backslashes only need doubling when they are followed by the quote that ends the token; elsewhere
 * they are literal, which is why a Windows path does not turn into a thicket. `"` inside a token is
 * impossible in a filename and handled anyway, because this helper is also given sub-commands.
 */
export function quoteForCmd(token) {
  const s = String(token);
  if (s.includes('%')) throw new BatchArgumentError(s);
  if (s === '') return '""';
  if (!/[\s"]/.test(s)) return s;
  // Trailing backslashes double so they do not escape the closing quote; an inner `"` becomes `\"`.
  const body = s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1');
  return `"${body}"`;
}

/**
 * What to spawn instead of a batch file: `{ file, args, options }`, ready to spread into a caller's
 * own exec seam.
 *
 * `windowsVerbatimArguments` is not optional here — without it Node would re-quote the argv we have
 * just quoted, and cmd would see the escaping twice.
 */
export function batchCommand(file, args = [], { env = process.env } = {}) {
  const line = [file, ...args].map(quoteForCmd).join(' ');
  return {
    file: comSpec(env),
    args: ['/d', '/s', '/c', `"${line}"`],
    options: { windowsVerbatimArguments: true },
  };
}

/**
 * `npm`, spelled for the platform — `npm.cmd` on Windows, where npm IS a batch file.
 *
 * ARC-09-C69. Four call sites wrote this expression themselves and two others passed a bare `npm`
 * with `shell: true`, leaning on the shell to add the extension. The shell is what we are removing, so
 * the name has to be right before the call rather than resolved inside one.
 */
export const npmCommand = (platform = process.platform) => (platform === 'win32' ? 'npm.cmd' : 'npm');

/**
 * What to spawn for `file` and `args` on this platform: `{ file, args, options }`, ready to spread.
 *
 * The one entry point a caller wants — it is `batchCommand` on Windows for a batch file and the
 * unchanged call everywhere else, so no site has to carry a platform branch of its own. Every site
 * that did carry one wrote `shell: process.platform === 'win32'`, which is the deprecated shape.
 */
export function spawnFor(file, args = [], { env = process.env, platform = process.platform } = {}) {
  /*
   * ARC-09-C70 — A BARE `npm` ON WINDOWS IS A BATCH FILE, and this guard exists because the plain
   * reading of the line above was wrong in a way that produced no error message at all.
   *
   * `isBatch('npm')` is false — there is no extension to match — so a caller passing the name it would
   * type on a mac got a direct spawn, and `CreateProcess` appends `.exe` and nothing else. That is how
   * `release-dryrun (windows-latest)` reported `gate failed: lint (exit 1)` with no output: the child
   * never started, `status` was `null`, and `?? 1` manufactured an exit code. The shell used to hide
   * this by resolving the name; removing the shell removed the hiding too.
   *
   * A LIST, deliberately short and named: these are the tools this repository spawns that npm installs
   * as `.cmd` shims on Windows. A caller that knows better passes the full spelling — `npmCommand()` is
   * the one to use — and this is the net under the caller that does not.
   */
  const SHIMMED = new Set(['npm', 'npx']);
  const spelled = platform === 'win32' && SHIMMED.has(file) ? `${file}.cmd` : file;
  if (platform === 'win32' && isBatch(spelled)) return batchCommand(spelled, args, { env });
  return { file: spelled, args, options: {} };
}

/** Is this a file Windows can only run through the command processor? */
export const isBatch = (file) => /\.(cmd|bat)$/i.test(String(file));
