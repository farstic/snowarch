// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-07-C31 — the engine's launcher spelling, and the ONLY engine file allowed to spell it.
//
// These four strings lived in `text.mjs`, which `tests/windows-spellings.test.mjs` exempted as a
// DEFINITION. The exemption's comment named the definition; the exemption's BEHAVIOUR skipped the
// whole file — so the 500 lines of sentences around it were the one place in the engine where a
// hand-spelled `./snowarch` could be written, read back green, and shipped. Slice 1 of C31 fixed six
// such messages and the guard did not notice either the breakage or the repair: two controls run
// against it — appending a fresh literal, and reverting `BANNER.upgrade` to its hand-spelled form —
// both left it 9/9 green.
//
// So the definition moved HERE, to a file that is nothing but the definition. `text.mjs` is now read
// like every other file, and the exemption covers four lines that a reader can hold in one glance.
//
// A LEAF, with no imports, and that is load-bearing beyond tidiness. `text.mjs` sits inside the
// `panel -> text -> report-text -> panel` cycle, where a module-level `spellings()` threw
// `Cannot access 'isWindowsShell' before initialization` — the same cycle cost this programme a day.
// Nothing imports this file's dependencies because it has none, so `spellings` is initialised before
// any cycle can be entered, and a module-load call on it is safe from anywhere.
//
// WHAT MAY BE ADDED HERE: nothing. A sentence that needs the spelling takes it as an argument.

/**
 * Are we talking to a shell that spells paths the Windows way?
 *
 * Not `process.platform === 'win32'` alone: Git Bash on Windows runs `./bootstrap.sh` perfectly
 * well, and telling that user to type `.\bootstrap.cmd` would be telling them to type something
 * that does not work. `SHELL` and `MSYSTEM` are how a bash on Windows announces itself.
 *
 * `env` DEFAULTS TO `process.env`, which is the trap every test around this has to know about:
 * `spellings({ platform: 'win32' })` on a mac reads that mac's `SHELL` and renders POSIX. A fixture
 * that means the Windows rendering passes `env: {}` as well as the platform.
 */
export const isWindowsShell = ({ platform = process.platform, env = process.env } = {}) =>
  platform === 'win32' && !env.SHELL && !env.MSYSTEM;

/** The command spellings, by shell. */
export function spellings(where = {}) {
  return isWindowsShell(where)
    // ARC-07-C1, closed by W7. The line above prefixed the bootstrap and NOT the cli, while the POSIX
    // branch below prefixes both — the author knew the rule and applied it to one of the two.
    // PowerShell does not resolve a command from the current directory, and nothing in the bootstrap
    // puts the checkout on PATH, so a bare `snowarch.cmd` is the one spelling PowerShell refuses.
    ? { bootstrap: '.\\bootstrap.cmd', cli: '.\\snowarch.cmd' }
    : { bootstrap: './bootstrap.sh', cli: './snowarch' };
}

/**
 * The POSIX rendering, named — ARC-07-C31.
 *
 * For the two jobs that must produce the SAME BYTES on every machine that runs them: a generated and
 * committed artefact (`text.json`, whose generator would otherwise write `.\snowarch.cmd` on the
 * Windows cell and fail `gen:check` on the next mac), and a default for a renderer whose caller does
 * not know the shell. Both are deliberate choices of one rendering, which is why the constant says
 * POSIX in its name rather than hiding it behind `spellings()`.
 */
export const POSIX = Object.freeze(spellings({ platform: 'linux', env: {} }));

/**
 * The refusal every sentence that takes a spelling shares — ARC-07-C31.
 *
 * IT LIVES IN THE LEAF so a low-level module can use it without importing `text.mjs` and, with it, the
 * `panel -> text -> report-text -> panel` graph. `state.mjs` is the case that moved it here: it is read
 * by the bootstrap, the doctor and the upgrade, and none of those needs a renderer to validate an
 * argument.
 *
 * `who` is the caller's own name, passed rather than inferred: this guards a dozen sentences across
 * five modules now, and a message that named the wrong one sent a reader to the wrong file once.
 */
export const needSpell = (spell, who) => {
  if (!spell || typeof spell.cli !== 'string' || typeof spell.bootstrap !== 'string') {
    throw new TypeError(`${who} needs a spellings object — the launcher is spelled from the `
      + 'definition and never defaulted here, because a default is how the process leaks into a '
      + 'sentence rendered for somebody else\'s shell');
  }
  return spell;
};
