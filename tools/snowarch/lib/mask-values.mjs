// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C221 — the store's own names, masked by value: one definition for a user's finding (finding.mjs) and for the
// doctor's JSON boundary, which can only mask an instance it is told about by pattern (`INSTANCE_HOST`) and misses a
// custom domain or a bare host.
//
// THE NON-CREDENTIAL TIER, and only it, lives here: labels, URL hosts and host stems. It is read the way
// `readStoreSummaries` reads (packages/snowarch/src/store/label.ts:133): each field named, never a spread of an entry,
// never the credential block. Usernames and secrets are finding.mjs's alone, read through the store loader that
// registers the secrets as it parses (instance-file.mjs:135), so no second reader of credentials exists.
import { readFileSync } from 'node:fs';

/** The store schema's environment enum (instance-file.mjs ENVIRONMENTS): words too common to mask as names. */
export const ENV_WORDS = new Set(['pdi', 'dev', 'test', 'prod']);

const SN_HOST = /\.(?:service-now\.[a-z]{2,}|servicenowservices\.com)$/i;
const NONE = Object.freeze({ read: false, labels: [], hosts: [], stems: [] });

// ARC-09-C242 — a stem names the organisation or the instance, never a label of the public suffix it sits under. Taken
// as the stem, `co` (servicedesk.<org>.co.uk) masked every word that begins with it in a finding, `Could` and
// `configure` among them, and left the organisation's own name unmasked (the regression hunt, wf_9be5c51c-184).
// A generic second level is skipped under any country code (acme.co.uk). A government's, a sector's that is public under
// one country only (police.uk is a suffix, police.be the Belgian police's own domain) and a state, under gov.au, edu.au
// and gov, are skipped only with a label in front of the organisation's: servicedesk.mod.uk, itsm.gov.pl and
// itsm.in.gov keep `mod`, `gov` and `in`, because the leftmost label is the service's (the review of C242, round 2).
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'edu', 'ac', 'or', 'ne', 'ltd', 'plc', 'sch', 'nom', 'gen',
  'int']);
// A government's second level names the government, when no label stands between it and the service's (itsm.gov.pl).
const GOVERNMENT = new Set(['gov', 'mil', 'go', 'gob', 'gouv', 'govt']);
const SECOND_LEVEL_IN = new Set(['police.uk', 'nhs.uk', 'mod.uk', 'nic.in', 'gv.at', 'jus.br', 'leg.br', 'mp.br',
  'lg.jp', 'asn.au', 'health.nz', 'school.nz', 'gc.ca', 're.kr']);
const AU_STATES = new Set(['act', 'nsw', 'nt', 'qld', 'sa', 'tas', 'vic', 'wa']);
// The US states, DC, Puerto Rico and the Virgin Islands, without `va`: va.gov is Veterans Affairs', and ed.gov,
// Education's, is not a state.
const US_STATES = new Set(['al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'dc', 'fl', 'ga', 'hi', 'id', 'il', 'in',
  'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd',
  'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'wa', 'wv', 'wi', 'wy', 'pr', 'vi']);
const IP_HOST = /^(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;

/**
 * ARC-09-C242 — a stem these lists name is a government's, a sector's or a state's label, kept because no label stood in
 * front of it (itsm.act.gov.au, servicedesk.mod.uk). A finding masks it as a word and in a sibling's name, not where it
 * begins a longer word: `act` begins action, `mod` module, `in` instance.
 */
const PUBLIC_LABELS = new Set([...GOVERNMENT, ...[...SECOND_LEVEL_IN].map((p) => p.split('.')[0]), ...AU_STATES, ...US_STATES]);
export const isPublicLabel = (stem) => PUBLIC_LABELS.has(String(stem).toLowerCase());

/**
 * A host's stem: the instance name of a ServiceNow host, the organisation part of any other. An address has none: it
 * is a number, not a name, and the host itself is masked whole.
 */
export function stemOf(host) {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (IP_HOST.test(h)) return '';
  const parts = h.split('.');
  if (SN_HOST.test(h)) return parts[0];
  let end = parts.length - 1; // the top-level domain
  const tld = parts[end];
  if (end >= 2 && /^[a-z]{2}$/.test(tld)) {
    const second = parts[end - 1];
    if (SECOND_LEVEL.has(second) || (end >= 3 && (GOVERNMENT.has(second) || SECOND_LEVEL_IN.has(`${second}.${tld}`)))) end -= 1;
    if (end >= 3 && tld === 'au' && (parts[end] === 'gov' || parts[end] === 'edu') && AU_STATES.has(parts[end - 1])) end -= 1;
  } else if (end >= 3 && tld === 'gov' && US_STATES.has(parts[end - 1])) {
    end -= 1;
  }
  return parts[end - 1] ?? parts[0];
}

/**
 * ARC-09-C221 — stems that are never a client's name, for both maskers: a store host whose stem is one of these is
 * masked whole, but the word is not, or the product's own words would read `<host>`. Moved here from
 * doctor/json-boundary.mjs by ARC-09-C242, which adds `snow` (the `snow_*` tools, `./snowarch`).
 */
export const PRODUCT_STEMS = new Set([...ENV_WORDS, 'servicenow', 'service', 'snowarch', 'snow', 'github', 'npmjs',
  'nodejs', 'docs', 'developer', 'support', 'example', 'invalid', 'local', 'localhost']);

/** The stems a masker uses: not empty, and not one of the product's words. */
export const usableStems = (stems) => stems.filter((s) => s && !PRODUCT_STEMS.has(s.toLowerCase()));

/** Labels, URL hosts and stems from the instance store at `storePath`; `read: false` when it cannot be read. */
export function storeHostValues(storePath) {
  let raw;
  try { raw = JSON.parse(readFileSync(storePath, 'utf8')); } catch { return { ...NONE }; }
  const instances = raw?.instances;
  if (!instances || typeof instances !== 'object') return { ...NONE };
  const labels = [];
  const hosts = [];
  for (const [label, entry] of Object.entries(instances)) {
    labels.push(label);
    const url = typeof entry?.url === 'string' ? entry.url : null; // the one field taken from the entry
    if (url) { try { hosts.push(new URL(url).hostname.toLowerCase()); } catch { /* not a URL: nothing to mask by */ } }
  }
  const uniqueHosts = [...new Set(hosts)];
  return { read: true, labels, hosts: uniqueHosts, stems: [...new Set(uniqueHosts.map(stemOf).filter(Boolean))] };
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A name bounded by non-alphanumerics, case-insensitive: `_` and `-` separate, so x_acme_itsm and ACME-ITSM match. */
export const nameRe = (source) => new RegExp(`(?<![A-Za-z0-9])${source}(?![A-Za-z0-9])`, 'gi');

/** A multi-word value with any separator or none: "acme-bank" ~ "Acme Bank" ~ "AcmeBank" ~ "acme_bank". */
export const flexible = (value) => value.trim().split(/[-_\s.]+/).filter(Boolean).map(escape).join('[-_\\s.]?');

/** A store stem's suffix in a finding: any letters or digits, so `acme` also masks AcmeUtils and acmedev. */
export const STEM_ANY = '[a-z0-9]*';

/**
 * ARC-09-C242 — a sibling instance's suffix: an environment word, with digits before or after it, so `acmebank` masks
 * acmebankdev and acmebank01test but not a longer word it begins. A finding uses it for a stem that is a government's, a
 * sector's or a state's label, which begins too many ordinary words (`act` begins action, `mod` module, `in` instance),
 * and warns about it. Every other stem keeps STEM_ANY there: a finding is the user's own note, read before it is sent,
 * and a client's name that begins a word in it (AcmeUtils, svc_acmeintegration) is what it must not carry. The doctor's
 * JSON takes the same suffix, and a token boundary besides (maskStemWords).
 */
export const STEM_SIBLING = `[0-9]*(?:${['dev', 'test', 'prod', 'pdi', 'uat', 'qa', 'stg', 'stage', 'staging', 'sbx',
  'sandbox', 'train', 'training', 'demo', 'preprod', 'prd', 'tst', 'nonprod', 'np', 'sit', 'perf', 'int', 'dr', 'poc',
  'lab', 'hf'].join('|')})?[0-9]*`;

/**
 * The by-value entries, longest first: `[kind, source]` with `source` a regex source. A store stem matches with
 * `stemSuffix(stem)` after it, and an engagement name or alias with `nameSuffix(name)` (ARC-09-C251: none unless the caller
 * says so, which is the doctor's case, and finding.mjs's for a name of four letters or more). Environment words are never
 * names, and a stem that is one of the product's words is never one.
 */
export function byValueEntries({ engagement = '', aliases = [], labels = [], stems = [], usernames = [] } = {},
  { stemSuffix = () => STEM_ANY, nameSuffix = () => '' } = {}) {
  // Sorted by the VALUE's length, as the red-team's measured masker sorts, so the longer name wins where two overlap.
  // A stem counts STEM_ANY's length whichever suffix it is given, so overlaps resolve as before C242.
  return [
    ...[engagement, ...aliases].filter((v) => v && v !== '_unfiled').map((v) => ['engagement', v.length, `${flexible(v)}${nameSuffix(v)}`]),
    ...labels.filter((l) => !ENV_WORDS.has(l)).map((l) => ['instance', l.length, flexible(l)]),
    ...usableStems(stems).map((s) => ['instance', escape(s).length + STEM_ANY.length, `${escape(s)}${stemSuffix(s)}`]),
    ...usernames.map((u) => ['user', u.length, flexible(u)]),
  ].sort((a, b) => b[1] - a[1]).map(([kind, , source]) => [kind, source]);
}

/**
 * ARC-09-C242 — a store host, whole, as a regex source, never inside a word: a host holds no `_`, so
 * `snow_core_capabilities_read` is not the host `snow`. A host with a dot is never the front of a longer host either
 * (servicedesk.acme.io.example.org); a bare name may be (snow.acme.io), where the rest is masked as a host if it can be.
 */
export const hostSource = (host) => (host.includes('.') && !host.startsWith('[')
  ? `(?<![\\w.-])${escape(host)}(?![\\w-]|\\.[A-Za-z0-9])`
  : `(?<![\\w.-])${escape(host)}(?![\\w-])`);

/**
 * ARC-09-C242 — the store's stems in the doctor's JSON, by the architect's ruling of 2026-10-28. A stem masks its whole
 * word, the run of letters and digits it starts, when what follows the stem in that word is
 *   - nothing, or a sibling instance's suffix (STEM_SIBLING): acmebank, acmebankdev, acmebank01test;
 *   - or begins at a token boundary, an uppercase letter or a digit: AcmeBank, ACMEMID01, acmeUtils, acme2, acme2foo.
 * A lowercase continuation is not a boundary, so `./snowarch` and `corpus` stay readable under the stems `snow` and
 * `corp`. The cost is that `acmebank` stays under the stem `acme`, where a finding masks it: the client-confidentiality
 * rule outranks readability, and that is the line the architect drew. A `-`, `_` or `.` ends the word, so acme-prod,
 * acme_core and acme.getManager are whole names. The stem matches in any case; the boundary is read as written.
 * The caller passes the stems it uses, and `to(word)` names what replaces a word.
 */
export function maskStemWords(text, stems, to) {
  const sibling = new RegExp(`^${STEM_SIBLING}$`, 'i');
  let out = text;
  for (const s of [...stems].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(?<![A-Za-z0-9])${escape(s)}([A-Za-z0-9]*)`, 'gi'),
      (word, rest) => (rest === '' || sibling.test(rest) || /^[A-Z0-9]/.test(rest) ? to(word) : word));
  }
  return out;
}

/** Replace every by-value match; `to(kind, match)` names what replaces it. */
export function maskByValue(text, entries, to) {
  let out = text;
  for (const [kind, source] of entries) out = out.replace(nameRe(source), (m) => to(kind, m));
  return out;
}
