<!-- This page IS the README's body: `README.md` = `docs/README-head.md` + everything from the
     first `## ` below, composed by `scripts/gen-readme.mjs` and checked in CI. Edit this file, never
     README.md. The four `<!-- generated:… -->` regions are written from the code that prints those
     sentences, so the page cannot describe an install the tool does not perform. -->

## Install

Two ways in. **Path A** starts in a terminal and is shorter; **Path B** starts inside Claude Code,
for people who would rather ask than type. Both end in the same place: a checkout running
design-only, with live mode one command away.

Coming from `claude-servicenow-live` / `snow-mcp`? Follow [MIGRATION.md](MIGRATION.md).

### Prerequisites

Checked by the bootstrap, never installed by it.

| For | Requirement | Why this floor |
|---|---|---|
| Everything | Claude **Sonnet** or a more capable model | the roster is validated on Sonnet; smaller models are not supported |
| Everything | Claude Code ≥ **2.1.214**, logged in | 2.1.196 settled the `.mcp.json` approval semantics, 2.1.198 the hook placeholders, and 2.1.214 keeps the previous tool list when a refresh fails |
| Everything | git ≥ **2.25** | cone-mode `sparse-checkout`, which is how the documentation corpus arrives |
| Live mode only | Node.js ≥ **20** (22 LTS recommended, 24 tested) with npm on PATH | the MCP server's own floor |
| Windows | PowerShell 5.1 (built in) and **Git for Windows** | the launchers need no Git Bash — but Claude Code's Bash tool does, and the in-session skills (`/snowarch status`, `/snowarch setup-instance`) run through it |

**Node.js is needed only for live mode.** Without it the install completes design-only and says so —
the doctor, the live wizard and the MCP server are what wait for Node.

### Path A — terminal first

```sh
git -c advice.detachedHead=false clone --branch v2.2.3 https://github.com/farstic/snowarch.git && cd snowarch && ./bootstrap.sh
```

**The `--branch` is not optional, and it names a release.** A plain `git clone` checks out this repository's default branch, which is not a release line and is a long way behind — cloning it installs a development tree with none of the released fixes. The tag above is the current release, and it is written by the release itself, so this page never names a version that has not shipped. The `-c advice.detachedHead=false` is there because a release tag is a *tag*: without it
git answers a correct command with fourteen lines about "detached HEAD", which means nothing is wrong.

To install a **different** version — pinning an older rollout, or testing a candidate — put its tag in the same place; `./snowarch upgrade` is the better tool for moving a checkout you already have.

An existing checkout moves between versions with `./snowarch upgrade`, which is the better tool once
you have one.

On Windows, three lines instead — or double-click `bootstrap.cmd` in the folder:

```bat
git -c advice.detachedHead=false clone --branch v2.2.3 https://github.com/farstic/snowarch.git
cd snowarch
.\bootstrap.cmd
```

Then run `claude` in that same folder, `snowarch` — the bootstrap's Next line prints its full path, such as `C:\Users\you\snowarch`. Started from any other folder, the one above it included, Claude Code loads none of this product, and `/mcp` shows nothing.

### What you will see

The bootstrap shows its plan before it does anything, and every step prints one line; from 2.1, B01 adds the signed
manifest it fetched (your release's tag and file count; this one on 2.1.0-rc.1). A real design-only run:

Five preflight checks print a line each on every path — git, Claude Code, disk, network, Node. The Node path adds two more lines, the checkout root and the platform, so a Node install prints seven and a Node-free one prints five. *(The root is checked on both; the Node-free launcher only speaks when it fails.)* Then:

```
[B00/09] preflight … ok (0.7 s)
Installing the AI ServiceNow Architect into this folder only — nothing else on the machine changes.
Two choices below, then it runs on its own (about a minute; live adds a short wizard).
Plan — Enter runs it as shown · type a number to choose that line's value · "?" explains · q quits
  1  Mode   design-only          live needs a ServiceNow instance (wizard runs in this terminal); Node 24.16.0 found
  2  Docs   sparse (20 areas)    full = whole corpus · skip = none (the doctor will report FAIL)
  Steps  B01 workspace · B02 docs · B05 tool list · B07 Claude settings · B09 summary
release manifest: v2.1.0-rc.1 fetched (372 files)
[B01/09] workspace … ok (2 s)
[docs] 31.5 s · pin 11b39be · sparse · complete
[B02/09] docs … ok (32 s)
[B03/09] mode … ok (0.0 s)
[B04/09] deps … skipped (design-only)
[B05/09] tool list … ok (0.0 s)
[B06/09] instance … skipped (design-only)
[B07/09] Claude settings … ok (0.0 s)
[B08/09] verify … skipped (design-only)
[B09/09] summary … ok (0.0 s)
```

It ends with the block below — the tool's own text, inserted here from its source:

<!-- generated:closing-block -->
```
DOCTOR: unavailable until Node 20+ is installed (design-only is complete)
Mode: design-only
Next: run `claude` in this folder: /Users/you/snowarch
      You will see one workspace-trust dialog — answer Yes.
      (If you are already inside Claude Code in this folder: exit it and start `claude` again.)
      Add a live instance later: run ./snowarch mode live, or /snowarch setup-instance inside Claude.
```
<!-- /generated:closing-block -->

`--yes` skips the plan screen. Interrupting with Ctrl-C is safe: the run records where it stopped,
and re-running resumes from that step rather than starting again.

### The licence

From 2.0.13 the product checks for a licence from the author. Copy the file you were given to `.local/licence.json` in the checkout, under that name — a copy under its own name is not read — before or after the install, which runs without one, and restart Claude Code. From the checkout folder, with the file in Downloads (`LIC-2026-0002.json` stands for your file's name):

```
cp ~/Downloads/LIC-2026-0002.json .local/licence.json                  # macOS or Linux
Copy-Item "$HOME\Downloads\LIC-2026-0002.json" .local\licence.json     # Windows PowerShell
```

`./snowarch licence check` shows its state, and names a licence it finds in `.local/` under another name with the command that renames it. Without a licence in force no tool runs, and no command but `licence`, `doctor`, `status`, `version`, `upgrade`, `bootstrap` and `mode design`.

### The dialogs

<!-- generated:dialogs -->
Starting `claude` in the checkout shows **one dialog**: workspace trust. Answer Yes.

Measured on Claude Code 2.1.258. The engine's floor is 2.1.214, where a second approval for the MCP server may still appear — the bootstrap prints how many to expect before you start, so the summary is the authority and this page is the expectation.
<!-- /generated:dialogs -->

### Path B — Claude first

```sh
mkdir my-engagement && cd my-engagement && claude
```

Accept the workspace-trust dialog, then paste exactly this:

> Install the AI ServiceNow Architect from https://github.com/farstic/snowarch into
> this folder, from release tag v2.2.3.

Claude runs two commands — `git -c advice.detachedHead=false clone --branch v2.2.3 https://github.com/farstic/snowarch.git .` and
`./bootstrap.sh --mode design --yes --skip-claude-check` — asking your permission for each unless the
session already allows them. They are written out here for a reason: if Claude proposes anything else
— cloning into a *subfolder* is the common variation — paste them yourself and you are back on the
path.

**A folder that already has files in it.** `git clone` refuses a non-empty directory, so the same
result is reached the long way:

```sh
git init
git remote add origin https://github.com/farstic/snowarch.git
git fetch --depth 1 origin main
git checkout -b main --track origin/main
```

This fails safely: if one of your files collides with one of the repository's, git refuses to
overwrite it. Move that file and run the checkout again.

**Then exit Claude and start it again.** `CLAUDE.md`, `.mcp.json` and `.claude/settings.json` are
read at session start, so the session that installed them has not read them — and it has not been
asked to trust the folder either, which is why it may say it is *ignoring* the settings it just
cloned. The restart is what fixes both.

### Team variant

One person runs Path A and commits nothing extra — the checkout is the repository everyone else
clones. `.local/` (state, credentials, logs) and `.claude/settings.local.json` (the per-machine
toggles) are gitignored. Everyone runs their own `./bootstrap.sh`, and live mode is per-person.

### Adding live mode later

```sh
./snowarch mode live            # Windows: .\snowarch.cmd mode live
```

That turns a design-only checkout into a live one — no re-clone, no re-registration — and
`./snowarch mode design` turns it back, keeping the instance; `./snowarch mode` says which you are
in. From inside Claude, `/snowarch setup-instance` walks you there and hands off to your own
terminal, because a credential must never pass through a chat transcript:

<!-- generated:terminal-handoff -->
```
Next step happens in YOUR terminal (credentials never pass through this chat).
1. Open a terminal at this checkout: <absolute path>
2. Run:   ./snowarch instance add <label> --url <url> --env <env> --auth <auth> --preset <preset> --default
   (Windows PowerShell/cmd:  .\snowarch.cmd instance add <label> --url <url> --env <env> --auth <auth> --preset <preset> --default)
3. The wizard proposes the environment and preset and shows a per-flag review — press Enter to accept, or edit any line.
4. Type your username and password when prompted (masked; nothing is echoed).
5. When it prints "Saved instance …", come back here and type:  /snowarch setup-instance --resume
I will wait. Nothing is written until you confirm in the terminal.
```
<!-- /generated:terminal-handoff -->

### Operators and CI — a live install with no keyboard

`./snowarch bootstrap --mode live --yes --instance-file <path>` reads its connection details from a
file instead of prompting, so a credential never passes through a command line, a transcript, an
environment dump or a shared config file. It is a **store document** — the same shape as
`.local/instances.json`, so `cp` from another checkout works:

```json
{ "version": 1,
  "instances": {
    "pdi": { "url": "https://dev123456.service-now.com",
             "auth": { "method": "basic", "username": "<user>", "password": "<password>" } } } }
```

It must be **mode 0600 or stricter** (checked before it is read) and somewhere git could not commit
it — outside the checkout, or gitignored inside it. `environment` and `preset` may be omitted: a
`dev*.service-now.com` URL proposes `pdi`, a sandbox the most permissive preset and production the
most restrictive, and every proposal is printed with `accepted: --yes` so nothing is decided
silently. Production above the read-only preset additionally needs `"prodWriteAck": true`. The
credential is authenticated **once** — a retry is the same wrong password sent again — and nothing
is saved unless it succeeds. The file is never copied, moved or deleted, and the run reminds you it
still holds your credentials; on Windows the mode cannot be checked and the run says so.

### Design-only without Node

When Node is absent the launcher finishes the whole design-only install in `sh` — on Windows under
`bootstrap.cmd`, with no Git Bash involved — and says what is waiting: `DOCTOR: unavailable until
Node 20+ is installed (design-only is complete)`. Nothing is half-done, and installing Node later
needs no re-clone. If `disableAllHooks` is set in your `.claude/settings.local.json` the session
banner will not run; the bootstrap neither sets nor removes that key, it says so and leaves it.

### Start `claude` at the checkout root

Claude Code reads `.claude/settings.json` and `.mcp.json` from the session's primary working
directory, so a session started inside `clients/<name>/` loads neither and the specialists are simply
absent. Engagement folders are `clients/<name>/` within the checkout, and each
engagement is its own clone: Claude Code's auto memory is per repository, so two in one clone share notes.

### If your organisation blocks project MCP servers

Some managed machines reject servers declared in a repository's `.mcp.json`. The same secret-free
entry can be registered for this checkout alone:

```sh
./snowarch mode live --register local
```

`--register user` is the last resort: it attaches the server to every project on the machine, which
the engagement boundary argues against, and refuses to run without `--ack-user-scope`. Both go
through the `claude mcp` CLI — this project never edits Claude Code's own configuration file.

### What to do if

Every preflight failure prints its own remedy. These are those sentences:

<!-- generated:remedies -->
| If | macOS / Linux | Windows |
|---|---|---|
| You are not at the checkout root | `cd "{root}" && ./bootstrap.sh` | `pushd "{root}"
.\bootstrap.cmd` |
| git is missing or too old | `xcode-select --install (or: brew install git)` | `winget install Git.Git` |
| Claude Code is missing or too old | `install Claude Code from https://code.claude.com/docs/en/setup, then re-run` | `install Claude Code from https://code.claude.com/docs/en/setup, then re-run` |
| Not enough disk space | `free up {needed} on {mount}` | `free up {needed} on {mount}` |
| github.com is unreachable | `check your network, or set HTTPS_PROXY / NO_PROXY for your environment, and re-run` | `check your network, or set HTTPS_PROXY / NO_PROXY for your environment, and re-run` |
| Node.js is missing or too old (live mode only) | `brew install node@22` | `winget install OpenJS.NodeJS.LTS` |
| A 32-bit Node.js build | `a 64-bit build of Node.js is recommended` | `a 64-bit build of Node.js is recommended` |
<!-- /generated:remedies -->

The full catalogue is `docs/TROUBLESHOOTING.md`. Whatever went wrong, re-run the bootstrap — it
resumes at the step that failed rather than starting over.

### What to paste in a bug report

```sh
./snowarch version      # engine version, contract sha, docs pin, the floors
./snowarch doctor       # every check, and the Mode line at the end
```

Those two answer almost every first question. Neither prints a credential: `version` reports what
was built, the doctor reports what was configured — never a password, never an instance address.

### What the corpus costs

**The corpus costs about 302 MB on disk and about 30 seconds to fetch** — a sparse, blobless
checkout of 19 areas out of 49,000 tracked paths. Two measurements, because they count different
things: the **working tree** is 179 MB on Linux and macOS, 183 MB on Windows, 34,360 files (25.3 s
Ubuntu · 27.5 s macOS · 35.1 s Windows, measured 2026-09-09 by `docs-real.yml`), and **tree plus
`.git`** is 302 MB macOS / 305 MB Ubuntu / 315 MB Windows (measured 2026-09-06, ARC-00 S-07). The
first is what you read, the second is what the disk loses. `--docs full` takes the whole corpus
instead: **447 MB and 48,997 files** (measured 2026-09-09 on the reference
macOS machine — ARC-00 S-07 did not measure full mode). Every release re-measures all three
platforms and attaches the same table as `install-metrics.md` —
[releases](https://github.com/farstic/snowarch/releases), the first one pending.

### Upgrading

```sh
./snowarch upgrade --check      # is a newer release out? (exit 4 = yes; nothing changed)
./snowarch upgrade              # plan first, then move: only the steps whose inputs changed re-run
```

Nothing is touched before the plan is printed and accepted: it names the release, the steps that
will re-run, whether the store's schema moves (a migration, with a 0600 backup, announced first),
and `credentials: untouched` — `.local/instances.json` is never read or written by an upgrade.
Restart `claude` afterwards; the server binary changed. `--to vX.Y.Z` takes a specific release and
prints how to return to your branch; a diverged branch is reported, and a file in the release's way is named; a failed
fetch prints git's error and a [proxy](TROUBLESHOOTING.md#proxy_unreachable) or [TLS](TROUBLESHOOTING.md#tls_ca_untrusted)
remedy. The banner mentions a newer release only from a check you already ran — it never fetches.

### Uninstall

**Deregister before you delete anything** — `./snowarch mode design`, always safe: with the default
registration it does nothing. That default goes through the `.mcp.json` committed here, so it lives
**inside the checkout** and dies with it — nothing of ours was written to Claude Code's own
configuration. With `--register local` or `--register user` the entry is instead in Claude Code's
`~/.claude.json`, **keyed by this folder's path**: deleting the folder leaves it there and `claude`
keeps trying to start a server from a directory that is gone. `mode design` removes it, and must run
while the checkout still exists.

Then delete the checkout: it holds the only copy of anything you configured, in `.local/` —
credentials included. If you used the CLI's own config directory (`~/.config/snowarch/`,
`%APPDATA%\snowarch\` on Windows), delete that too.

Already deleted the folder, or made the entry yourself rather than with `--register`? Remove it by
hand, from anywhere:

```sh
claude mcp remove servicenow -s local     # or -s user, whichever you used
```

Claude Code also keeps its own record that you trusted the folder. That one is harmless and refers to
a path that no longer exists.
