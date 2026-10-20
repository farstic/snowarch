// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-02-S02 — a deliberately small parser for the flat-YAML subset the engine's frontmatter uses.
// Supports exactly what the roster contains and rejects the rest by name, because a parser that
// silently accepts more than the engine writes is a parser that stops catching mistakes.
export class FrontmatterError extends Error {
  constructor(message, file, line) { super(`${file}:${line}: ${message}`); this.file = file; this.line = line; }
}

const unquote = (v) => {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
};
const isQuoted = (v) => {
  const t = v.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"));
};

// Returns { data, raw, quoted } — `quoted` records which top-level scalars were quoted in the source,
// which the colon-space rule needs and which a plain value map cannot express.
export function parseFrontmatter(text, file = '<inline>') {
  const norm = text.replace(/\r\n/g, '\n');            // CRLF: the Windows cell reads the same files
  const m = norm.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new FrontmatterError('no frontmatter block', file, 1);
  const data = {}, quoted = {};
  let current = null;                                   // the key of an open nested map or list
  m[1].split('\n').forEach((line, i) => {
    const n = i + 2;                                    // +1 for the opening ---, +1 for 1-based
    if (!line.trim() || line.trim().startsWith('#')) return;
    const nested = line.match(/^\s{2,}([A-Za-z][\w-]*):\s*(.*)$/);
    if (nested && current && typeof data[current] === 'object' && !Array.isArray(data[current])) {
      data[current][nested[1]] = unquote(nested[2]); return;
    }
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && current) {
      // A key opened with `key:` and nothing after it is ambiguous until its first child: an indented
      // `key: value` makes it a map, a `- item` makes it a list. Convert on first sight of an item.
      if (!Array.isArray(data[current])) {
        if (Object.keys(data[current] ?? {}).length) throw new FrontmatterError('list item in a map', file, n);
        data[current] = [];
      }
      data[current].push(unquote(item[1])); return;
    }
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) throw new FrontmatterError(`unsupported frontmatter syntax`, file, n);
    const [, key, rest] = kv;
    if (rest === '') { data[key] = {}; current = key; return; }         // opens a nested map or list
    if (rest.startsWith('[') && rest.endsWith(']')) {                   // flow list
      data[key] = rest.slice(1, -1).split(',').map((s) => unquote(s)).filter(Boolean); current = null; return;
    }
    data[key] = unquote(rest); quoted[key] = isQuoted(rest); current = null;
  });
  // A key opened with no children is an empty list, not an empty map — `skills:` with items follows.
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) data[k] = [];
  }
  return { data, quoted, raw: m[1] };
}

// A comma-separated scalar used as a list (`tools: Read, Write`) — the engine's agents use this form.
export const asList = (v) => Array.isArray(v) ? v : String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
