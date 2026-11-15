// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C272 — a private folder the engine makes: `.local/`, its logs, the licence state, the doctor's cache.
//
// On POSIX a private folder is `mkdir` with mode 0700. On Windows that mode is ignored, and a folder made directly under `C:\` inherits
// `BUILTIN\Users` read and `Authenticated Users` modify (measured on a windows-latest runner, 2026-11-12), so every account on the computer
// could read what the engine keeps there, and the store the server writes into the same `.local/`. `makePrivateDir` is the one way the engine
// makes such a folder: the same `mkdir` as before and, on Windows, when it CREATED the folder, the lock the server puts on the store — the
// account and SYSTEM, by SID. A folder that was already there is the user's: the lock on it is `instance add`'s and the doctor's to propose,
// never a side effect of writing a cache. A lock that fails does not stop the engine; the folder is there and the result carries the reason.
//
// This is a second copy of what `packages/snowarch/src/store/acl.ts` does for the server, and it has to be: the engine runs before anything is
// installed and cannot import the server. `tests/private-dir-parity.test.mjs` holds the two to the same command and the same reading of
// whoami, and `tests/private-dir-guard.test.mjs` holds every other `mkdirSync` with a mode out of the tree. Node built-ins only.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { win32 } from 'node:path';

export const SYSTEM_SID = 'S-1-5-18';

/** The SID in `whoami /user /fo csv /nh`: `"HOST\name","S-1-5-21-…"`. The name is localised and may hold digits, so the SID is what ends the line. */
export function parseWhoamiSid(text) {
  const m = /"?(S-1-\d+(?:-\d+)+)"?\s*$/.exec(String(text ?? '').trim());
  return m ? m[1] : null;
}

/** The account and SYSTEM, full control, no inheritance; a folder passes the grant on to what is created in it. `*` marks the grant as a SID. */
export function lockArgs(path, sid, { dir }) {
  const flags = dir ? '(OI)(CI)' : '';
  return [path, '/inheritance:r', '/grant:r', `*${sid}:${flags}F`, `*${SYSTEM_SID}:${flags}F`];
}

const defaultRun = (file, args) => {
  const r = spawnSync(file, args, { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  if (r.error) return { status: null, stdout: '', stderr: r.error.message };
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};
const firstLine = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';

/**
 * The lock for one platform: `lock(path, { dir })` → `{ ok: true }` or `{ ok: false, reason }`. Anything but `win32` asks nothing of the
 * system. The system's own `whoami.exe` and `icacls.exe` are named by full path, and the account is asked once.
 */
export function createLocker({ platform = process.platform, run = defaultRun, env = process.env } = {}) {
  const system32 = win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32');
  let sid;
  const userSid = () => {
    if (platform !== 'win32') return null;
    if (sid === undefined) {
      const r = run(win32.join(system32, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh']);
      sid = r.status === 0 ? parseWhoamiSid(r.stdout) : null;
    }
    return sid;
  };
  const lock = (path, { dir }) => {
    if (platform !== 'win32') return { ok: true };
    const me = userSid();
    if (!me) return { ok: false, reason: 'could not tell which account this is (whoami gave no SID)' };
    const r = run(win32.join(system32, 'icacls.exe'), lockArgs(path, me, { dir }));
    if (r.status === 0) return { ok: true };
    return { ok: false, reason: r.status === null ? `icacls could not be run: ${firstLine(r.stderr)}`
      : `icacls exited ${r.status}: ${firstLine(r.stderr) || firstLine(r.stdout)}` };
  };
  return { platform, userSid, lock };
}

let shared = null;
/** The locker for this process, made once so the account is asked once. */
export const defaultLocker = () => { shared ??= createLocker(); return shared; };

/**
 * `mkdir -p` with mode 0700, as the engine has always made them, and — on Windows, when this call created the folder — locked. Only the
 * folder asked for is locked, not the folders made on the way to it. Returns `{ created, lock }`: `lock` is null when nothing was asked of
 * the system (the folder existed, or the platform is not Windows).
 */
export function makePrivateDir(dir, { locker = defaultLocker() } = {}) {
  const existed = existsSync(dir);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (existed) return { created: false, lock: null };
  if (locker.platform !== 'win32') return { created: true, lock: null };
  return { created: true, lock: locker.lock(dir, { dir: true }) };
}
