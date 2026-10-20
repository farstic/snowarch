/**
 * ARC-09-C184 — a date-time the server writes, in the instance's internal format and in UTC.
 *
 * The Table API takes an actual value in GMT unless the call asks for display values
 * (`markdown/api-reference/rest-apis/c_TableAPI.md`, sysparm_input_display_value: "When false, the date and time value
 * is inserted using the GMT timezone"), and the internal format is `yyyy-MM-dd HH:mm:ss`
 * (`markdown/api-reference/server-api-reference/c_GlideDateTimeScoped.md`). An ISO string (`…T06:31:05.123Z`) was
 * stored as the date alone, at midnight (PN-22).
 */
export declare function glideDateTime(at?: Date): string;
