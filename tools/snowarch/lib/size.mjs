// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C259 — one megabyte. The product counted it two ways: 2^20 bytes in the bootstrap's `[docs]` line, B00, B04, install-metrics
// and the footprint gate, and 10^6 in `./snowarch docs status`, docs-real and the install page, so one working tree read 279 MB in
// the first and 293 MB in the second. This is the one definition, the decimal one (the architect's ruling of 2026-11-01), the unit
// the page and a drive's own label use. A byte count becomes megabytes here and nowhere else: tests/size-unit.test.mjs fails on any
// other byte divisor under tools/ or scripts/ci. The two launchers cannot import this file, because they run before Node is known
// to exist; they hold the disk floor as a number of bytes, and the same test reads all three.
//
// stdlib only, and no imports at all: the scripts under scripts/ci import it too.

/** Bytes in a megabyte and in a gigabyte. */
export const MB = 1_000_000;
export const GB = 1_000_000_000;

/** A byte count as whole megabytes, rounded half up: `293`. */
export const megabytes = (bytes) => Math.round(bytes / MB);

/** A byte count as gigabytes to one decimal place, as text: `12.0`. */
export const gigabytes = (bytes) => (bytes / GB).toFixed(1);
