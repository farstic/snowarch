// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S05 — is this checkout inside a folder something synchronises, and whose?
//
// WHETHER is already answered, by `isUnderCloudSyncFolder` in the committed server build. This
// module imports it rather than re-deriving it: a second segment table would drift, and the two
// would disagree about a path exactly when it mattered. What it adds is WHICH — the warning has to
// name the provider, because "a cloud-synced folder" tells someone nothing they can act on.
//
// The import reaches into `packages/snowarch/dist/`, which is IN-REPO committed JavaScript, not an
// npm dependency: the bootstrap still installs nothing, `dist-check` keeps the build current, and
// `paths.js` imports `node:` modules only — which matters, because B01 runs in a design-only
// checkout that has never seen `npm ci`.
import { isUnderCloudSyncFolder } from '../../../packages/snowarch/dist/store/paths.js';

/**
 * Segment → provider name. Ordered, and `Mobile Documents` sits first because macOS spells iCloud
 * as `Library/Mobile Documents/com~apple~CloudDocs`, which no user calls either of those.
 *
 * The list is the one in `packages/snowarch/tests/fixtures/cloud-sync-paths.json` — the fixture
 * this module, the server's `detectCloudSync()` and ARC-08-S03's E-25 all answer to (ARC-07-S07).
 */
const PROVIDERS = [
  [/^Mobile Documents$/i, 'iCloud Drive'],
  [/^com~apple~CloudDocs$/i, 'iCloud Drive'],
  [/^iCloud ?Drive([ _-]|$)/i, 'iCloud Drive'],
  [/^OneDrive([ _-]|$)/i, 'OneDrive'],
  [/^Dropbox([ _-]|$)/i, 'Dropbox'],
  [/^Google ?Drive([ _-]|$)/i, 'Google Drive'],
  [/^My Drive$/i, 'Google Drive'],
];

/** The macOS mount point, which names no vendor: checked only after every NAMED one has missed. */
const CLOUD_STORAGE = 'a cloud provider mounted under ~/Library/CloudStorage';

/**
 * The Windows variables the OneDrive client sets — the server's `ONEDRIVE_ENV_ROOTS`, in the same
 * order, checked BEFORE the name patterns (ARC-08-C2).
 *
 * They are the only detector for the case that matters most: enterprise "Known Folder Move"
 * redirects `Documents` and `Desktop` into OneDrive and the word OneDrive appears nowhere in the
 * path, so no segment table can ever see it.
 */
const ONEDRIVE_ENV_ROOTS = ['OneDrive', 'OneDriveCommercial', 'OneDriveConsumer'];

const split = (p) => String(p).split(/[\\/]/).filter(Boolean);

/**
 * The provider's name, or null. Both separators, because a Windows path can reach a POSIX test.
 *
 * THE ENVIRONMENT ROOTS COME FIRST (ARC-08-C2), for the reason above and because the server's
 * `detectCloudSync` has checked them from the start — this function had not, so the module's two
 * halves disagreed with each other on exactly that case: with `%OneDrive%` set to a redirected
 * Documents folder, `isUnderCloudSyncFolder()` (which delegates to the server's detector, and so
 * reads the ambient environment) answered TRUE while this answered null, and `cloudSyncWarning()`
 * therefore printed nothing. Measured before the fix. That is the disagreement this module's own
 * header says it imports the server's function to prevent, and the fixture's `env[]` rows were
 * read by nobody, so nothing caught it.
 *
 * NAMED VENDORS NEXT, across the whole path. `~/Library/CloudStorage/OneDrive-Corp/…` is both a
 * CloudStorage mount and a OneDrive one, and this used to answer with the mount — because
 * `CloudStorage` sat above `OneDrive` in the table and `Library` comes first in the path. Saying
 * "a cloud provider" about a folder whose name says OneDrive is this function refusing to read.
 * The server's detector had the same ordering bug, found by the same fixture row.
 *
 * `env` defaults to `process.env`, which is what the server does, so every existing caller gains
 * the case without being changed. It is a PARAMETER so a test can inject one — a rule that can only
 * be exercised by mutating the real environment is a rule nobody tests twice.
 *
 * NO `realpath`. The server resolves both sides through an injected one; this stays pure stdlib,
 * because B01 runs it in a checkout that has never seen `npm ci` and a function that touches the
 * filesystem is one more thing that can fail there. The fixture's rows need no resolution.
 */
export function cloudSyncProvider(p, { env = process.env } = {}) {
  if (!p) return null;
  const segments = split(p);

  for (const name of ONEDRIVE_ENV_ROOTS) {
    const root = env?.[name];
    if (!root) continue;
    const rootSegments = split(root);
    const under = rootSegments.length > 0
      && rootSegments.every((seg, i) => (segments[i] ?? '').toLowerCase() === seg.toLowerCase());
    if (under) return 'OneDrive';
  }

  for (const segment of segments) {
    for (const [pattern, name] of PROVIDERS) if (pattern.test(segment)) return name;
  }
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (/^Library$/i.test(segments[i]) && /^CloudStorage$/i.test(segments[i + 1])) return CLOUD_STORAGE;
  }
  return null;
}

/**
 * The sentence, or null.
 *
 * A WARN and never a FAIL: the user may have a reason, and refusing to install because of where
 * they keep their code would be this tool deciding something that is theirs to decide. What it must
 * not do is stay quiet — mode 0600 is a LOCAL permission, and the sync client runs as the same user.
 */
export function cloudSyncWarning(root, { env = process.env } = {}) {
  const provider = cloudSyncProvider(root, { env });
  if (!provider) return null;
  return `this checkout is inside a cloud-synced folder (${provider}) — `
    + '.local/instances.json will be synced even at mode 0600; prefer a local path such as '
    + '~/work/ (D-04)';
}

export { isUnderCloudSyncFolder };
