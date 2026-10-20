#!/usr/bin/env node
/**
 * snowarch CLI — five sub-commands.
 *
 * `start` is the only one implemented here; `instance`, `store`, `doctor` and `contract` each
 * hand off to their own module (ARC-07, ARC-09-S06, ARC-04-S12 and ARC-04-S06 respectively).
 * The command surface is what the `tools/snowarch` launcher forwards to — `dist/cli/index.js` is
 * a contract with ARC-06/ARC-07/ARC-09 and must not move.
 *
 * What is deliberately absent: the npm update check (it fetched a third party's
 * package record — P-18), the `setup`, `auth`, `instances`, `web`, `shortcuts`,
 * `capabilities`, `run` and `report` commands (D-03), and any coloured output — a
 * CLI that may be piped should not depend on a TTY library for five sub-commands.
 */
import '../env-sanitise.js';
