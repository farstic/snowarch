/**
 * `code` is the registry's union, not `string`.
 *
 * A code reaches a user attached to a remedy, or it reaches them naked. Typing it means a literal
 * nobody registered is a compile error at the throw site — where the author is — rather than a
 * string that arrives in a session with nothing to do about it. The registry scan in
 * `tests/errors/codes.test.ts` is the second, independent check, because a type can be widened by
 * accident and a scan notices when it has been.
 */
export class ServiceNowError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'ServiceNowError';
    }
}
