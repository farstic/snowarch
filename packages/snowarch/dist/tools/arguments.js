// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C121 — the arguments a tool declares are the only ones it takes.
 *
 * The server passed `arguments` to the router unchecked and every handler read only the names it knew, so an
 * argument a tool does not declare vanished and the caller believed it had acted: on rc.3,
 * `snow_atf_atf_tests_index { "query": … }` answered the 20 active tests. Measured on the 399 schemas, none was
 * closed, and on eight create tools that set `active: true` themselves one undeclared `active: false` made a
 * live record — the worst a scheduled report that mails its recipients.
 *
 * So the check is ONE place, the router, before any request: an argument the schema does not declare is refused
 * with INVALID_REQUEST, naming it and the declared ones. Every schema is advertised closed
 * (`additionalProperties: false`), so a caller can see the rule as well as meet it. An object argument that
 * declares its own properties is closed and checked one level down; an object that declares none is a map of
 * columns (`fields`, `variables`) and stays open. The items of an array of objects are not checked.
 *
 * A per-call `instance` was ignored silently by ARC-04-S08's choice, because it was never offered. It is refused
 * too, with its own message: a write the caller believes goes to another instance would land on this one, which
 * is worse than a refusal.
 */
import { currentInstanceOrNull } from '../servicenow/context.js';
import { ServiceNowError } from '../utils/errors.js';
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
/** The properties an object schema declares, or null when it declares none (a map, which stays open). */
function declaredProperties(schema) {
    if (!isObject(schema) || !isObject(schema.properties))
        return null;
    return schema.properties;
}
/** An object argument that declares its own properties: closed, and checked one level down. */
const declaresItsOwn = (schema) => isObject(schema) && schema.type === 'object' && declaredProperties(schema) !== null;
/** `schema` closed at the top, and one level down for an object argument that declares its own properties. A copy. */
export function closeSchema(schema) {
    const props = declaredProperties(schema);
    if (!props)
        return { ...schema, additionalProperties: false };
    const closed = Object.fromEntries(Object.entries(props)
        .map(([key, prop]) => [key, declaresItsOwn(prop) ? { ...prop, additionalProperties: false } : prop]));
    return { ...schema, properties: closed, additionalProperties: false };
}
/** A tool definition whose schema is closed. A copy; the definition it came from is not touched. */
export const closeTool = (tool) => ({ ...tool, inputSchema: closeSchema(tool.inputSchema) });
const named = (names) => names.map((n) => `\`${n}\``).join(', ');
/**
 * Refuse a call whose arguments carry a property `tool`'s schema does not declare: INVALID_REQUEST, naming the
 * undeclared ones and the declared ones. Called before the handler, so nothing has been sent.
 */
export function refuseUndeclared(tool, args) {
    if (!isObject(args))
        return;
    const declared = declaredProperties(tool.inputSchema) ?? {};
    const undeclared = [];
    const inner = [];
    for (const [key, value] of Object.entries(args)) {
        if (!has(declared, key)) {
            undeclared.push(key);
            continue;
        }
        const prop = declared[key];
        if (!declaresItsOwn(prop) || !isObject(value))
            continue;
        const props = declaredProperties(prop);
        const extra = Object.keys(value).filter((k) => !has(props, k));
        if (extra.length === 0)
            continue;
        undeclared.push(...extra.map((k) => `${key}.${k}`));
        inner.push(`\`${key}\` takes ${Object.keys(props).join(', ') || 'nothing'}`);
    }
    if (undeclared.length === 0)
        return;
    const parts = [];
    if (undeclared.includes('instance')) {
        const label = currentInstanceOrNull()?.label;
        parts.push(`No tool takes \`instance\`: this call would go to the current instance${label ? `, "${label}"` : ''}. `
            + 'To use another instance, switch with snow_core_instance_switch first.');
    }
    const others = undeclared.filter((k) => k !== 'instance');
    if (others.length > 0) {
        const names = Object.keys(declared);
        parts.push(`${tool.name} takes no ${named(others)}; it takes ${names.length > 0 ? names.join(', ') : 'no arguments'}`
            + `${inner.length > 0 ? `, and ${inner.join('; ')}` : ''}.`);
    }
    throw new ServiceNowError(`${parts.join(' ')} Nothing was sent.`, 'INVALID_REQUEST', { tool: tool.name, undeclared, declared: Object.keys(declared) });
}
