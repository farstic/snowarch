// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C250, P4 — the banner's `Docs on disk:` line: the release family, the mode, and how many of the corpus map's
// areas this checkout has on disk, naming the largest that it has not. With it the Architect can say "not installed
// on this checkout" where it would otherwise say "not documented".
//
// It is not the status panel's `Docs:` line, which names the pin and spends a `rev-parse` to check the corpus is on it
// (ARC-08-C19). The banner spawns nothing (ARC-09-S04, C199), so this line names no pin and is made from reads alone:
// vendor/docs-map.md for the areas, a directory listing for what is on disk, the recorded mode, and engine.config.json
// for the family.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { modeOf, recordedMode, SPARSE } from './shape.mjs';

const LABEL = 'Docs on disk:';
/** How many missing areas the line names before it counts the rest. */
const NAMED = 3;
/** A map row: the area's folder, its title, then its pages (scripts/gen-docs-map.mjs). */
const ROW = /^\|\s*`markdown\/([a-z0-9][a-z0-9-]*)\/`\s*\|[^|]*\|\s*(\d+)\s*\|/;
/** A family name, as `docs family` accepts one: a value read from a file never adds a banner line of its own. */
const FAMILY = /^[a-z0-9][a-z0-9-]*$/;

/** The map's areas, each with its pages. */
function mapAreas(root) {
  const areas = [];
  for (const line of readFileSync(join(root, 'vendor', 'docs-map.md'), 'utf8').split('\n')) {
    const m = line.match(ROW);
    if (m) areas.push({ area: m[1], pages: Number(m[2]) });
  }
  return areas;
}

/**
 * `Docs on disk: australia · full · 56/56 areas`, or `… · sparse · 20/56 — not installed: a, b, c, +33`, the missing
 * areas named by their pages, most first, a tie by name.
 *
 * `null` prints nothing, and that is the honest failure for this line, as for the licence line: no map, a map with no
 * rows, no corpus, no family, or any file that does not read is no line and never an error.
 */
export function bannerDocsLine({ root }) {
  try {
    const family = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'))?.docs?.family;
    if (typeof family !== 'string' || !FAMILY.test(family)) return null;
    const areas = mapAreas(root);
    if (areas.length === 0) return null;
    const onDisk = new Set(readdirSync(join(root, 'vendor', 'ServiceNowDocs', 'markdown'), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name));
    const missing = areas.filter((a) => !onDisk.has(a.area))
      .sort((a, b) => b.pages - a.pages || (a.area < b.area ? -1 : a.area > b.area ? 1 : 0));
    const count = `${areas.length - missing.length}/${areas.length}`;
    // The banner cannot ask git for the checkout's shape, so it hands `modeOf` the listing's: every area on disk
    // reads as the whole corpus, anything less as a cone. That is the one distinction `modeOf` asks of its shape.
    const mode = modeOf(recordedMode(root), missing.length === 0 ? SPARSE.full : SPARSE.cone);
    if (missing.length === 0) return `${LABEL} ${family} · ${mode} · ${count} areas`;
    const rest = missing.length - NAMED;
    return `${LABEL} ${family} · ${mode} · ${count} — not installed: `
      + `${missing.slice(0, NAMED).map((a) => a.area).join(', ')}${rest > 0 ? `, +${rest}` : ''}`;
  } catch {
    return null;
  }
}
