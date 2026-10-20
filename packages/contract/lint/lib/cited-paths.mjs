// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The repository paths a document cites — L05's extraction, one definition (ARC-09-C185a).
 *
 * L05 asks whether each cited path resolves; the distribution guard asks whether each one ships. Both read the same
 * citations from the same lines, so the rules below are written once: a backticked path or a markdown link target,
 * under a known prefix, shaped like a file or a directory; not inside a fenced block, not below a history heading,
 * not on a row that declares its owning ARC.
 */
// Paths real only at run time, on the user's machine: never in the repository.
const RUNTIME_PREFIXES = ['.local/', '~/', '%APPDATA%', '%USERPROFILE%'];

export const PREFIXES = ['CLAUDE.md', 'README.md', '.claude/', 'governance/', 'docs/', 'templates/',
  'tools/', 'packages/', 'scripts/', 'tests/', 'engine.config.json', 'vendor/docs-areas.txt'];

// Backticked paths and markdown link targets. Both are how a path is written to be followed.
export const BACKTICK = /`([^`\n]+)`/g;
export const LINK = /\]\(([^)\s]+)\)/g;

export const isCandidate = (p) => PREFIXES.some((x) => p === x || p.startsWith(x));

export function skipPath(p) {
  return p.startsWith('vendor/ServiceNowDocs')      // ARC-03's gate checks these against the corpus
    || RUNTIME_PREFIXES.some((x) => p.startsWith(x) || p.includes(x))   // real at run time, never here
    || /\.local\.json$/.test(p)
    || /[*?{}]/.test(p)                             // a glob is a shape, not a path
    || /[<>]/.test(p)                               // `<label>`, `docs/<name>.md`
    || p.endsWith('/**')
    || p.includes('…')
    // A path is cited as a file (it has an extension) or as a directory (trailing slash). Anything
    // else under a scanned prefix is a name that merely looks like one: `tools/list` is an MCP
    // method, a bare `packages/<name>` is a package. Requiring the shape is what tells them apart.
    || !(p.endsWith('/') || /\.[A-Za-z0-9]+$/.test(p));
}

/**
 * A row that names the ARC which creates the path.
 *
 * `docs/ARCHITECTURE.md`'s owner table is one row per directory with its owning story beside it —
 * the same declaration `forthcoming-paths.json` carries, written where the reader sees it rather
 * than in a fixture they will not open. Treating it as a citation would demand that a document
 * about who builds what may only name things already built.
 */
export const DECLARES_OWNER = /\*\*ARC-\d\d\*\*/;

/** True once a line is at or below a heading whose subject is what used to be here. */
export const HISTORY_HEADING = /^#{2,3} (History|The D-03 cut ledger|Before \d)/;

/** Every path `lines` cite, with its 1-based line number, once per line. */
export function citedPaths(lines) {
  const out = [];
  let fenced = false;
  let historical = false;
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('```')) { fenced = !fenced; return; }
    if (fenced) return;
    // A document may be current above its history section and historical below it — the same
    // boundary `docs/CHANGELOG.md` uses. Below it, a path that no longer exists is the subject.
    if (HISTORY_HEADING.test(line)) historical = true;
    if (historical || DECLARES_OWNER.test(line)) return;
    const seen = new Set();
    for (const re of [BACKTICK, LINK]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        // Trim what prose puts next to a path: a trailing full stop, comma or bracket.
        const raw = m[1].trim().replace(/[).,;:]+$/, '');
        // `docs/README.md:157-159` cites a line range; the path is the part before it.
        const path = raw.replace(/^\.\//, '').split('#')[0].replace(/:\d+(-\d+)?$/, '');
        if (!path || seen.has(path) || !isCandidate(path) || skipPath(path)) continue;
        seen.add(path);
        out.push({ path, line: i + 1 });
      }
    }
  });
  return out;
}
