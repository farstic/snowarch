import type { ToolDefinition } from './types.js';
type Schema = Record<string, unknown>;
/** `schema` closed at the top, and one level down for an object argument that declares its own properties. A copy. */
export declare function closeSchema(schema: Schema): Schema;
/** A tool definition whose schema is closed. A copy; the definition it came from is not touched. */
export declare const closeTool: (tool: ToolDefinition) => ToolDefinition;
/**
 * Refuse a call whose arguments carry a property `tool`'s schema does not declare: INVALID_REQUEST, naming the
 * undeclared ones and the declared ones. Called before the handler, so nothing has been sent.
 */
export declare function refuseUndeclared(tool: ToolDefinition, args: unknown): void;
export {};
