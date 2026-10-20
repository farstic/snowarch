// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C184 — a date-time the server writes, in the instance's internal format and in UTC.
 *
 * The Table API takes an actual value in GMT unless the call asks for display values
 * (`markdown/api-reference/rest-apis/c_TableAPI.md`, sysparm_input_display_value: "When false, the date and time value
 * is inserted using the GMT timezone"), and the internal format is `yyyy-MM-dd HH:mm:ss`
 * (`markdown/api-reference/server-api-reference/c_GlideDateTimeScoped.md`). An ISO string (`…T06:31:05.123Z`) was
 * stored as the date alone, at midnight (PN-22).
 */
export function glideDateTime(at = new Date()) {
    return at.toISOString().slice(0, 19).replace('T', ' ');
}
