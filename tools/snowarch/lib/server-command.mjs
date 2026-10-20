// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S08, trimmed by ARC-08-S05 — the spawn `.mcp.json` describes, and nothing else.
//
// This file used to hold a second MCP client: newline-delimited JSON-RPC over a real child's
// stdio, written so the bootstrap could verify the server it had just installed. The server
// package has one too, because it ships to npm alone and cannot import engine code — and once
// ARC-08-S05 made B08 ask the doctor instead of spawning its own child, the engine's copy had no
// caller left in the product. Two implementations of one protocol, kept in step by nothing, is
// what the guard is about; the copy with no caller is the one that goes.
//
// What stays is not a handshake at all: reading `.mcp.json` into the exact command Claude Code
// would run. That is still ours, it is what `spawn-env.mjs`'s rule is about, and E-07 validates
// the same file statically.
//
// Stdlib only.
/** Raised when `.mcp.json` cannot produce a command — the config half of the old error type. */
export class ServerCommandError extends Error {
  constructor(message, { phase = 'config' } = {}) {
    super(message);
    this.name = 'ServerCommandError';
    this.phase = phase;
  }
}

/**
 * `${VAR:-default}` as Claude Code expands it, with `CLAUDE_PROJECT_DIR` bound to the checkout.
 *
 * Every placeholder in `.mcp.json` carries a default — ARC-06-S01's test enforces that — so an
 * unset variable becomes the default rather than the literal characters `${SNOW_STORE}`, which is
 * what a naive expansion would hand the server as a path.
 *
 * `CLAUDE_PROJECT_DIR` is bound to `root` UNCONDITIONALLY, and that is the whole point of it being
 * special-cased here. Claude Code sets that variable to the project root of the session that spawns
 * the server; when WE spawn it, we are that session, so an inherited value is somebody else's
 * answer to our question. Reading it made the bootstrap start a server from whichever repository
 * the surrounding Claude Code session happened to be in — `Cannot find module`, exit 1 — and it was
 * invisible in a plain terminal and in CI, where the variable is unset. Found by running the tests
 * inside a session, which is exactly the context ARC-07-S09 and ARC-08 will live in.
 */
export function expand(value, env, root) {
  return String(value).replace(/\$\{([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}/g, (whole, name, fallback) => {
    if (name === 'CLAUDE_PROJECT_DIR') return root;
    const found = env[name];
    if (found !== undefined && found !== '') return found;
    return fallback ?? whole;
  });
}

/** The spawn `.mcp.json` describes, with the placeholders resolved. */
export function serverCommand({ mcp, serverKey, root, env = process.env }) {
  const entry = mcp?.mcpServers?.[serverKey];
  if (!entry) throw new ServerCommandError(`.mcp.json has no "${serverKey}" server`);
  return {
    command: entry.command,
    args: (entry.args ?? []).map((a) => expand(a, env, root)),
    env: {
      ...Object.fromEntries(Object.entries(entry.env ?? {})
        .map(([k, v]) => [k, expand(v, env, root)])),
      // Set, never inherited — the child resolves its own store path from this, so a stale value
      // from the surrounding session would point the server at another checkout's `.local/`.
      CLAUDE_PROJECT_DIR: root,
    },
  };
}
