# Install the AI Architect on Windows

AI ServiceNow Architect · Windows 10 (version 1809 or later) and Windows 11 · no administrator rights needed · the steps were tested end to end on a Windows 11 computer on 12 November 2026

This guide takes you from a Windows computer with nothing installed to a working AI Architect connected to your ServiceNow instance. Follow it from top to bottom. Plan about 30 minutes; most of it is waiting.

## What you need

- A computer with **Windows 10 (version 1809 or later) or Windows 11**, connected to the internet.
- About **2 GB of free disk space**. The ServiceNow documentation that the Architect reads takes about 490 MB, and draw.io about 500 MB.
- A **paid Claude plan**: Pro, Max, Ultra, Team or Enterprise, or a Claude Console account. The free plan does not include Claude Code.
- Your **licence file**: a small file named like `LIC-2026-0000.json`, saved in your **Downloads** folder.
- For a connection to ServiceNow (live mode): the **address of your instance** and a **user name and password** for it. On a personal developer instance (PDI) this is the `admin` user.
- **No administrator rights are needed.** Every program in this guide installs into your own user folder. If your company blocks downloads of programs altogether, ask your IT team.

## How to use this guide

- After the word **Run** comes a grey box with exactly **one** command. Copy it, click inside the PowerShell window, paste with a **right-click** (or Ctrl+V) and press **Enter**.
- After the words **On screen** comes a grey box that shows what you will see. You do not type those.
- Wait until the line that starts with `PS` comes back before you run the next command.
- Where a command contains `LIC-2026-0000.json`, use your own licence file's name instead. Where a command contains the label `pdi`, use your own instance label (wizard question 1).
- The screens in this guide are examples. Your version numbers, file counts, times, folders and free disk space differ.

> **Never paste several commands at once.** Paste one, press Enter, wait, then the next. In our own test a pasted block of three lines arrived broken, and PowerShell asked a question nobody expected.

> **Something unexpected on the screen?** Do not press Enter. Press **Ctrl+C** to cancel, then look it up in "If something goes wrong" at the end of this guide.

## Step 1 · Open PowerShell the normal way

PowerShell is the window where you type the commands in this guide.

1. Press **Win + R** (the Windows logo key and R together). A small *Run* box opens.
2. Type `powershell` and press **Enter**. Do not press Ctrl+Shift+Enter, and do not choose *Run as administrator*.
3. Look at the line where you type. It must start with `PS C:\Users\` followed by your user name.

On screen:

```
Windows PowerShell
...

PS C:\Users\you>
```

> **If it shows PS C:\WINDOWS\system32>** that is an **administrator** window. Close it and start again from 1. Files made from an administrator window may not be changeable later from a normal one, and everything the AI Architect runs from that window would run with full rights over the computer.

To be completely sure, run this check. It only reads.

Run:

```
whoami /groups | findstr Level
```

`Medium Mandatory Level` means a normal window, which is what you want. `High Mandatory Level` means an administrator window: close it.

A line saying *Cannot load PSReadline module* at the top of the window is harmless.

## Step 2 · Install the programs

You need three programs (Git, Node.js and Claude Code), plus draw.io Desktop for the diagrams in your Word documents (2f). You install them once per computer. Each download command fetches one file from that program's official site.

> **No administrator rights needed.** Every program goes into your own user folder (`%LOCALAPPDATA%\Programs`), so Windows never asks for an administrator password. Do not use `winget` for this guide: on many company computers it is broken or blocked, and its installers ask for administrator rights.

### 2a · Git for Windows

Downloads the AI Architect and keeps it up to date. First download the installer (67 MB):

Run:

```
mkdir "$env:TEMP\snowarch-dl" -Force | Out-Null; $ProgressPreference = 'SilentlyContinue'; iwr -UseBasicParsing https://github.com/git-for-windows/git/releases/download/v2.56.1.windows.1/Git-2.56.1-64-bit.exe -OutFile "$env:TEMP\snowarch-dl\git.exe"
```

Then install it for your user only. It shows nothing and takes about a minute; wait until the `PS` line comes back.

Run:

```
Start-Process "$env:TEMP\snowarch-dl\git.exe" -ArgumentList '/VERYSILENT','/NORESTART','/SUPPRESSMSGBOXES' -Wait
```

It installs into `%LOCALAPPDATA%\Programs\Git` and adds Git to your PATH.

### 2b · Node.js

Runs the part of the AI Architect that talks to your ServiceNow instance. This is the zip version (41 MB), which needs no installer. Download it:

Run:

```
$ProgressPreference = 'SilentlyContinue'; iwr -UseBasicParsing https://nodejs.org/dist/v26.13.0/node-v26.13.0-win-x64.zip -OutFile "$env:TEMP\snowarch-dl\node.zip"
```

Unpack it into your user folder:

Run:

```
Expand-Archive "$env:TEMP\snowarch-dl\node.zip" "$env:LOCALAPPDATA\Programs" -Force
```

Tell Windows where Node.js is, and where npm keeps the tools it installs (your account only). It is one long line; copy all of it. It prints nothing when it works.

Run:

```
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";$env:LOCALAPPDATA\Programs\node-v26.13.0-win-x64;$env:APPDATA\npm", "User")
```

If your company blocks files in the Temp folder, use `$HOME\Downloads` in place of `$env:TEMP\snowarch-dl` in these commands.

### 2c · Claude Code

The AI assistant that the Architect runs in.

Run:

```
irm https://claude.ai/install.ps1 | iex
```

It shows no progress while it downloads. Wait until the `PS` line comes back, and read the *Setup notes* it prints at the end.

### 2d · Tell Windows where Claude Code is

Windows looks for commands in a list of folders called **PATH**. The Claude Code installer may not add its folder to that list, and then Windows answers `'claude' is not recognized`, even in a new window. This command adds the folder for your account only. It is one long line; copy all of it. It prints nothing when it works. The installer prints this same command if it ever finds Claude Code installed but its folder not on PATH.

Run:

```
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";$env:USERPROFILE\.local\bin", "User")
```

### 2e · Open a fresh window and check

Close PowerShell and open a new one exactly as in Step 1, so it sees the new programs. Then run these four commands, one at a time.

Run:

```
claude --version
```

Run:

```
git --version
```

Run:

```
node --version
```

Run:

```
npm --version
```

On screen (the numbers on your computer may be higher):

```
2.1.322 (Claude Code)
git version 2.56.1.windows.1
v26.13.0
```

| Program | You need at least |
|---|---|
| Claude Code | 2.1.214 |
| Git | 2.34.1 |
| Node.js | v20. Step 2b installs v26.13.0, the version this guide was tested with. The AI Architect is tested with Node.js 20, 22 and 24 on Windows, macOS and Linux, and with 26 on Windows and Linux. |
| npm | Any version. It comes with Node.js. |

If one of them answers *is not recognized*, see "If something goes wrong".

### 2f · draw.io Desktop (for the diagrams)

The AI Architect draws its diagrams in draw.io and turns them into pictures for your Word documents. Without draw.io Desktop on this computer it stops with `ERROR: draw.io Desktop not found` and cannot make the Word file. This is the zip version (180 MB): no installer, no administrator rights. Download it:

Run:

```
$ProgressPreference = 'SilentlyContinue'; iwr -UseBasicParsing https://github.com/jgraph/drawio-desktop/releases/download/v32.6.10/draw.io-32.6.10-windows.zip -OutFile "$env:TEMP\snowarch-dl\drawio.zip"
```

Unpack it into your user folder:

Run:

```
Expand-Archive "$env:TEMP\snowarch-dl\drawio.zip" "$env:LOCALAPPDATA\Programs\drawio" -Force
```

The AI Architect looks for draw.io in that folder by itself, so there is no PATH command to run and no window to reopen. Check that the program is in place:

Run:

```
Test-Path "$env:LOCALAPPDATA\Programs\drawio\draw.io.exe"
```

It must answer `True`. draw.io renders on your own computer; nothing about your diagrams is sent anywhere.

## Step 3 · Sign in to Claude Code

You do this once per computer.

Run:

```
claude
```

1. Claude Code opens a short first-time setup in the window. Choose any colour theme, then choose to sign in with your Claude account.
2. Your browser opens. Sign in with your Claude account and allow access.
3. Go back to PowerShell. If Claude Code asks whether you trust this folder, answer **Yes**.
4. Type `/exit` and press Enter. You are back at the `PS` line.

## Step 4 · Download the AI Architect

This puts the AI Architect in a folder named `AI-Arch` inside your own user folder: `C:\Users\<you>\AI-Arch`. Run the three commands one at a time.

Run:

```
cd $HOME
```

Run:

```
git -c advice.detachedHead=false clone --branch v2.2.6 https://github.com/farstic/snowarch.git AI-Arch
```

Run:

```
cd AI-Arch
```

On screen:

```
Cloning into 'AI-Arch'...
remote: Enumerating objects: 814, done.
...
Resolving deltas: 100% (255/255), done.
warning: refs/tags/... is not a commit!
PS C:\Users\you> cd AI-Arch
PS C:\Users\you\AI-Arch>
```

The `warning: ... is not a commit!` line is harmless. Your line should now end in `\AI-Arch>`.

> **Why this folder.** The installer keeps your ServiceNow password in a file inside this folder (`.local\instances.json`) and locks that file, and the folder `.local` around it, so that only your account and the system can read them. It does this in whatever folder you choose, and the wizard says so when it saves; if that folder had let other accounts read the file, the wizard adds a line saying who could, and that the permissions were changed just now. Your user folder is private to you anyway, so it is the one this guide uses. If you prefer another folder, use its name in these commands and in "Every day". A folder name with a space in it has not been tested.

If git says the folder *already exists*, you already have a copy. Either continue with Step 5 in that folder, or pick another name and use it in both of the last two commands.

## Step 5 · Add your licence

Put the licence in place **before** you run the installer, so the install checks it together with everything else. All commands run in the `AI-Arch` folder.

### 5a · Make the folder for it

Run:

```
mkdir .local -Force
```

It prints a small table with the new folder `.local`. That is normal.

### 5b · Find the exact name of your licence file

Run:

```
Get-ChildItem $HOME\Downloads\LIC-*.json
```

Look at the *Name* column, for example `LIC-2026-0000.json`.

### 5c · Copy it into place

Use your file's name in place of `LIC-2026-0000.json`. It prints nothing when it works.

Run:

```
Copy-Item "$HOME\Downloads\LIC-2026-0000.json" .local\licence.json
```

> **The name must be exactly licence.json**, spelled with a **c**, the British way. A file called `license.json`, or one that keeps its original name, is not read.

## Step 6 · Run the installer

Run:

```
.\bootstrap.cmd
```

The installer works in four parts: it checks the computer, shows a plan, downloads what it needs, and asks seven questions about your ServiceNow instance. Each part is explained below, in the order you will see it.

### 6a · It checks your computer

On screen:

```
ok B00 root: C:\Users\you\AI-Arch
ok B00 git: 2.56.1
ok B00 claudeCode: 2.1.322 · login: ok
ok B00 disk: 830.0 GB free
ok B00 network: github.com reachable (HTTP 200)
ok B00 node: 26.13.0 · npm present
ok B00 platform: win32 x64 10.0.26200
[B00/09] preflight … ok (2 s)
```

| Line | What it checks |
|---|---|
| root | You started the installer from inside the AI Architect folder. |
| git | Git is installed and new enough. |
| claudeCode | Claude Code is installed and new enough; `login: ok` means you are signed in (Step 3). |
| disk | There is enough free space. |
| network | The computer can reach github.com, where the AI Architect comes from. |
| node | Node.js and its helper npm are installed. |
| platform | Your Windows version. Shown for information. |

Every line must start with `ok`. If one does not, that line says what to do. Do it, then run `.\bootstrap.cmd` again; it continues from where it stopped.

### 6b · The plan screen: choose live mode

On screen:

```
Installing the AI ServiceNow Architect into this folder only — nothing else on the machine changes.
Two choices below, then it runs on its own (a few minutes; live adds a short wizard).
Plan — Enter runs it as shown · type a number to choose that line's value · "?" explains · q quits
1  Mode   design-only    live needs a ServiceNow instance (wizard runs in this terminal); Node 26.13.0 found
2  Docs   full           full = whole corpus · skip = none (the doctor will report FAIL)
Steps  B01 workspace · B02 docs · B05 tool list · B07 Claude settings · B09 summary
>
```

| Line | Choices | What to pick |
|---|---|---|
| 1 Mode | **design-only** works from the ServiceNow documentation and the specialist skills, with no instance. **live** also connects one ServiceNow instance. | **live**, to work with your instance. Pick design-only only if you have no instance yet; you can add one later. |
| 2 Docs | **full** downloads all of the ServiceNow documentation. **skip** downloads none, and the health check then fails. | **Leave it on full.** |

To switch to live mode, press these keys:

1. Type `1` and press **Enter**. The mode menu opens (see below).
2. Type `2` and press **Enter**. The plan comes back with `Mode live` and more steps in the *Steps* line.
3. Press **Enter** once more. The install starts.

On screen after step 1:

```
> 1
Mode:
[1] design-only — works from the ServiceNow docs and the specialist skills; no instance (current)
[2] live — also connects one ServiceNow instance (the wizard asks for URL and login)
```

On screen after step 2:

```
1  Mode   live           live needs a ServiceNow instance (wizard runs in this terminal); Node 26.13.0 found
2  Docs   full           full = whole corpus · skip = none (the doctor will report FAIL)
Steps  B01 workspace · B02 docs · B04 deps · B05 tool list · B06 instance · B07 Claude settings · B08 verify · B09 summary
Mode → live · Enter runs it · 1 changes it again · q quits
>
```

Changed your mind before the last Enter? Type `1` again. `?` explains each line, and `q` quits without changing anything.

### 6c · It downloads the documentation (2 to 3 minutes)

On screen:

```
release manifest: v2.2.5 fetched (473 files)
[B01/09] workspace … ok (4 s)
[docs] checkout --detach c10276e … 89.9 s
[docs] 51,665 files · 299 MB working tree
citations: checked: 588 | dead: 0
[B02/09] docs … ok (147 s)
[B03/09] mode … ok (0.0 s)
[B04/09] deps … installing (npm ci)
[B04/09] deps … ok (7 s)
[B05/09] tool list … ok (0.0 s)
```

This downloads all 51,665 pages of ServiceNow documentation that the Architect reads before it answers. The screen can sit still for a minute or two. Let it run. In our test it took two and a half minutes.

### 6d · The instance wizard: seven questions

On screen:

```
Instance wizard — seven steps (six questions and a login check).
Have ready: the instance URL and a username + password for it. Nothing is saved until the end.
```

> **Made a mistake?** Nothing is saved until the very end. Press **Ctrl+C**, then run `.\bootstrap.cmd` again. It skips what is already done and brings you back to this wizard. After the wizard has finished, you change things with one command each; see "Change settings later".

#### Question 1 of 7 · Label

On screen:

```
[1/7] Label — a short name you will type in commands, e.g. pdi, acme-dev
Label [pdi]
```

- **What it is:** a nickname for this instance. You will use it later in commands, for example to change the password.
- **What to type:** a short name without spaces, such as `pdi` or `acme-dev`. The name in brackets is a suggestion: press **Enter** to take it.

#### Question 2 of 7 · Instance URL

On screen:

```
[2/7] Instance URL
Instance URL (https://<host>, no path)
```

- **What it is:** the address you open in your browser to reach ServiceNow.
- **What to type:** only the beginning, up to and including `.service-now.com`. Leave out everything after it.
- **Example:** if your browser shows `https://<your-instance>.service-now.com/now/nav/ui/home`, type `https://<your-instance>.service-now.com`. A slash at the very end does no harm: the wizard removes it and says `trailing slash removed`.

#### Question 3 of 7 · Environment

On screen:

```
[3/7] Environment
What is this instance?
[1] pdi — your personal developer instance (devNNNNNN.service-now.com)
[2] dev — a shared development instance
[3] test — a test / UAT instance
[4] prod — real users; the wizard saves it read-only
```

- **What it is:** what kind of instance this is. It decides which permissions the wizard proposes at question 7.
- **What to type:** the number of the matching line, then **Enter**. Choose honestly:

| Type | Choose it when |
|---|---|
| 1 (pdi) | It is your own free personal developer instance, usually devNNNNNN.service-now.com. |
| 2 (dev) | It is a development instance you share with your team. |
| 3 (test) | It is a test or UAT instance. |
| 4 (prod) | It has real users. The wizard saves it **read-only**: the Architect can read but cannot change anything there. |

Right after this question the screen shows a line like the one below. It only reports your proxy settings; you type nothing. `unset` is normal. Behind a company proxy, see "If something goes wrong".

```
network: HTTPS_PROXY=unset · NO_PROXY=unset · NODE_EXTRA_CA_CERTS=unset
```

#### Question 4 of 7 · Authentication

On screen:

```
[4/7] Authentication
Authentication?
[1] basic — username + password (recommended for PDI; no instance-side setup) · Enter picks this
[2] oauth_ropc — OAuth password grant (legacy; needs client id + secret AND a user password;
instances can disable it)
```

- **What it is:** how the AI Architect signs in to ServiceNow.
- **What to type:** `1` (basic), or just press **Enter**. Choose `2` only if your ServiceNow administrator gave you an OAuth client ID and secret and asked you to use them.

#### Question 5 of 7 · Credentials

On screen:

```
[5/7] Credentials
Username (a ServiceNow user on this instance — admin on a PDI) admin
Password (nothing is shown while you type):
```

- **What to type:** the user name and password you use to log in to this instance in the browser. On a PDI the user name is `admin`.
- **The password:** nothing appears while you type it, not even dots. That is on purpose. Type it, or paste it with a right-click, and press **Enter**.
- **Where it goes:** it stays on this computer, in your AI Architect folder. It is never sent into the chat with Claude.

#### Question 6 of 7 · Login check

On screen:

```
[6/7] Checking the login and what this account may do (read-only, a few seconds) …
[INFO] Querying ServiceNow table: sys_user
[INFO] Querying ServiceNow table: sys_user_has_role
[INFO] Querying ServiceNow table: sys_update_set
... four more lines like these
```

- **What happens:** the installer signs in and reads a few tables to learn what your account may do. It changes nothing on the instance.
- **What to type:** nothing. The `[INFO]` lines are normal.
- **If it fails:** the message says why. Most often the address, user name or password has a typo. Nothing has been saved: press **Ctrl+C** and run `.\bootstrap.cmd` again.

#### Question 7 of 7 · Permissions

On screen:

```
[7/7] Permissions
Permissions for instance "pdi" (environment pdi) — what Claude's tools may do there.
Proposed: full (everything on)
1  [x] WRITE        probe: ok
2  [x] CMDB_WRITE   probe: ok
3  [x] SCRIPTING    probe: ok
4  [x] ATF          probe: ok
5  [x] NOW_ASSIST   probe: ok
6  [x] FLUENT       probe: ok
Enter = apply as shown · a number opens that flag · "preset <name>" switches · "?" explains
```

**What it is:** which kinds of changes the AI Architect may make on this instance. `[x]` means allowed and `[ ]` means not allowed. `probe: ok` means your ServiceNow account is able to do it.

| Permission | What it allows |
|---|---|
| WRITE | Create, update and delete records: incidents, catalog items, users, update sets. Without it, everything is read-only. |
| CMDB_WRITE | Also write configuration items and their relationships in the CMDB. Needs WRITE. |
| SCRIPTING | Write Script Includes, Business Rules, Client Scripts, ACLs and UI Actions. Reading them is always allowed. Needs WRITE. |
| ATF | Run Automated Test Framework tests. Reading tests and results is always allowed. |
| NOW_ASSIST | The Now Assist (generative AI) tools. Needs a Now Assist licence on the instance. |
| FLUENT | The ServiceNow SDK (Fluent) build and deploy tools. Needs the ServiceNow SDK installed on this computer. If you do not use it, switch it off. |

**To accept the list as it is,** press **Enter**.

**To change one permission,** for example to switch FLUENT off:

1. Type its number, `6`, and press **Enter**.
2. The screen shows `FLUENT:  [1] on (current)  [2] off`. Type `2` and press **Enter**.
3. The list comes back with `[ ] FLUENT`. Change others the same way, then press **Enter** to apply.

**To choose a ready-made set,** type `preset`, a space and its name, then press **Enter**:

| Preset | What is on | When |
|---|---|---|
| full | Everything | Proposed for pdi, dev and test instances. |
| pdi-developer | Everything except NOW_ASSIST and FLUENT | Building on a PDI, dev or test instance without the AI and SDK tools. |
| read-only | Nothing | Reviewing and designing against a real instance. The only choice for a prod instance. |
| custom | What you set by hand | Shown automatically after you change single permissions. |

> **The AI Architect always asks before it changes anything.** Even with every permission on, before each change on your instance it asks you a question of this form and waits for your answer: `About to <action> on instance "pdi" — write approved?` Permissions only say what it *may* ask for. Changing them here is not an approval.

On screen when it is saved:

```
Applying: preset custom — WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=on FLUENT=off
Saved instance "pdi" (pdi · basic · preset custom · default).
Probes: auth: ok · write: ok · cmdb_write: ok · scripting: ok · atf: ok · now_assist: ok
Saved to .local\instances.json in this folder — readable only by you.
[B06/09] instance … ok (92 s)
```

### 6e · The end of the install

On screen:

```
[B07/09] Claude settings … ok (0.3 s)
[B08/09] verify … ok (12 s)
[B09/09] summary … ok (4 s)
Health check (quick): 16 ok · 1 warn (E-31 the licence) · 0 fail · 26 more run with .\snowarch.cmd doctor
Mode: live — instance=pdi (pdi) preset=custom
Next: run `claude` in this folder: C:\Users\you\AI-Arch
You will see one workspace-trust dialog — answer Yes.
... a short list of commands for changing settings later ...
Press any key to continue . . .
```

- **Health check:** `0 fail` is what matters. A `warn` or a `fail` names the check it comes from. `E-31 the licence` warns in the last days before the licence ends. With a licence that runs for longer, this line shows no warning.
- **Mode:** says live, with your instance label.
- **Next:** names your folder. That is where you start Claude.

Press any key. You are back at the `PS` line.

## Step 7 · Check your licence

Run:

```
.\snowarch.cmd licence check
```

On screen (example):

```
Licence: ok · LIC-2026-0000 · until 2026-12-31
```

| First word | Meaning | What to do |
|---|---|---|
| ok | Everything works. | Nothing. |
| expiring | The last days before the end date. Everything still works. | Ask for a renewal; see "Licence renewal". |
| expired | The end date has passed. ServiceNow tools stop working. | Ask for a renewal. |
| missing | There is no .local\licence.json. | Repeat Step 5. |
| invalid | The file is damaged or is not a licence. | Ask for a new copy of the file. |
| revoked | The licence was withdrawn. | Contact whoever gave it to you. |

A licence works through its end date, counted in UTC time.

## Step 8 · Start the AI Architect

Always start it from inside your `AI-Arch` folder.

Run:

```
claude
```

1. Claude asks whether you trust this folder. Answer **Yes**. It asks only the first time.
2. Type `/mcp` and press Enter. Under *Project MCPs* you should see `servicenow` with a tick. Other lines come from your own Claude account and do not matter here. Press **Esc**.
3. Type `/snowarch status` and press Enter. The first lines should match the end of the install.
4. Ask a first question that only reads, for example *How many open incidents are there?* The AI Architect reads the answer from your instance and tells you what it read.

On screen after step 2:

```
Project MCPs (C:\Users\you\AI-Arch\.mcp.json)
√   servicenow                  399 tools
```

On screen after step 3:

```
Mode: live — pdi (pdi) · preset custom · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=on FLUENT=off · 399 tools (contract)
Licence: ok · LIC-2026-0000 · until 2026-12-31
Integrity: verified · v2.2.5 · 473 files
Docs: vendor/ServiceNowDocs @ c10276e95345 (australia) · full
```

> **You are done.** The AI Architect is installed, licensed and connected. The User Guide in your folder, `docs\USER-GUIDE.md`, shows how to work with it, with examples for analysts, architects and developers.

---

## Optional tools

The AI Architect works without them. Each one adds a feature, and each installs without administrator rights. Programs installed this way do not appear in *Apps & features* and do not update themselves: to update one, download the new zip and unpack it again.

| Tool | What it adds |
|---|---|
| ServiceNow SDK | The Fluent build and deploy tools, the FLUENT permission (wizard question 7). |
| Microsoft Word | Opens and checks the Word documents the Architect writes. Usually installed by your company. |
| PowerShell 7 | Not needed for the Word documents: the built-in Windows PowerShell 5.1 makes them (tested on 12 November). Only for other tools that call pwsh. |

### ServiceNow SDK

Run:

```
npm install -g @servicenow/sdk
```

Run:

```
now-sdk --version
```

Then switch the FLUENT permission on, in your AI-Arch folder (use your own label in place of `pdi`), and restart Claude:

Run:

```
.\snowarch.cmd instance set-flags pdi FLUENT=on
```

Tested: now-sdk 4.14.0 with Node.js 26 from the zip. npm may suggest a newer npm at the end; you can ignore it.

### PowerShell 7

Download `PowerShell-<version>-win-x64.zip` from github.com/PowerShell/PowerShell/releases into Downloads, then:

Run:

```
Expand-Archive -Path (Get-ChildItem "$HOME\Downloads\PowerShell-*-win-x64.zip" | Select-Object -First 1).FullName -DestinationPath "$env:LOCALAPPDATA\Programs\PowerShell7" -Force
```

Run:

```
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";$env:LOCALAPPDATA\Programs\PowerShell7", "User")
```

Open a new PowerShell window after these, so it sees the new PATH.

## Every day

1. Open PowerShell: **Win + R**, type `powershell`, press **Enter**.
2. Go to your folder (see below).
3. Start the AI Architect (see below).

Run:

```
cd $HOME\AI-Arch
```

Run:

```
claude
```

Start `claude` only from this folder. Started anywhere else, the AI Architect is not loaded and `/mcp` shows no servicenow line.

## Change settings later

You never need to reinstall to change a setting. Run these in PowerShell inside your `AI-Arch` folder, outside Claude. Afterwards, restart Claude: type `/exit`, then `claude`. Replace `pdi` with your own instance label.

**Change the password.** Run:

```
.\snowarch.cmd instance set-credentials pdi
```

**Switch to a ready-made permission set.** The last word is the set: `full`, `pdi-developer` or `read-only`. Run:

```
.\snowarch.cmd instance set-preset pdi pdi-developer
```

**Switch single permissions on or off.** Write each permission as NAME=on or NAME=off. This example allows record changes and blocks CMDB changes. Run:

```
.\snowarch.cmd instance set-flags pdi WRITE=on CMDB_WRITE=off
```

**Test the connection.** Run:

```
.\snowarch.cmd instance test pdi
```

**See your instances.** Run:

```
.\snowarch.cmd instance list
```

**Fix a wrong address.** Remove the instance, then add it again as described under "Add another instance". Run:

```
.\snowarch.cmd instance remove pdi
```

**Add another instance.** Inside Claude, type `/snowarch setup-instance`. It asks for a label and an address in the chat, then gives you one command to run in PowerShell, where you type the password. Your password never passes through the chat. When PowerShell says *Saved instance*, go back to Claude and type `/snowarch setup-instance --resume`.

**Work without the instance for a while.** Design-only mode keeps your saved instance but stops using it. Run:

```
.\snowarch.cmd mode design
```

Back to live mode. Run:

```
.\snowarch.cmd mode live
```

**Run the full health check.** Run:

```
.\snowarch.cmd doctor
```

## Licence renewal

When `licence check` says `expiring`, ask whoever gave you the licence for a renewal. You receive a new file. Save it in Downloads and copy it over the old one, using the new file's name. Run:

```
Copy-Item "$HOME\Downloads\LIC-2026-0000.json" .local\licence.json
```

Then restart Claude (`/exit`, then `claude`). The licence is read when Claude starts, so a window that was already open keeps the old state until you restart it.

> **After the end date** ServiceNow tools stop working. These commands still work, so you can see what is wrong and fix it: `licence`, `doctor`, `status`, `version`, `upgrade`, `bootstrap` and `mode design`.

## New releases

Check whether a newer release is out. This changes nothing. Run:

```
.\snowarch.cmd upgrade --check
```

Move to the newest release. Run:

```
.\snowarch.cmd upgrade
```

It shows a plan first and changes nothing until you accept it. Your instances and passwords are not touched. Restart Claude afterwards.

## If something goes wrong

| What you see | What to do |
|---|---|
| 'claude' is not recognized | Run the PATH command in Step 2d, close PowerShell and open a new one. |
| 'git', 'node', 'npm' or 'now-sdk' is not recognized | Open a new PowerShell window: programs installed in Step 2 are seen only by new windows. If it persists, repeat that program's part of Step 2, including its PATH command. |
| A password prompt for an administrator, or The operation was canceled by the user | You started a normal installer, and it needs administrator rights. Use the silent command in 2a for Git and the zip in 2b for Node.js; neither needs administrator rights. |
| winget answers 0x8a15000f : Data required by the source is missing | winget's package list is broken, and only an administrator can repair it. This guide does not use winget: follow Step 2. |
| ERROR: draw.io Desktop not found | draw.io is not in `%LOCALAPPDATA%\Programs\drawio`. Repeat 2f and check that the last command answers `True`. |
| 'irm' is not recognized | You are in Command Prompt, not PowerShell. Open PowerShell as in Step 1. |
| The line starts with PS C:\WINDOWS\system32> | An administrator window. Close it and open PowerShell as in Step 1. |
| An unexpected question such as Path[0]: | Press Ctrl+C, never Enter. Then paste one command at a time. |
| Cannot load PSReadline module | Harmless. Continue. |
| warning: refs/tags/... is not a commit! | Harmless. Continue. |
| A line in the installer's check (Step 6a) is not ok | The line says what to do. Do it, then run .\bootstrap.cmd again; it continues where it stopped. |
| github.com is unreachable, or you are behind a company proxy | Ask your IT team for the proxy address, set it in the window as shown below, and run the installer again. |
| The login check (question 6) fails | Check the address, user name and password. Press Ctrl+C and run .\bootstrap.cmd again. |
| After the password is saved, the wizard says Its permissions could not be restricted | Your password is saved, but Windows would not let the installer lock the file, so other accounts on this computer might be able to read it. Run .\snowarch.cmd doctor --fix. It shows what it will change and changes it when you press Enter. If it cannot lock the file either, send the output of .\snowarch.cmd doctor (see "Asking for help"). |
| /mcp shows no servicenow line | Claude was started outside your folder. Type /exit, then follow "Every day". |
| The licence says expired or missing | See "Licence renewal" or Step 5. |

Setting a company proxy for the current window (replace the address with the one from your IT team). Run:

```
$env:HTTPS_PROXY = "http://proxy.example.com:8080"
```

Reloading PATH in the current window instead of opening a new one:

Run:

```
$env:Path = [Environment]::GetEnvironmentVariable("Path", "User") + ";" + [Environment]::GetEnvironmentVariable("Path", "Machine")
```

### Asking for help

Run these two commands in your folder and copy their full output into your message. Neither shows your password or your instance address.

Run:

```
.\snowarch.cmd version
```

Run:

```
.\snowarch.cmd doctor
```

## Uninstall

1. In your folder, switch the AI Architect off. This is always safe (command below).
2. Close Claude and PowerShell, then delete the folder `C:\Users\<you>\AI-Arch` in File Explorer. This also deletes your saved password.
3. If the folder `%APPDATA%\snowarch` exists, delete it too.

Run:

```
.\snowarch.cmd mode design
```

## Your data and safety

- Your ServiceNow password is stored only in `.local\instances.json` inside your AI Architect folder. It never goes into the chat. Nobody helping you needs it, so never send that file.
- The installer locks that file, and the folder `.local` around it, so that only your account and the system can read them (the computer's administrators can always take a file over). `.\snowarch.cmd doctor` checks it (check SV-02) and names anyone else who could read the file; `.\snowarch.cmd doctor --fix` repairs it after showing what it will change.
- The AI Architect asks *write approved?* before every change on your instance, and a prod instance is saved read-only.
- Your licence file is issued to you. Do not share it.

## What has not been tested

This guide was written from one end-to-end install. Four things in it rest on something other than a run:

- **Windows 10.** The test machine ran Windows 11. Windows 10 (version 1809 or later) has the same PowerShell 5.1 and takes the same commands.
- **Claude Code's first-run screens on Windows** (Step 3). They are described in general terms because they change with Claude Code's releases.
- **A folder name with a space in it, a folder on a network drive, and a folder that OneDrive or another sync tool manages** (Step 4).
- **What the screens say after the licence has ended** (Step 7). The table is the product's own list of states, not a transcript of each one.

If you meet a difference, `.\snowarch.cmd version` and `.\snowarch.cmd doctor` (see "Asking for help") are what to send.

---

Tested end to end on 12 November 2026 on a company laptop: Windows 11 Enterprise (build 26200), a standard user without administrator rights. Git 2.56.1 (per user), Node.js 26.13.0 and npm 11.20.0 (zip), Claude Code 2.1.322, ServiceNow SDK 4.14.0, PowerShell 7.7.0 (zip; present on the test machine, not needed by this guide), draw.io 32.6.10 (zip), Word 16.0.20527; the AI Architect release of that day, in live mode, on a ServiceNow instance.
