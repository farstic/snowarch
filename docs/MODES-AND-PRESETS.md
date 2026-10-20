# Modes and presets

What `design-only` and `live` mean, what each preset turns on, what each flag does, and how production is protected.
Every server behaviour here is current and tested; the screens quoted below are what the wizard prints.

## 1. Mode

**`design-only`** — no instance is configured. Everything works from `vendor/ServiceNowDocs`, the MCP write rules are
dormant, and `/mcp` shows `servicenow` disabled for this project. **`live`** — one or more instances in
`.local/instances.json`, each with its own preset. See which with `/snowarch status` or `./snowarch doctor --quick`:
the doctor's `Mode:` line is the statement of record, because a disabled family is still advertised in the tool list.
Switch with `./snowarch mode live` / `./snowarch mode design`. In a design-only checkout the first instance
arrives through `./snowarch mode live` itself: it installs the server dependencies and then starts the instance
wizard (with no terminal it says so and names `--instance-file`). Until that has run, `./snowarch instance add`
refuses (`Live mode is not installed yet — run ./snowarch mode live …`) and `/snowarch setup-instance` stops with
the same instruction. Once the checkout is live, further instances arrive through `/snowarch setup-instance` or
`./snowarch instance add`. Claude Code reads the mode toggle at session start, so after either switch restart
`claude` (or `/mcp → servicenow → reconnect`) — both commands end by printing that sentence.

Flags belong to the **instance you are addressing**, not to the server process: one server can hold a PDI and a
production instance at once, and switching the addressed instance with the `snow_core_instance_switch` tool (`name: "prod"` — a tool Claude calls
inside the session, not a shell command) makes the next write refuse while the same call on
the PDI still succeeds.

## 2. Presets

<!-- PRESETS:BEGIN (generated from the contract by scripts/gen-governance.mjs — ARC-05) -->
| Preset | WRITE | CMDB_WRITE | SCRIPTING | ATF | NOW_ASSIST | FLUENT | Use it when… |
|---|---|---|---|---|---|---|---|
| `read-only` | false | false | false | false | false | false | Auditing, reviewing, designing against a real instance; **the only preset a `prod` instance may hold without `--ack-prod`** |
| `pdi-developer` | true | true | true | true | false | false | Building on a PDI / dev / test instance when Now Assist or Fluent are not wanted |
| `full` | true | true | true | true | true | true | Everything on; **the system's proposal for every `pdi` / `dev` / `test` instance (D-05)**; NOW_ASSIST needs a licence, FLUENT needs `@servicenow/sdk` — both are probed and annotated before the user confirms |
| `custom` | six explicit toggles | | | | | | Anything else; dependency rule enforced |
<!-- PRESETS:END -->

`custom` is what any hand-toggled set of flags on the review screen becomes. Non-interactively it is
`--flags WRITE=on,CMDB_WRITE=on,…` in place of `--preset` at `instance add`; `preset custom` on the review screen
starts from all six off; later, `instance set-flags <label> FLAG=on|off …`.

Every preset writes **all six** flags as the byte-exact strings the server compares against (`"true"` / `"false"`),
plus `toolPackage: "full"` (the only tool package in 2.0.0) and
`maxRecords: 100` (the default page size for record queries on that instance, 1–1000). No `instance …`
sub-command changes these two; edit the store entry if you need a different `maxRecords`. Stored `flags` disagreeing with the table are reported as
`PRESET_FLAGS_MISMATCH` and **the preset wins**; omitting `flags` is not a disagreement — it takes the preset.

## 3. The six flags in plain language (in brackets, the key as written in the store and the environment)

- **WRITE** (`WRITE_ENABLED`) — create, update and delete records (incidents, catalog items, users, agile work, update
  sets). Without it everything is read-only.
- **CMDB_WRITE** (`CMDB_WRITE_ENABLED`) — additionally, CI and relationship reconciliation writes into the CMDB.
- **SCRIPTING** (`SCRIPTING_ENABLED`) — unlocks *writing* Script Includes, Business Rules, Client Scripts, ACLs, UI
  Actions and update-set changes. ***Reading* them is always allowed.**
- **ATF** (`ATF_ENABLED`) — *execute* ATF tests and suites; listing and reading tests, suites and
  results is always allowed. There is no ATF authoring tool: creating or editing a test record goes
  through the generic record tools and needs WRITE.
- **NOW_ASSIST** (`NOW_ASSIST_ENABLED`) — the Now Assist / generative-AI tools; needs a Now Assist licence on the
  instance.
- **FLUENT** (`FLUENT_ENABLED`) — the ServiceNow SDK (Fluent) build and deploy tools; needs `@servicenow/sdk` on `PATH`
  (install it globally: `npm i -g @servicenow/sdk` — the doctor checks `PATH`, so a checkout-local install does not
  count; see `docs/TROUBLESHOOTING.md`), and deploys also need WRITE.

**The dependency rule**, enforced in the wizard and again in the server: `SCRIPTING_ENABLED` and `CMDB_WRITE_ENABLED`
are writes, so declaring either without `WRITE_ENABLED` is a contradiction, resolved towards *less* access — the
dependent flag is treated as `false`, `FLAG_DEPENDENCY_VIOLATION` says so, and the file on disk is never modified by
the server.

Upgrading from the 1.0.0 server: SCRIPTING used to gate *reads* too, so listing a Script Include needed a write flag.
It no longer does. If you relied on that to keep script bodies out of a session, the control you want is a
role-restricted ServiceNow account — the flag was never a confidentiality boundary, and treating it as one hid that.

**Permission modes.** These are Claude Code settings. `./snowarch mode design` puts `servicenow` in
`disabledMcpjsonServers` in `.claude/settings.local.json`, which removes the server, so no tool exists and the
generated `allow`/`ask` lists are inert. `dontAsk` denies what `ask` would have prompted for,
which is safe. `bypassPermissions` skips both — never with a live write preset.

## 4. The review screen

The wizard never silently applies a preset. For a `pdi` / `dev` / `test` instance it *proposes*
`full` — non-production environments start with every capability available (D-05,
the permission-posture decision) — then shows a
per-flag review screen, each flag pre-set ON and annotated with its live probe result:

<!-- generated:review-screen-nonprod -->
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
<!-- /generated:review-screen-nonprod -->

A probe that fails downgrades the recommendation shown on that line; it never flips the toggle by itself.

Typing a flag name toggles it, and the **dependency rule** answers for the consequences: turning
`SCRIPTING` or `CMDB_WRITE` on with `WRITE` off asks whether to turn `WRITE` on as well (`n` leaves
both off — a contradiction the server would resolve by force is not a state to save), and turning
`WRITE` off with either of them on asks whether to turn those off too (`n` leaves `WRITE` on).

For a `prod` instance the proposal is `read-only`, every box locked, and the footer names the one
command that raises it:

<!-- generated:review-screen-prod -->
```
Permissions for instance "prod-acme" (environment prod) — what Claude's tools may do there.
Production is capped at read-only (D-05), so the boxes cannot be changed here.
  1  [ ] WRITE        locked on production
  2  [ ] CMDB_WRITE   locked on production
  3  [ ] SCRIPTING    locked on production
  4  [ ] ATF          locked on production
  5  [ ] NOW_ASSIST   locked on production
  6  [ ] FLUENT       locked on production
Enter = accept. To raise this instance later:
./snowarch instance set-preset prod-acme <preset> --ack-prod
```
<!-- /generated:review-screen-prod -->

**Propose, don't impose.** Design principle 10, recorded in the permission-posture decision (ADR-0005). The system proposes at every step; the user reviews and can change any single value at any level;
only then is anything applied. Enter accepts as shown, so the common path costs one keystroke and nothing is written
that the user has not seen. `--yes` accepts every proposal without the review screen — for CI, where nobody is there
to review.

**Environment detection:** a URL matching `^https://dev\d+\.service-now\.com$` — anchored at both ends, so `dev12345.service-now.com.evil.example` is not a PDI — is proposed as `pdi`;
any other host is *asked* — never guessed, because the environment is what decides whether a write
needs `--ack-prod`. All of it is re-editable later: `./snowarch instance set-preset <label>
<preset>` or `set-flags` for the permissions, `set-credentials` for the account. `/snowarch setup-instance` adds a
*new* instance — an existing label is refused with `LABEL_EXISTS`; to redo one from scratch (URL or environment
included), run the printed `instance add` command with `--replace`.

## 5. Production rules

An instance tagged `environment: prod` is capped at `read-only` unless the store carries `prodWriteAck: true`. The
threshold is **any** flag raised, not just `WRITE_ENABLED` — a `custom` prod instance with only `ATF_ENABLED` still
runs tests against production, and the acknowledgement is about having chosen that. Raising it requires `./snowarch
instance set-preset <label> <preset> --ack-prod`, with the label typed.

Without it the instance is **not loaded**, but still appears in the listing with its reason — "it is not there" is a
worse answer than "here is why it is not usable". Every refusal names the instance for the same reason: with several
configured, "writes are disabled" is not actionable on its own. Both carry the command that changes it:

```
[WARN] instance prod not loaded — PROD_WRITE_NOT_ACKNOWLEDGED: instance "prod": environment=prod with preset full but prodWriteAck is not true — not loaded.
       Raise it deliberately with: ./snowarch instance set-preset prod full --ack-prod
       (code PROD_WRITE_NOT_ACKNOWLEDGED)

Write operations are disabled for instance "prod" (preset read-only).
Instance "prod" is tagged prod and capped at read-only.
Raising it requires: ./snowarch instance set-preset prod <preset> --ack-prod
```

Every mutating call is recorded in the audit log, `audit.jsonl`, written beside the store the server reads (the
§6 order): `.local/audit.jsonl` for a per-checkout store, `~/.config/snowarch/audit.jsonl`
(`%APPDATA%\snowarch\audit.jsonl` on Windows) for a `--global` one, next to the file `SNOW_STORE` names when that
is set, and `.local/audit.jsonl` when the instances come from the environment and no store exists.
`SNOW_AUDIT_FILE=<path>` moves it; `SNOW_AUDIT_FILE=off` disables it — the server then prints
`[WARN] audit trail disabled` at start-up, and otherwise its start-up line `audit trail: …` names the file.

A call the licence refuses is recorded too, a read or a write alike (ARC-11-C1). Each refused call writes one
line: the tool, the instance label, `gate: "licence"`, `result: "LICENCE_NOT_VALID"`, the licence's id or
`missing`, and the state that refused it (`revoked`, `expired`, `invalid`, `missing`, or `scope` for a design-only
licence on a live server). It carries no argument and no value.

## 6. Where credentials live

One store. The first path that exists wins, and they are **never merged** — a merge makes "which file set this value"
unanswerable.

| Order | Source | Path |
|---|---|---|
| 1 | `SNOW_STORE` | the path it names. An **empty string counts as unset** — `.mcp.json` passes `${SNOW_STORE:-}` |
| 2 | per-checkout | `<CLAUDE_PROJECT_DIR or cwd>/.local/instances.json` (0600, gitignored, one per checkout) |
| 3 | global | `~/.config/snowarch/instances.json`, or `%APPDATA%\snowarch\instances.json` on Windows |

`SNOW_STORE` pointing at a missing file is an **error, not a fallback**: silently loading an instance other than the
one named is the failure an explicit override has to avoid. **Env-defined instances win over all three** — with
`SERVICENOW_INSTANCE_URL` or any `SN_INSTANCE_<NAME>_URL` set, those are the instances and no store is read. That is
the CI path, and the server says so: `instance source: env (SERVICENOW_*/SN_INSTANCE_*); store ignored: …`. The
variable names — per-instance `SN_INSTANCE_<NAME>_*`, the **bare** flag and tuning variables that apply to every env
instance at once, and the legacy set — are in `docs/ARCHITECTURE.md`, *Env-defined instances*.

**What protects the file.** It holds a password, so on macOS and Linux the *file* is refused — not warned about — if
it carries any group or world bit, and the message names the exact remedy:

```
Refusing to load <checkout>/.local/instances.json: file mode 0644 is group/world-readable.
Run, from the checkout: chmod 600 .local/instances.json
```

The remedy is checkout-relative inside the checkout, `~` under your home directory, and otherwise exactly as you typed
it — rewriting a path you named would point the command somewhere you did not choose. The *directory* is a different
risk: a 0600 file is unreadable wherever it sits, so what a directory bit buys an attacker is group or world **write**
— replacing the file, or planting a symlink where it was. So group/world writable **without** the sticky bit is
refused; with it (1777, as `/tmp` is) or with any other group/world bit the store loads with a warning; 0700 is
silent. On Windows the check is skipped (`file modes: ACL-inherited (Windows)`): the POSIX bits Node reports there are
synthetic, and asserting on them would fail for a protected file.

Writes are atomic — temp file, `fsync`, `rename` — so a reader never sees a half-written store, and paths in logs are
masked (home to `~`, the checkout to `<checkout>`) because a log line reaches screen shares and support tickets.

**A per-user store.** `instance add --global` writes `~/.config/snowarch/instances.json` (`$XDG_CONFIG_HOME` honoured)
or `%APPDATA%\snowarch\instances.json`, for the PDI you use from every checkout. The two stores are **never merged**:
`instance list --all` shows both with a `STORE` column, a label in both appears twice, and one note says which the
server reads here. Plain `list` shows the store in use and a footer naming what is in the other one.

**A store inside a cloud-sync folder** (OneDrive, Dropbox, Google Drive, iCloud Drive) is warned about BEFORE anything
is written: `0600` is a *local* permission and the sync client runs as the same user, so the mode does not stop the
file leaving the machine (D-04, the credential-policy decision, ADR-0004). The warning names the provider and
the exact folder, and the option Enter picks is **stop**, which says what it costs (ARC-07-W6):

```
WARN STORE_IN_CLOUD_SYNC_FOLDER: this checkout is under Dropbox (~/Dropbox/work/repo). File mode 0600
does not stop synchronisation … Options: move the checkout outside the synced folder, or `--global`.
This folder is inside Dropbox — the saved password file would sync with it.
  [1] stop — nothing is saved; clone outside the synced folder and start again · Enter picks this
  [2] continue — write the store here anyway
```

Enterprise "Known Folder Move" — `Documents` redirected into OneDrive with the word OneDrive nowhere in the path — is
caught by the `%OneDrive%` variables, the only detector that exists for it.

**What is never done:** credentials are never written to `~/.claude.json`, never passed in argv (§7), and never echoed
into a transcript.

## 7. Typing secrets safely

One place: an interactive terminal, where `snowarch instance add` reads it with echo off and it never reaches argv,
the environment or a transcript. When stdin is not a terminal the command **refuses** rather than reading the pipe — a
password read from an unexpected stdin is a password in a CI log — and prints the `NO_TTY:` line, which names
`--password-stdin` and shows the password manager form (`op read "op://vault/item/password" | ./snowarch instance add
…`). `--password`, `--client-secret` and `--secret` are rejected before the arguments are parsed at all. Should a
Windows console turn out not to support masked input (spike S-04),
that console gets the same `--password-stdin` line instead of a prompt that cannot work.

**A password manager, if you use one.** Each of these is optional and none of them is required to use the wizard; the
point is that the secret goes from the manager to the command's stdin without passing through a shell history, a
transcript or a file:

```sh
op read "op://Vault/PDI/password" | ./snowarch instance add pdi --url https://dev12345.service-now.com --env pdi --auth basic --username admin --preset full --password-stdin --yes
pass show snow/pdi | ./snowarch instance add pdi --url https://dev12345.service-now.com --env pdi --auth basic --username admin --preset full --password-stdin --yes
```

```powershell
Get-Secret -Name snow-pdi -AsPlainText | .\snowarch.cmd instance add pdi --url https://dev12345.service-now.com --env pdi --auth basic --username admin --preset full --password-stdin --yes
```

`--password-stdin` reads stdin to its end, so every later question — the review screen and make-default — has
nothing to read and the run saves nothing. (The cloud-sync question is no longer among them: ARC-07-W6 moved it
ahead of every other question, so it is asked before the pipe is read.) Pass `--yes` with it (name `--preset` or `--flags`; add `--default` if
wanted), and `--username` too, or `add` stops at the Username prompt and `set-credentials` takes the password as the
username.
`--yes` also answers §6's cloud-sync question yes, so use `--global` if that applies. The pipe is for `--auth basic`:
`oauth_ropc` must still ask for the Client ID after the pipe is read, so add or rotate those interactively. Rotating:
`… | ./snowarch instance set-credentials pdi --username admin --password-stdin`, saved only after the instance answers
ok.

`SNOWARCH_MASK=asterisk` prints one `*` per character instead of nothing, for a console where an invisible prompt
looks like a hang. It changes the display and nothing else — the value still never reaches argv, the environment or a
log.

**From inside Claude.** `/snowarch setup-instance` collects every non-secret choice in chat — instance kind,
authentication, preset, URL, label, default — and then hands over. It cannot type the credential: the wizard needs a
terminal that can mask what you type, and `./snowarch instance …` is deliberately absent from the skill's
`allowed-tools`.

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

`/snowarch setup-instance --resume` (or saying "done") reloads the store, reads the capabilities and runs the full
doctor, then prints the authoritative line — `Mode: live — pdi (pdi) · preset pdi-developer · WRITE=on … · <n> tools`
— **without restarting the session**, and closes with the write-gate reminder. If the tool list did not refresh, it
says so and names `/mcp → servicenow → reconnect` rather than leaving you guessing.

## 8. Corporate networks

The wizard prints one line per run naming what it found, whether or not the probe succeeded, because
"it worked" and "it worked through a proxy with a corporate CA" are different facts and only one of
them explains a colleague's failure:

```
network: HTTPS_PROXY=set (http://***@proxy.acme.internal:8080) · NO_PROXY=.acme.internal · NODE_EXTRA_CA_CERTS=/etc/ssl/acme-root.pem
```

`HTTPS_PROXY` / `HTTP_PROXY` and `NO_PROXY` are honoured with the rules every other tool uses;
`NODE_EXTRA_CA_CERTS` points Node at a corporate root so an intercepting proxy's certificate
validates. A failure is classified rather than guessed: DNS, TLS trust, a proxy that refused, a
proxy that wants credentials, a timeout, a refused connection — each with its own remedy in
`docs/TROUBLESHOOTING.md`. **Never** `NODE_TLS_REJECT_UNAUTHORIZED=0`: that trusts the interceptor
and everything else besides. NTLM and Kerberos proxies are out of scope.

## 9. Maintenance commands

Everything the wizard sets can be changed later, one command per thing, and what each may touch is
narrower than the store:

| Command | Writes | Asks |
|---|---|---|
| `instance list [--all] [--json]` | nothing | nothing |
| `instance test <label>` \| `--all --json` | `lastProbe` only | nothing |
| `instance set-credentials <label>` | `auth` and `lastProbe` (the probe it just passed), and only after the instance says ok | `Username [a***]:` then the masked secret |
| `instance set-preset <label> <preset>` | `preset`, `flags`, `prodWriteAck` | the review screen, unless `--yes` |
| `instance set-flags <label> FLAG=on\|off …` | the same three | the dependency question, unless `--yes` |
| `instance set-default <label>` | `defaultInstance`, and the `.local/config.json` mirror | nothing |
| `instance remove <label>` | deletes one entry | `Remove instance "pdi"? This deletes its stored credentials from …local/instances.json. [y/N]` |

Raising a production instance asks for the label to be typed back:

```
You are enabling WRITE (and CMDB_WRITE, SCRIPTING, ATF, NOW_ASSIST, FLUENT) on a PRODUCTION instance.
Every write still needs an explicit "write approved" in Claude and is recorded in .local/audit.jsonl.
Type the instance label to confirm:
```

A mismatch changes nothing (`Label mismatch — nothing changed.`). `--confirm-label <label>` is the
CI form — the label is still typed, on the command line — and the audit line records which of the
two it was. Dropping a production instance back to `read-only` clears the acknowledgement, so the
next raise is made again rather than inherited.

## 10. Migrating from snow-mcp

`instance import --from-legacy` reads the old `~/.config/servicenow-mcp/instances.json` — the same
path on every operating system — maps each entry and **shows the plan before writing anything**:

<!-- generated:import-plan -->
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
<!-- /generated:import-plan -->

`P-25` in that output is the 2.0.0 ruling that there is one tool package, `full`, so a legacy `minimal` (or any
other) value is dropped rather than carried.

`--dry-run` stops there. Each entry is probed once before it is saved, `FLUENT_ENABLED` is written
explicitly off (the old wizard never had it), production is capped whatever the legacy file said,
and `aiApiKey` is listed as dropped **by name** — its value is never printed. **It deletes nothing:**
the closing advice names the directory and the `tokens.json` beside the store, and the deleting is
yours. The plan above is the import's whole output. A user arriving from the old two-repository
install wants [MIGRATION.md, step 3](MIGRATION.md#3-bring-your-instance-across), which runs the
same import as one step of nine.

## 11. Known limitations

- **The `NOW_ASSIST` probe is not a licence check.** It reads a property; an instance can answer
  and still refuse the tools. The screen recommends, and you decide (D-05).
- **A macOS `~/Documents` redirected into a sync client is not detectable.** There is no environment
  variable to read and the path says nothing. Windows has `%OneDrive%`; macOS has nothing equivalent.
- **Team stores are a roadmap item.** `--global` is per user, not per team; a shared store is a
  different security question and is not answered here.
- **`client_credentials` is not supported.** The wizard offers Basic and the OAuth password grant
  (ROPC); anything else is re-entered when it arrives.
