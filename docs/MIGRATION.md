# Migrating from claude-servicenow-live and snow-mcp

You are on this page because you installed the two-repository setup: the Architect engine in one
clone, the MCP server in another, registered by hand with Claude Code and carrying its credentials
in `~/.claude.json`. This page takes you to a working `2.0.0` checkout in one sitting, without
losing engagement content and without leaving a password behind.

Read it once before you start. Nothing in your old setup is modified until step 6, so you can stop
after any earlier step and still have exactly what you had this morning.

## An install of 2.2.0 or earlier

From 2.2.1 the Architect is installed from `https://github.com/farstic/snowarch.git`, and its signed manifest covers
more of the release than 2.2.0's did. An install of 2.2.0 or earlier checks a release by its own, older rule, so its
`upgrade` refuses 2.2.1 and changes nothing. It stops with one of these lines:

```text
upgrade: v2.2.1 has no verified signed manifest (… files in the published manifest differ from v2.2.1's own, the first .editorconfig) — nothing was changed
upgrade: v2.2.1 has no verified signed manifest (the published manifest names …, and v2.2.1 here is …) — nothing was changed
```

Such an install is replaced once, by a fresh install of the current release in the same folder, so Claude Code keeps
its memory and approvals for it, which follow the folder's path; the commands carry over what is yours. Run them from
the folder that contains it, with its real name in place of `snowarch`. A file the old install does not have is not
copied, and the copy says so.

macOS / Linux:

```sh
mv snowarch snowarch-2.2.0
git -c advice.detachedHead=false clone --branch v2.2.2 https://github.com/farstic/snowarch.git snowarch
cd snowarch
mkdir -p .local .claude
cp -p ../snowarch-2.2.0/.local/licence.json ../snowarch-2.2.0/.local/instances.json .local/
cp -p ../snowarch-2.2.0/.local/audit.jsonl .local/
cp -p ../snowarch-2.2.0/.local/audit.jsonl.1 ../snowarch-2.2.0/.local/audit.jsonl.2 ../snowarch-2.2.0/.local/audit.jsonl.3 .local/
cp -p ../snowarch-2.2.0/.claude/settings.local.json .claude/
cp -Rp ../snowarch-2.2.0/clients .
./bootstrap.sh --mode live
```

Windows PowerShell:

```powershell
Rename-Item snowarch snowarch-2.2.0
git -c advice.detachedHead=false clone --branch v2.2.2 https://github.com/farstic/snowarch.git snowarch
cd snowarch
New-Item -ItemType Directory -Force .local, .claude | Out-Null
Copy-Item ..\snowarch-2.2.0\.local\licence.json, ..\snowarch-2.2.0\.local\instances.json .local\
Copy-Item ..\snowarch-2.2.0\.local\audit.jsonl .local\
Copy-Item ..\snowarch-2.2.0\.local\audit.jsonl.1, ..\snowarch-2.2.0\.local\audit.jsonl.2, ..\snowarch-2.2.0\.local\audit.jsonl.3 .local\
Copy-Item ..\snowarch-2.2.0\.claude\settings.local.json .claude\
Copy-Item -Recurse ..\snowarch-2.2.0\clients .
.\bootstrap.cmd --mode live
```

The licence, the instance store and the audit trail of instance writes (`audit.jsonl`, and the three older files it
rotates into) carry over, and the new install continues the trail. The carried `.claude/settings.local.json` keeps your
permissions, environment and other hooks; its SessionStart hook is the bootstrap's, and it follows the new folder. An
install that ran design-only (no instance) leaves out `--mode live`. With the carried store, `--mode live` keeps its
default instance and does not run the wizard. Other folders of your own that git ignores (`deliverables/`, `memory/`,
`reports/`) are copied the same way if you have them. Do not copy the rest of `.local/`: it describes the old folder,
and a copied bootstrap record makes the new install skip steps it needs. Once the new install's `./snowarch status`
reads as the old one did, delete `snowarch-2.2.0`.

If its upgrade asks `Username for 'https://github.com':`, or stops with git's `could not read Username` followed by
`upgrade: git could not fetch the release tags; nothing was changed`, the install cannot reach the address it was
installed from: replace it as above.

## An install made with `clone --branch` of a 2.2.1 release candidate, or later

Such an install checks a release by the rule its own signed manifest carries, so it moves with the upgrade, from its
folder.

macOS / Linux:

```sh
git remote set-url origin https://github.com/farstic/snowarch.git
./snowarch upgrade
```

Windows PowerShell:

```powershell
git remote set-url origin https://github.com/farstic/snowarch.git
.\snowarch.cmd upgrade
```

The release tags your install already has stay where they are, so the upgrade's plan names the
version you are on as before, for example `v2.2.1-rc.1 → v2.2.1`, and goes ahead as usual.
Your `.local/`, your instances and your engagement folders stay where they are.

If the upgrade stops at its fetch with `! [rejected] v2.2.1 -> v2.2.1 (would clobber existing tag)`, the install holds
a tag of that name from its previous address: remove it with `git tag -d v2.2.1`, then upgrade again. Nothing else had
changed.

If the upgrade stops at its fetch with
`upgrade: origin asked for credentials, or was not found — it may be private or moved; check it with git remote get-url origin; nothing was changed`,
point the install at the address releases are published at: `git remote set-url origin https://github.com/farstic/snowarch.git`
from its folder, then the upgrade again.

An install that still has the v2.2.0 tag can go back with `upgrade --to v2.2.0`; it is then a 2.2.0 install again and
returns by the fresh install above.

The rest of this page is for the two-repository setup that came before 2.0.

## Who this is for

- You cloned `farstic/claude-servicenow-live`, or
- you cloned `farstic/snow-mcp`, or installed its npm package and registered it by hand, or
- both — which is the ordinary case, because the engine needed the server to reach an instance.

If you have never installed either, you want [INSTALL.md](INSTALL.md) instead. Nothing here applies
to a fresh machine.

## What changes

| Old | New |
|---|---|
| Two clones, kept in step by hand | One repository — `farstic/snowarch` |
| `claude mcp add servicenow-mcp …` with 12 `-e SERVICENOW_*` environment keys | A committed `.mcp.json`, server key `servicenow`. You never register anything |
| Credentials in `~/.claude.json` and `~/.config/servicenow-mcp/instances.json` | `<checkout>/.local/instances.json`, mode `0600`, never committed, never in argv |
| Tier 0 / Tier 1 / Tier 2 | Mode `design-only` or `live`, and a preset — `read-only`, `pdi-developer`, `full` or `custom` |
| `bash scripts/setup.sh`, `bash scripts/doctor.sh` | `./bootstrap.sh` (`bootstrap.cmd` on Windows), `./snowarch doctor` |
| `/status` | `/snowarch status` |
| `/setup-instance` | `/snowarch setup-instance` |
| A `.env` in the working directory, loaded automatically | Not read. Point `SNOW_ENV_FILE` at one if you want it |
| Field notes in one file | `docs/PLATFORM-NOTES.md` for platform facts; the server's own changelog and tests for server behaviour |
| `memory/MEMORY.md` | Retired. Engagement notes go to `clients/<name>/memory.md` (step 4); your own working preferences are Claude Code's own memory — whose index is also named `MEMORY.md`, a different file outside the checkout |
| Engine v2.8.0 · server 1.0.0 | One product, version `2.0.0` |

Everything below the table is the current vocabulary. The row on the left is the only place the old
words appear on this page, because they are what you are migrating *from*.

## Before you start

- **Half an hour**, uninterrupted. Steps 6 to 8 delete things, and the review in each is the point.
- **Your old checkout(s) still on disk.** Do not delete anything until step 4 has been verified.
- **The password for each instance**, because you will type it again — credentials are never copied
  from the old setup into the new one by any command here. If you do not have it, do step 9 first.

---

## 1. Preserve engagement content first

Take a fingerprint of `clients/` before anything else, so that step 4 can prove nothing was lost.

macOS / Linux:

```sh
cd <old-engine-checkout>
find clients -type f -print0 | sort -z | xargs -0 shasum -a 256 > ~/clients-before.sha256
wc -l ~/clients-before.sha256
```

Windows PowerShell:

```powershell
cd <old-engine-checkout>
Get-ChildItem clients -Recurse -File | Get-FileHash -Algorithm SHA256 |
  Sort-Object Path | Export-Csv $HOME\clients-before.csv -NoTypeInformation
(Import-Csv $HOME\clients-before.csv).Count
```

Then list the four things that are untracked and will not travel by themselves — they exist only
if you made them:

```sh
ls -la memory/ scratchpad/ deliverables/ diagram-preview/ 2>/dev/null
```

```powershell
Get-ChildItem memory, scratchpad, deliverables, diagram-preview -ErrorAction SilentlyContinue
```

## 2. Clone and bootstrap the new repository

**Clone the release tag, not the default branch.** A plain `git clone` takes this repository's default branch, which is not a release line and is a long way behind — you would migrate onto a development tree with none of the released fixes. The tag below is the current release and is written here by the release itself.

macOS / Linux:

```sh
git -c advice.detachedHead=false clone --branch v2.2.2 https://github.com/farstic/snowarch.git && cd snowarch && ./bootstrap.sh
```

Windows PowerShell:

```powershell
git -c advice.detachedHead=false clone --branch v2.2.2 https://github.com/farstic/snowarch.git
cd snowarch
.\bootstrap.cmd
```

The bootstrap prints a plan and waits. At step B03 it asks which mode you want: choose `live` if you
had a working instance, and B06 runs the instance wizard before the summary at B09. Choosing
`design-only` now is also fine — `./snowarch mode live` switches later, and the wizard runs then.

**Do not register anything.** The server registration is the committed `.mcp.json`; there is no
command for you to run and no environment key for you to set.

## 3. Bring your instance across

If you used the old wizard, its store is still on disk at
`~/.config/servicenow-mcp/instances.json` — on Windows that is
`%USERPROFILE%\.config\servicenow-mcp\instances.json`, *not* `%APPDATA%`: the old store used the
home directory's `.config` on every operating system. Import it:

```sh
./snowarch instance import --from-legacy
```

```powershell
.\snowarch.cmd instance import --from-legacy
```

The plan is printed first, and `--dry-run` stops there and writes nothing:

<!-- snippet:import-plan — byte-identical to docs/snippets/import-from-legacy.md; asserted by tests/migration-doc.test.mjs -->
```
$ ./snowarch instance import --from-legacy --dry-run
Legacy store: ~/.config/servicenow-mcp/instances.json (2 instances)
Target store: <checkout>/.local/instances.json (project)
  pdi   https://dev12345.service-now.com  pdi   basic       → preset pdi-developer
        notes: "/api" removed from URL; FLUENT set to off; dropped: addedAt, group
  prod  https://acme.service-now.com      prod  oauth_ropc  → preset read-only
        notes: per-user/impersonation mode is not carried (removed in 2.0.0); FLUENT set to off;
        production capped at read-only (D-05) — raise with: ./snowarch instance set-preset prod
        <preset> --ack-prod; tool package "minimal" not carried — 2.0.0 uses full (P-25); dropped:
        addedAt, aiBaseUrl, aiModel, aiProvider, apexEnabled, group, integrationMode, mcpEnabled,
        sdkEnabled; dropped: aiApiKey (a secret — not carried; delete the legacy file)
Each imported instance is probed before it is saved; an entry whose credentials fail is not saved.
```
<!-- /snippet:import-plan -->

Every entry that is not production then goes through a review screen, one line per flag, with what
each probe found:

<!-- snippet:review-screen-nonprod — byte-identical to docs/snippets/review-screen-nonprod.txt; asserted by tests/migration-doc.test.mjs -->
```
Permissions for instance "pdi" (environment pdi) — what Claude's tools may do there.
Proposed: full (everything on)
  1  [x] WRITE        probe: ok
  2  [x] CMDB_WRITE   probe: ok
  3  [x] SCRIPTING    probe: ok
  4  [x] ATF          probe: ok
  5  [x] NOW_ASSIST   probe: no Now Assist licence detected — tools will fail until licensed —
                      recommend: off (type 5)
  6  [x] FLUENT       probe: ServiceNow SDK not installed — recommend: off (type 6)
                      npm i -g @servicenow/sdk
Enter = apply as shown · a number opens that flag · "preset <name>" switches · "?" explains
```
<!-- /snippet:review-screen-nonprod -->

**Enter accepts the proposal as shown; any line is yours to edit first.** The screen proposes, it
does not decide — a failed probe changes the recommendation on that line and never the toggle. The
environment is asked, never guessed, and production is capped at `read-only` whatever the old file
said.

If you never used the old wizard, or would rather start clean:

```sh
./snowarch instance add
```

```powershell
.\snowarch.cmd instance add
```

From inside Claude, `/snowarch setup-instance` collects every non-secret choice and then prints the
exact command for you to run in your own terminal. **Credentials are typed in your terminal, never
pasted into a conversation** — the skill cannot type them and is not permitted to try.

## 4. Copy engagement folders

**One engagement per clone.** If your old `clients/` holds more than one engagement, repeat steps 2
and 3 once per engagement — a separate `git clone … <name>-architect && cd <name>-architect &&
./bootstrap.sh`, never a `git worktree` of one clone — and copy only that engagement's folder into
each: `mkdir -p clients && cp -R <old-engine-checkout>/clients/<name> ./clients/` (PowerShell:
`New-Item -ItemType Directory -Force .\clients | Out-Null; Copy-Item -Recurse
<old-engine-checkout>\clients\<name> .\clients\`). Claude Code's auto memory is shared by every
session in one repository, so two engagements in one checkout would share their notes — the one
arrangement the rule exists to prevent (`docs/CONTRIBUTING.md`, *Engagements and memory*). Each clone
has its own `.local/instances.json` (unless you chose `--global`), so step 3 runs again in each: the
import never deletes the legacy store, so it works from every clone — and step 8 waits until the last
one has imported. No command copies credentials from one clone to another.

The commands below are for the one-engagement case.

macOS / Linux:

```sh
mkdir -p clients && cp -R <old-engine-checkout>/clients/. ./clients/
find clients -type f -print0 | sort -z | xargs -0 shasum -a 256 > ~/clients-after.sha256
diff <(cut -d' ' -f1 ~/clients-before.sha256 | sort) <(cut -d' ' -f1 ~/clients-after.sha256 | sort) && echo "identical"
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force .\clients | Out-Null
Copy-Item -Recurse <old-engine-checkout>\clients\* .\clients\
Get-ChildItem clients -Recurse -File | Get-FileHash -Algorithm SHA256 |
  Sort-Object Path | Export-Csv $HOME\clients-after.csv -NoTypeInformation
Compare-Object (Import-Csv $HOME\clients-before.csv).Hash (Import-Csv $HOME\clients-after.csv).Hash
```

`diff` printing `identical`, or `Compare-Object` printing nothing, means every file arrived. The
comparison is on the hashes alone because the paths change — the old checkout's root is not the new
one's.

The hashes prove the bytes arrived, not where they landed: `ls clients` (`Get-ChildItem clients`) must show your
engagement names directly — not a second `clients` level, and not loose files.

`clients/` is ignored by git in the new repository, exactly as before: engagement content is yours
and is never committed.

**Then the four directories that do not travel by themselves.** They were listed in step 1 because
they are untracked; none of them has any meaning in the new repository, so each one's contents go
under the engagement that owns them:

| In the old checkout | Where it goes |
|---|---|
| `memory/MEMORY.md` | `clients/<name>/memory.md` |
| `scratchpad/` | `clients/<name>/` — or delete it, if it was scratch |
| `deliverables/` | `clients/<name>/` |
| `diagram-preview/` | `clients/<name>/` — or delete it, if it was a preview |

macOS / Linux:

```sh
mkdir -p clients/<name>
cp <old-engine-checkout>/memory/MEMORY.md clients/<name>/memory.md
cp -R <old-engine-checkout>/deliverables/. clients/<name>/
# and only the ones you are keeping:
cp -R <old-engine-checkout>/scratchpad clients/<name>/scratchpad
cp -R <old-engine-checkout>/diagram-preview clients/<name>/diagram-preview
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force clients\<name> | Out-Null
Copy-Item <old-engine-checkout>\memory\MEMORY.md clients\<name>\memory.md
Copy-Item -Recurse <old-engine-checkout>\deliverables\* clients\<name>
# and only the ones you are keeping:
Copy-Item -Recurse <old-engine-checkout>\scratchpad clients\<name>\scratchpad
Copy-Item -Recurse <old-engine-checkout>\diagram-preview clients\<name>\diagram-preview
```

`clients/<name>/memory.md` is a file you point Claude at when you want it ("read clients/acme/memory.md") — it is not read
automatically. Anything in it that every request should know — release family, naming conventions,
the sys_ids you keep looking up — belongs instead in `clients/<name>/<name>-engagement-state.md`,
which the Chief Architect reads at Phase 1 Step 2 whenever the engagement is named
(`docs/CLIENT-ONBOARDING.md` §3). Your own working preferences, as opposed to engagement content, are something Claude
records for itself now; `/memory` shows you what it has. `memory/` stays in the new repository's
`.gitignore` as a safety net, so a stray copy is never committed by accident.

## 5. Run the doctor

```sh
./snowarch doctor
```

```powershell
.\snowarch.cmd doctor
```

Expect **0 FAIL**. In the `legacy` section expect two WARN lines, which are the subject of the next
three steps. `E-23` finds what the old install left in Claude Code's own configuration:

```
WARN E-23 stale MCP registrations in ~/.claude.json
     stale MCP registration "servicenow-mcp" in ~/.claude.json for this folder (holds 3 env keys,
     1 credential-shaped — set (len 14)) · and 1 more under this folder · also registered under:
     /old/path (servicenow-mcp) — run the same command from that folder · 1 ~/.claude.json.bak-*
     file(s) present
     → claude mcp remove servicenow-mcp -s local        (run from this folder)
     → claude mcp remove nowaikit -s local        (run from this folder)
     → then review and delete ~/.claude.json.bak-* files — they retain the same secrets (ls -la ~/.claude.json.bak-* )
```

and `E-24` finds the old wizard's store:

```
WARN E-24 legacy wizard store
     legacy wizard store ~/.config/servicenow-mcp/instances.json present (2 instance(s); never read
     by this product)
     → ./snowarch instance import --from-legacy      (migrates entries, then advises deleting the directory)
```

The doctor **changes nothing** in either place — not now, not under `--fix`. Those files belong to
Claude Code and to a product that is not this one; the doctor's job is to print the exact command
and yours is to run it. Copy the commands; they are steps 6 to 8.

Your own numbers will differ: the names, the count of environment keys and the length are read from
your file. `set (len 14)` is the LENGTH of a credential the doctor found, never the credential.

## 6. Remove the stale registrations

Local-scope registrations are keyed on the **absolute folder path**, so each one is removed by
running the command from the folder it was made in. That is what "(run from this folder)" and "run
the same command from that folder" in the doctor's output mean. Wrap each command in the `cd` it
asks for:

```sh
cd <old-engine-checkout> && claude mcp remove servicenow-mcp -s local
cd <other-old-folder>   && claude mcp remove nowaikit -s local
```

```powershell
cd <old-engine-checkout>; claude mcp remove servicenow-mcp -s local
cd <other-old-folder>;    claude mcp remove nowaikit -s local
```

**If the folder no longer exists**, re-create it for the length of one command rather than editing
`~/.claude.json` by hand. This is the case `E-30` reports: it names every registration whose folder
is gone, under any server key — including this product's own, which `E-23` deliberately leaves alone
because under a folder that EXISTS such an entry is another working checkout. `E-30` is not in the
`--quick` subset, so it appears in `./snowarch doctor` rather than at session start:

```sh
mkdir -p <path> && cd <path> && claude mcp remove servicenow-mcp -s local && cd - && rmdir <path>
```

```powershell
New-Item -ItemType Directory -Force <path> | Out-Null
Push-Location <path>; claude mcp remove servicenow-mcp -s local; Pop-Location
Remove-Item <path>
```

Then confirm nothing is left. This lists every project that still carries a server registration:

```sh
jq '.projects | to_entries[] | select((.value.mcpServers // {}) | length > 0) | .key' ~/.claude.json
```

```powershell
(Get-Content $HOME\.claude.json | ConvertFrom-Json).projects.PSObject.Properties |
  Where-Object { $_.Value.mcpServers.PSObject.Properties.Count -gt 0 } | Select-Object -Expand Name
```

**Your new checkout must not appear in that list.** Its server lives in the committed `.mcp.json`,
which is not part of this file at all. The shorter form `select(.value.mcpServers != null)` also
works, with one difference worth knowing: it also lists projects whose registration block is present
but empty, which is what a removal leaves behind.

## 7. Delete the backups that still hold the secrets

Claude Code writes a backup beside its configuration whenever it rewrites it, and **every backup
retains the credentials the original had**. Removing the registration does not touch them. Review
the list, then delete:

```sh
ls -la ~/.claude.json.bak-*
rm ~/.claude.json.bak-*
```

```powershell
Get-ChildItem $HOME\.claude.json.bak-*
Remove-Item $HOME\.claude.json.bak-*
```

## 8. Delete the legacy store

Once the import in step 3 is done — or once you have decided you do not want those entries — delete
the old store. It holds `instances.json` and `tokens.json`, both in plain text. This is the same
command the import prints as its closing advice, and the import itself never deletes anything:

```sh
rm -r ~/.config/servicenow-mcp        # instances.json AND tokens.json — both plaintext
```

```powershell
Remove-Item -Recurse $HOME\.config\servicenow-mcp
```

On Windows the folder is `%USERPROFILE%\.config\servicenow-mcp\instances.json` — `$HOME` is
PowerShell's name for the same directory. After this, `E-24` reports ok.

## 9. Rotate what was exposed

Any password that sat in `~/.claude.json`, in one of its backups, or in your shell history should be
treated as known. Rotate it on the instance, then set the new one:

```sh
./snowarch instance set-credentials <label>
```

```powershell
.\snowarch.cmd instance set-credentials <label>
```

This is a recommendation, not a step the tool enforces. It is on the list because the old layout put
one credential in as many as six places, and steps 6 to 8 delete the copies — they cannot un-read
them.

---

## Verify

```sh
./snowarch doctor
```

```powershell
.\snowarch.cmd doctor
```

- **0 FAIL**, and `E-23` and `E-24` both ok: no stale registration, no legacy store.
- Start `claude` in the checkout. You get the workspace-trust dialog once, then a banner:
  `Mode: live — instance=<label> (<env>) preset=<preset>` — or `Mode: design-only` if that is what
  you chose.
- `/mcp` lists `servicenow` as connected.

From here, upgrades are one command: `./snowarch upgrade` — see
[INSTALL.md](INSTALL.md#upgrading).

## Optional cleanup

Yours to decide; nothing here is required and nothing else depends on it.

**The context-mode hook tooling.** The old setup's routing rules were personal tooling that this
product does not use or ship. If you want it gone:

```sh
claude mcp remove context-mode -s user
```

```powershell
claude mcp remove context-mode -s user
```

Then delete the `hooks` block from `~/.claude/settings.json` and the context-mode section from
`~/.claude/CLAUDE.md`. Both are yours to edit; nothing in this product reads either.

**The old checkouts.** Confirm nothing is uncommitted, then keep or delete them as you like — both
old repositories stay readable after archiving:

```sh
git -C <old-checkout> status --short
```

```powershell
git -C <old-checkout> status --short
```

**`core.hooksPath`** needs no action. It was set inside the old checkout and travels with it.

## Environment notes

**Behind a corporate proxy or a TLS-intercepting gateway.** `HTTPS_PROXY` and `NO_PROXY` are
honoured; for a private certificate authority, point Node at the root:

```sh
export HTTPS_PROXY=http://proxy.example.internal:8080
export NO_PROXY=localhost,127.0.0.1
export NODE_EXTRA_CA_CERTS=/path/to/corp-root.pem
```

```powershell
$env:HTTPS_PROXY = 'http://proxy.example.internal:8080'
$env:NO_PROXY = 'localhost,127.0.0.1'
$env:NODE_EXTRA_CA_CERTS = 'C:\path\to\corp-root.pem'
```

When a fetch fails, the error is classified and the remedy named:
[DNS_FAILURE](TROUBLESHOOTING.md#dns_failure),
[TLS_CA_UNTRUSTED](TROUBLESHOOTING.md#tls_ca_untrusted),
[PROXY_UNREACHABLE](TROUBLESHOOTING.md#proxy_unreachable).

**A checkout inside a cloud-sync folder.** The wizard and the doctor both warn before anything is
written, and the warning is worth reading rather than accepting: this checkout is under OneDrive,
Dropbox, iCloud Drive or Google Drive, and `.local/instances.json` at mode `0600` **will still be
synchronised** — `0600` is a local permission and the sync client runs as you. Move the checkout
outside the synced folder, or keep credentials in the global store with `--global`, or accept it
knowingly.

## Rollback

**Nothing in your old setup is modified until step 6.** Up to that point, rolling back is deleting
the new checkout and carrying on.

After step 6, to go back you re-register the old server with the command in the old repository's
own setup page. Be clear-eyed about what that does: it writes the credential into `~/.claude.json`
again, in plain text, which is the thing steps 6 to 8 were removing.

To remove the new checkout instead, follow [INSTALL.md](INSTALL.md#uninstall) — the checkout holds
the only copy of everything you configured, credentials included.
