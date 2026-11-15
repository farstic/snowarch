// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C270 — where Claude Code's native installer puts the program, and the one sentence for "it is there and its folder is not on PATH".
//
// "Not found on PATH" is two facts. Claude Code is not installed, or the native installer ran and left its folder out of PATH, which it does
// not always add (https://code.claude.com/docs/en/troubleshoot-install lists `Native installation exists but ... is not in your PATH`). A reader
// who has just run the installer and is told to install Claude Code goes round again, so every site that reports "not found" asks here first.
//
// The place is the installer's own: `%USERPROFILE%\.local\bin\claude.exe` on Windows, `~/.local/bin/claude` on macOS and Linux. Each platform's
// path is spelled by that platform's `path` module, not the host's, so the Windows words are right when this runs under a test on a Mac and the
// other way round. The file system is a seam (`exists`); no caller guesses a home when its platform's variable is not set.
import { existsSync } from 'node:fs';
import { posix, win32 } from 'node:path';

/** The file the native installer makes, or null when the platform's home variable is not set. */
export function nativeClaudePath({ env = process.env, plat = process.platform } = {}) {
  const home = plat === 'win32' ? env.USERPROFILE : env.HOME;
  if (!home) return null;
  return plat === 'win32'
    ? win32.join(home, '.local', 'bin', 'claude.exe')
    : posix.join(home, '.local', 'bin', 'claude');
}

/** `{ path, plat }` when the native install is there, null when it is not (or there is no home to look in). */
export function findNativeClaude({ env = process.env, plat = process.platform, exists = existsSync } = {}) {
  const path = nativeClaudePath({ env, plat });
  return path && exists(path) ? { path, plat } : null;
}

/**
 * What every site says when the file is there and PATH does not name its folder. One sentence with a slot for the path: B00 and the upgrade
 * fill it with the path, and the two launchers, which have no Node to call this, get it generated (`scripts/gen-launcher-text.mjs`), with
 * the slot spelled their way (`%s` for printf, `{0}` for PowerShell's -f).
 */
export const offPathSentence = (slot) => `Claude Code is installed at ${slot}, but that folder is not on PATH`;
