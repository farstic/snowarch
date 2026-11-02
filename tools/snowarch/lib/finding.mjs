// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C221 — `/snowarch finding`'s masker: a user's finding, as text they can send to the person who issued their
// licence, with the client's data masked.
//
// The note stays in `clients/<engagement>/findings/`, which git ignores; what leaves is this script's output, and the file it
// writes from it (ARC-09-C258), so the masking is code with tests (tools/snowarch/tests/finding.test.mjs), never the model's
// care. The order and every rule are the architect's privacy red-team's (2026-10-23), measured on its corpus before this file
// was written: 6 of 42 leak cases survived, each a class no pattern catches and each named in the output's "Read before
// sending" list; ARC-09-C251 closed two, a MID host name and a ticket key that begin with a name the masker was given.
//
// The only path control there is: the skill's grant is a Bash rule, which cannot constrain arguments, so this script accepts
// nothing but a note under `clients/<engagement>/findings/` and refuses the rest with a sentence. It reads that note and writes
// exactly one file, beside it: `<note>.masked.txt`, the masked text and nothing else, under a name made from the note's, never
// from an argument (ARC-09-C258, `writeMaskedCopy`). The name is masked as the text is, because it travels with the file: a note
// named for the client gets no copy.
import { closeSync, existsSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { redact } from './redact.mjs';
import { byValueEntries, ENV_WORDS, hostSource, isPublicLabel, maskByValue, PRODUCT_STEMS, STEM_ANY, STEM_SIBLING, stemOf,
  storeHostValues, usableStems } from './mask-values.mjs';
import { FINDING_PATH } from './finding-path.mjs';

const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const KEEP_URL = /^https?:\/\/(?:(?:www\.)?servicenow\.com\/docs\/|docs\.servicenow\.com\/|developer\.servicenow\.com\/|support\.servicenow\.com\/kb|github\.com\/farstic\/)/i;
const KEEP_HOST = /^(?:(?:www\.|docs\.|developer\.|support\.)?servicenow\.com|github\.com|nodejs\.org|npmjs\.com|registry\.npmjs\.org)$/i;
const SN_HOST = /\.(?:service-now\.[a-z]{2,}|servicenowservices\.com)$/i;
const TLDS = 'com|net|org|local|corp|internal|lan|intra|intranet|cloud|eu|uk|bg|de|fr|nl|be|at|ch|it|es|pl|ro|gr|us|ca|au|ie|se|dk|no|fi';
const NOT_A_HANDLE = new Set(['do', 'js', 'mjs', 'json', 'md', 'xml', 'html', 'com', 'org', 'net', 'io', 'local', 'list', 'form']);

/** Shapes the red-team's second pass measured, run in front of the rest: certificates, tokens, directory names. */
function preMask(text) {
  let o = text;
  o = o.replace(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g, '<pem-block>');
  o = o.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, '<secret>');
  o = o.replace(/\b(CN|O|OU|L|ST|C|DC|STREET)=([^,\n+/]+)/g, '$1=<dn>');
  o = o.replace(/\b(user_name|sys_created_by|sys_updated_by|caller_id|assigned_to|opened_by|requested_for|approver)((?:\.[a-z_]+)?)(=|!=|LIKE|STARTSWITH)([^^&\s]+(?: [A-Z][a-z]+)?)/g, '$1$2$3<user>');
  o = o.replace(/(['"])([a-z]+)\.([a-z]+)\1/g, (m, q, a, b) => (NOT_A_HANDLE.has(b) ? m : `${q}<user>${q}`));
  o = o.replace(/\+\d[\d\s().-]{7,}\d/g, '<phone>');
  o = o.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, '<iban>');
  return o;
}

/**
 * The finding's text with the client's data masked, in the red-team's order. Each step runs before the ones whose
 * shapes it would otherwise break: a secret can contain anything, a URL or an e-mail carries names, and names by value
 * come only after the product's own shapes are held aside.
 */
export function maskFinding(text, { engagement = '', aliases = [], labels = [], storeUrls = [], usernames = [] } = {}) {
  const held = [];
  const hold = (s) => { held.push(s); return `\u0001${held.length - 1}\u0001`; };
  const seen = new Map();
  const tag = (kind, value) => {
    const k = `${kind}\u0000${value.toLowerCase()}`;
    if (!seen.has(k)) seen.set(k, [...seen.keys()].filter((x) => x.startsWith(`${kind}\u0000`)).length + 1);
    return `<${kind}-${seen.get(k)}>`;
  };
  // A trailing dot is dropped, as stemOf drops it: a store URL whose host ends in a dot names the host a note writes without it.
  const storeHosts = storeUrls.map((u) => { try { return new URL(u).hostname.toLowerCase().replace(/\.$/, ''); } catch { return null; } }).filter(Boolean);
  const stems = storeHosts.map(stemOf).filter(Boolean);
  const byLength = [...storeHosts].sort((a, b) => b.length - a.length);
  const dotted = (h) => h.includes('.') && !h.startsWith('[');
  let out = preMask(text);

  // 1. Secrets first: they can contain anything, including shapes the later rules would split.
  out = out.replace(/\b([a-z][a-z0-9+.-]*):\/\/[^\s:@/]+:[^\s@/]+@/gi, '$1://');
  out = out.replace(/(^|\s)(-u|--user)\s+\S+:\S+/g, '$1$2 <user>:<secret>');
  out = out.replace(/\b(password|passwd|pwd|secret|client_secret|token|api[_-]?key)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1$2<secret>');
  // A credential named in a sentence: the word, then "is", "was" or a space, then a value of 6 or more characters with
  // a digit or a symbol in it, which "the token is expired" and "password reset" do not have (the architect's case).
  out = out.replace(/\b(password|passwd|pwd|secret|token|api[ _-]?key|client[ _-]?secret)(\s+(?:is|was)\s+|\s+)(?=[^\s;,]{6,})(?=[^\s;,]*[^A-Za-z\s;,])[^\s;,]+/gi, '$1$2<secret>');
  out = out.replace(/\b(Basic|Bearer)\s+[A-Za-z0-9+/=._-]{8,}/g, '$1 <secret>');
  out = out.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<secret>');
  // 2. URLs whole: a path or a query carries sys_ids, view names and encoded queries. The keep-list stays verbatim.
  //    Sentence punctuation after a URL is the sentence's, not the URL's: taken into it, a comma made the store's own
  //    host unparsable, so it was tagged a plain <url>, and the comma was lost.
  out = out.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`)\]]+/gi, (whole) => {
    const [, u, tail] = /^([\s\S]*?)([.,;:!?]*)$/.exec(whole);
    if (KEEP_URL.test(u)) return `${hold(u)}${tail}`;
    let host = '';
    try { host = new URL(u).hostname.toLowerCase(); } catch { /* unparsable, still a URL */ }
    return `${(SN_HOST.test(host) || storeHosts.includes(host)) ? tag('instance-url', host || u) : tag('url', host || u)}${tail}`;
  });
  // 3. E-mails whole, before a name rule can break their shape.
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<e-mail>');
  // 4. Home paths (json-boundary's HOME_PATH shape) and the OneDrive folder that names the organisation.
  out = out.replace(/(?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/\s"'`,;:]*/g, '~');
  out = out.replace(/OneDrive - [^\\/\n]+/g, 'OneDrive - <org>');
  // 5. Network names: IPv4 addresses; the store's own hosts with a dot, whole, on a domain the TLD list may not know
  //    (ARC-09-C242); hosts on the TLD list; ServiceNow hosts written bare.
  out = out.replace(/(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\/\d{1,2})?(?!\d|\.\d)/g, '<ip>');
  for (const h of byLength.filter(dotted)) out = out.replace(new RegExp(hostSource(h), 'gi'), (m) => tag('instance-url', m));
  out = out.replace(new RegExp(`(?<![\\w.@-])(?:[a-z0-9-]+\\.)+(?:${TLDS})(?![\\w-]|\\.[A-Za-z])`, 'gi'), (h) => {
    if (KEEP_HOST.test(h)) return h;
    return (SN_HOST.test(h) || storeHosts.includes(h.toLowerCase())) ? tag('instance-url', h) : '<host>';
  });
  out = out.replace(/\b[a-z0-9-]+\.(?:service-now\.[a-z]{2,}|servicenowservices\.com)\b/gi, (h) => tag('instance-url', h));
  // 6. GUIDs, then sys_ids bounded by NON-HEX, so `sys_idIN<id>` and `_<id>` are caught and a longer sha is not.
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<guid>');
  out = out.replace(/(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/g, '<sys_id>');
  out = out.replace(/(?<![0-9A-F])[0-9A-F]{32}(?![0-9A-F])/g, '<sys_id>');
  // 7. The product's own shapes held aside before names by value: versions with their pre-release, CLI flags.
  out = out.replace(/(?<![\w.-])v?\d+\.\d+\.\d+(?:-(?:dev|rc\.\d+|alpha\.\d+|beta\.\d+))?(?![\w.-])/g, hold);
  out = out.replace(/(?<![\w-])--[a-z][a-z0-9-]*/g, hold);
  // 8. Names by value, longest first, case-insensitive and separator-flexible (mask-values.mjs, shared with the doctor).
  //    A stem masks every word it begins; one that is a government's, a sector's or a state's label, its whole name and a
  //    sibling's (mask-values.mjs isPublicLabel).
  out = maskByValue(out, byValueEntries({ engagement, aliases, labels, stems, usernames },
    { stemSuffix: (s) => (isPublicLabel(s) ? STEM_SIBLING : STEM_ANY), nameSuffix }),
  (kind, m) => (kind === 'engagement' ? '<engagement>' : tag(kind, m)));
  //    Then the store's own hosts with no dot, a bare name or an IPv6 address, whole (ARC-09-C242). After the names, so
  //    a name that holds one as a part (`itsm.acmebankuk`, `Snow Acme Holdings`) is masked whole first; and after
  //    step 5, so `snow.acmecorp.com` has been masked as a host.
  for (const h of byLength.filter((x) => !dotted(x))) out = out.replace(new RegExp(hostSource(h), 'gi'), (m) => tag('instance-url', m));
  // 9. A custom scope's vendor prefix names the customer whatever the folder is called; x_snc_ is ServiceNow's own.
  out = out.replace(/(?<![A-Za-z0-9])x_(?!snc_)(?!<)[a-z0-9]+_/g, 'x_<vendor>_');
  // 10. Record numbers: any admin-set prefix of 2 to 10 letters and 6 or more digits; lower case only with a non-hex
  //     letter, so a short git sha never reads as one.
  out = out.replace(/(?<![A-Za-z0-9])[A-Z]{2,10}\d{6,}(?![A-Za-z0-9])/g, '<record>');
  out = out.replace(/(?<![A-Za-z0-9])(?=[a-z]*[g-z])[a-z]{2,10}\d{6,}(?![A-Za-z0-9])/g, '<record>');
  // 11. redact() last, with ServiceNow script and page shapes held aside from its first.last rule.
  out = out.replace(/(?<![\w.])(?:current|previous|gs|gr|g_form|g_user|g_list|g_scratchpad|email|template|producer|workflow|action|answer|event|inputs|outputs|fd_data|task|incident|problem|change_request)\.[A-Za-z_]\w*/g, hold);
  out = out.replace(/\b[a-z][a-z0-9_]*\.(?:do|list|form|xml)\b/gi, hold);
  out = redact(out);
  for (let i = 0; i < 3 && /\u0001\d+\u0001/.test(out); i += 1) out = out.replace(/\u0001(\d+)\u0001/g, (_, n) => held[Number(n)]);
  return out;
}

const PRODUCT = new Set(['Service Desk', 'Now Assist', 'Business Rule', 'Script Include', 'Flow Designer',
  'Service Operations Workspace', 'Online Banking', 'Architect']);

/**
 * A product's name, alone or after a sentence-initial "The" (ARC-09-C257): "The Architect said …" names nobody, and nearly every
 * finding starts like that. The article is looked past only to find a product name, never dropped in general: "The Hague" stays.
 */
const isProduct = (hit) => PRODUCT.has(hit) || (hit.startsWith('The ') && PRODUCT.has(hit.slice('The '.length)));

/** Advisory, not a mask: capitalised runs and codes left in the masked text, likely names, places and systems. */
export function reviewList(masked) {
  const hits = masked.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b|\b[A-Z][A-Za-z]*\d+[A-Za-z\d]*\b|\b[A-Z]{3,}(?:-[A-Z0-9]+)+\b/g) ?? [];
  return [...new Set(hits)].filter((h) => !isProduct(h) && !/^(?:PN|ARC|E|SV)-/.test(h));
}

/** What no pattern catches, said every time: the reader checks these before sending. */
export const FIXED_REVIEW = Object.freeze([
  'people: names of colleagues, users and customers',
  'places: cities, sites and offices',
  'company names and abbreviations that neither the instance store nor aliases.txt holds',
  'ticket keys in other systems, such as Jira or Azure DevOps',
  'record numbers with fewer than 6 digits',
  'a credential written in plain words that no rule recognises',
]);

/** Said in the header and in the review list when the store's usernames and secrets were not read. */
const CREDENTIALS_NOT_READ = 'credentials NOT read — check usernames and passwords before sending';

/** Product words too common to be a client's name: a name that is one masks every use of the word. */
const PRODUCT_WORDS = new Set([...ENV_WORDS, 'incident', 'problem', 'change', 'request', 'task', 'case', 'knowledge',
  'service', 'desk', 'portal', 'workspace', 'itsm', 'csm', 'hrsd', 'itom', 'cmdb', 'now', 'servicenow', 'snowarch',
  'admin', 'user', 'group', 'flow', 'catalog', 'report']);

/**
 * ARC-09-C251, the architect's ruling of 2026-10-29: an engagement name or an alias of four letters or more masks every word it
 * begins, as a store stem does (AcmeMID01, acme01 and acmedev under `acme`), because a client's name leaking inside a glued token
 * is what the masker exists to stop. A shorter name stays whole-word, and so does one of the product's own words (`case`,
 * `snow`), which would otherwise read `caseload` and `snowarch` as the client; aliasWarnings says so for both.
 */
export const NAME_PREFIX_MIN = 4;
const nameSuffix = (name) => {
  const word = name.trim().toLowerCase();
  const letters = name.replace(/[^A-Za-z]/g, '').length;
  return letters >= NAME_PREFIX_MIN && !PRODUCT_WORDS.has(word) && !PRODUCT_STEMS.has(word) ? STEM_ANY : '';
};

/**
 * A warning for the engagement name, or an alias, of 3 letters or fewer, or one that is a product word. The printed copy goes to the
 * person who issued the licence, so a warning names the place (the engagement name; alias 1 is the first name in aliases.txt)
 * and never the value (the architect's review of 2026-10-28).
 */
export function aliasWarnings({ engagement = '', aliases = [] } = {}) {
  const out = [];
  const warn = (name, place) => {
    const letters = name.replace(/[^A-Za-z]/g, '');
    if (PRODUCT_WORDS.has(name.trim().toLowerCase())) {
      out.push(`warning: ${place} is a product word, so every use of that word is masked, wherever it means the product`);
    } else if (letters.length <= 3) {
      out.push(`warning: ${place} is ${letters.length} letters long, so it is masked wherever those letters stand alone`);
    }
  };
  if (engagement) warn(engagement, 'the engagement name');
  aliases.forEach((alias, i) => { if (alias) warn(alias, `alias ${i + 1} in aliases.txt`); });
  return out;
}

/** The store stems this masker uses, from its URLs: what the header counts and the warnings name (ARC-09-C242). */
const stemsOf = (storeUrls = []) => usableStems(storeUrls.map((u) => {
  try { return stemOf(new URL(u).hostname); } catch { return ''; }
}));

/**
 * ARC-09-C242 — a warning for a store stem the reader should know about, as for an alias, and as for an alias it names the
 * shape and never the name: the copy is sent to the person who issued the licence, and the name is the client's (the architect's
 * review of 2026-10-28). It describes the masking's own breadth, every instance in the store, so it names no engagement either. A
 * government's, a sector's or a state's label is masked as a word and in a sibling instance's name, not where it begins a longer
 * word; a stem of 3 letters or fewer, or one that is a product word, masks every word that begins with it.
 */
export function stemWarnings(storeUrls = []) {
  // One line per distinct warning: two stems of one class give the same sentence, and it is said once (ARC-09-C251).
  const lines = [...new Set(stemsOf(storeUrls))].flatMap((s) => {
    if (isPublicLabel(s)) {
      return ['warning: a store name is a government\'s, a sector\'s or a state\'s label: it is masked as a word and in a sibling instance\'s name, such as that name followed by dev, but not where it begins a longer word, so check those before sending'];
    }
    if (s.length <= 3) return [`warning: one store name is ${s.length} letters long, so every word that begins with it is masked`];
    return PRODUCT_WORDS.has(s) ? ['warning: a store name is a product word, so every word that begins with it is masked'] : [];
  });
  return [...new Set(lines)];
}

/**
 * The whole output: what ran, the warnings, the masked text, and what the reader must still check. The two tiers are
 * reported apart: the store's names can be read where its credentials cannot (a checkout without its dependencies, a
 * store the loader refuses), and a header that said only "(store read)" then hid unmasked usernames. `copyLine`, when given,
 * is the last paragraph (ARC-09-C258): where the masked copy was written, or that it was not.
 */
export function renderFinding(text, values = {}, { storeRead = false, credentialsRead = false } = {}, copyLine = '') {
  return renderMasked(maskFinding(text, values), values, { storeRead, credentialsRead }, copyLine);
}

/** `renderFinding` over text already masked, so a run masks once and the copy and the reply are the same masked text. */
function renderMasked(masked, values, { storeRead, credentialsRead }, copyLine) {
  const instanceNames = new Set([
    ...(values.labels ?? []).filter((l) => !ENV_WORDS.has(l)),
    ...(values.storeUrls ?? []).flatMap((u) => { try { return [new URL(u).hostname.toLowerCase()]; } catch { return []; } }),
    ...stemsOf(values.storeUrls),
  ]);
  const head = [storeRead
    ? `instance names masked by value: ${instanceNames.size} (store read)`
    : 'instance store NOT read — check every instance name',
  credentialsRead ? 'credentials read' : CREDENTIALS_NOT_READ].join(' · ');
  const review = [...(credentialsRead ? [] : [CREDENTIALS_NOT_READ]), ...reviewList(masked), ...FIXED_REVIEW];
  return [head, ...aliasWarnings(values), ...stemWarnings(values.storeUrls), '', masked.trimEnd(), '', 'Read before sending:',
    ...review.map((r) => `- ${r}`), ...(copyLine ? ['', copyLine] : []), ''].join('\n');
}

const refuse = (why) => ({ ok: false,
  reason: `finding: ${why}. Nothing was read: a finding is a note at clients/<engagement>/findings/<name>.md.` });

/** The note the path names, or why it is refused. Backslashes are read as separators. */
export function resolveFindingPath(root, arg) {
  const rel = String(arg ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (rel.split('/').includes('..')) return refuse(`"${rel}" contains ".."`);
  const m = FINDING_PATH.exec(rel);
  if (!m) return refuse(`"${rel}" is not under clients/<engagement>/findings/`);
  const [, engagement, name] = m;
  if (engagement === '_unfiled') return refuse('`_unfiled` holds design artefacts only, never a finding');
  if (!name.endsWith('.md')) return refuse(`"${name}" is not a .md note`);
  const path = join(root, 'clients', engagement, 'findings', name);
  let stat;
  try { stat = lstatSync(path); } catch { return refuse(`${rel} does not exist`); }
  if (stat.isSymbolicLink()) return refuse(`${rel} is a symlink`);
  if (!stat.isFile()) return refuse(`${rel} is not a file`);
  // A symlinked folder on the way resolves elsewhere: the real path must be the one asked for.
  if (realpathSync(path) !== join(realpathSync(root), 'clients', engagement, 'findings', name)) {
    return refuse(`${rel} resolves outside its findings folder`);
  }
  return { ok: true, path, engagement, name };
}

const today = () => new Date().toISOString().slice(0, 10);

/** A free path for a new note: <date>-<slug>.md, then -2, -3 and so on, so no note is overwritten. */
export function nextFindingName(root, engagement, slug, { date = today() } = {}) {
  if (engagement === '_unfiled') throw new Error('`_unfiled` holds design artefacts only, never a finding');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(engagement)) throw new Error(`"${engagement}" is not an engagement folder name`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`"${slug}" is not a slug: lowercase letters, digits and hyphens`);
  // ARC-09-C258: the masked copy is a file the user sends, so its name goes with it, and the name is made from this slug. One the masker
  // would change (the engagement's name, an alias) is refused here, before the note exists, which spares a rename. The check at copy time,
  // which also holds the store's names, is the guarantee. The refusal names no slug.
  if (maskFinding(slug, { engagement, aliases: readAliases(join(root, 'clients', engagement, 'findings', 'aliases.txt')) }) !== slug) {
    throw new Error('that slug holds a name the masker masks, and the masked copy\'s file name would show it: choose a slug that names the problem, never the client');
  }
  const base = `clients/${engagement}/findings/${date}-${slug}`;
  for (let n = 1; ; n += 1) {
    const rel = n === 1 ? `${base}.md` : `${base}-${n}.md`;
    if (!existsSync(join(root, rel))) return rel;
  }
}

/** The masked copy's name, beside the note: `<note>.md` becomes `<note>.masked.txt`, which resolveFindingPath does not take for a note. */
const maskedCopyName = (name) => `${name.replace(/\.md$/, '')}.masked.txt`;

const randomSuffix = () => randomBytes(6).toString('hex');

/**
 * The last line when the note's name holds a name the masker masks: the file's name would show it, and travels with the file. It
 * echoes no name, and no engagement either.
 */
const NAME_NOT_WRITTEN = 'Masked copy NOT written: the note\'s name holds a name the masker masks, and the file\'s name would show it. '
  + 'Rename the note without it and run again. Do not send the note.';

/**
 * ARC-09-C258 — the masked copy as a file beside the note, for the user to send in place of the printed text, which loses
 * characters when it is copied out of the Claude Code window: the masked text and nothing else, one final newline. The name is
 * made from the validated note's. The text goes to a temporary file in the same folder, opened exclusively with mode 0600, and
 * the temporary file is renamed over the destination, so an older copy or a symlink there is replaced, never followed or left
 * half written. A failure removes the temporary file it made, and is no error exit: the reply carries the text either way, and
 * its last line, returned here, says where the copy is or why it is not. It names the file by its name and never the folder, and
 * when a failed write leaves an older copy beside the note it says that copy is out of date and leaves it alone: it may have been
 * edited by hand. `write` and `suffix` are the test's seams.
 */
export function writeMaskedCopy(target, masked, { write = writeFileSync, suffix = randomSuffix } = {}) {
  const name = maskedCopyName(target.name);
  const dest = join(dirname(target.path), name);
  const temp = `${dest}.${suffix()}.tmp`;
  let fd;
  let made = false;
  try {
    fd = openSync(temp, 'wx', 0o600);
    made = true;
    write(fd, `${masked.trimEnd()}\n`);
    closeSync(fd);
    fd = undefined;
    renameSync(temp, dest);
    return `Masked copy written beside the note as ${name}: the text above and nothing else.`;
  } catch (e) {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* the failure being reported is the first one */ } }
    if (made) { try { unlinkSync(temp); } catch { /* nothing more can be done about it */ } }
    let older = false;
    try { older = lstatSync(dest).isFile(); } catch { /* no older copy */ }
    const code = e?.code ?? 'error';
    return older
      ? `Masked copy NOT written (${code}): the text above is the only current copy, and the older ${name} beside the note is out of date. Do not send it or the note.`
      : `Masked copy NOT written (${code}): the text above is the only copy. Do not send the note.`;
  }
}

/** The engagement's other names, one per line, `#` for comments; none when the file is absent. */
function readAliases(path) {
  try {
    return readFileSync(path, 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  } catch { return []; }
}

/**
 * The credential tier, this script's alone: usernames, through the store loader that registers the store's secrets
 * with the redactor as it parses (instance-file.mjs:135), so step 11 masks them by value. mask-values.mjs never reads
 * the credential block (label.ts:133), and nothing here prints a credential: it only feeds the masker. When it cannot
 * read them, the caller says so in the header and the review list; it never fails quietly.
 */
async function credentialValues(storePath, root) {
  const { loadContract } = await import('../../../packages/contract/lib/contract.mjs');
  const { readInstanceFile } = await import('./instance-file.mjs');
  const contract = loadContract({ root: ENGINE_ROOT, verifyPin: false });
  const r = await readInstanceFile(storePath, { root, contract });
  if (!r.ok) return { read: false, usernames: [] };
  return { read: true, usernames: Object.values(r.store.instances).map((e) => e?.auth?.username).filter(Boolean) };
}

/**
 * `finding.mjs <clients/<engagement>/findings/<name>.md>` prints the masked copy and writes it to `<name>.masked.txt` beside the
 * note; `finding.mjs --next-name <engagement> <slug>` prints a free path for a note.
 */
export async function main(argv, { root = ENGINE_ROOT, env = process.env, out = process.stdout,
  credentialReader = credentialValues } = {}) {
  if (argv[0] === '--next-name') {
    try { out.write(`${nextFindingName(root, argv[1], argv[2])}\n`); return 0; } catch (e) { out.write(`finding: ${e.message}\n`); return 2; }
  }
  // The note is the one argument: an --out, or any other, would say where the copy goes, and its name is made from the note's.
  if (argv.length > 1) {
    out.write(`${refuse('takes the note and nothing else, so there is no --out: the masked copy is written beside the note, under a name made from the note\'s').reason}\n`);
    return 2;
  }
  const target = resolveFindingPath(root, argv[0]);
  if (!target.ok) { out.write(`${target.reason}\n`); return 2; }
  const storePath = env.SNOW_STORE || join(root, '.local', 'instances.json');
  const hosts = storeHostValues(storePath);
  // A store that cannot be read at all has no credentials to read either; a loader that fails is reported, not hidden.
  let credentials = { read: false, usernames: [] };
  if (hosts.read) { try { credentials = await credentialReader(storePath, root); } catch { /* reported below, as NOT read */ } }
  const values = { engagement: target.engagement,
    aliases: readAliases(join(root, 'clients', target.engagement, 'findings', 'aliases.txt')),
    labels: hosts.labels, storeUrls: hosts.hosts.map((h) => `https://${h}`), usernames: credentials.usernames };
  const masked = maskFinding(readFileSync(target.path, 'utf8'), values);
  // ARC-09-C258: the copy is a file the user sends, so its name goes with it, and the name is made from the note's, which was only
  // checked for its format. A name the masker changes (the client's, an alias, a record number, a store's own) would show in the
  // attachment, so no file is written, and the last line says so without echoing it.
  const base = target.name.replace(/\.md$/, '');
  const nameClean = maskFinding(base, values) === base;
  const copyLine = nameClean ? writeMaskedCopy(target, masked) : NAME_NOT_WRITTEN;
  out.write(renderMasked(masked, values, { storeRead: hosts.read, credentialsRead: credentials.read }, copyLine));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
