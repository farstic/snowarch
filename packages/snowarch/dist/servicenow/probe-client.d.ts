import type { ProbeClient, TokenResult } from './probes.js';
import type { StoreInstance } from '../store/schema.js';
/** A probe client for one entry. `maxRetries: 0` is the rule, restated at the construction site. */
export declare const probeClientFor: (entry: {
    url: string;
    auth: StoreInstance["auth"];
}) => ProbeClient;
/**
 * What `probeAll` needs to know about one entry's credentials — including the ROPC seam.
 *
 * `tokenProbe` returns `ok` WITHOUT contacting anything, and that is the deliberate truth of this
 * client: `ServiceNowClient` acquires the ROPC token inside its first request, so a separate token
 * call would be a SECOND login attempt on an account this whole flow is careful to spend only
 * three of. A failed grant still lands as `auth failed` through the `sys_user` query; what is lost
 * is the four-way ROPC error table's extra specificity, which needs a real token endpoint to
 * distinguish and belongs with the live sitting.
 */
export declare const probeOptionsFor: (auth: StoreInstance["auth"], env: NodeJS.ProcessEnv) => {
    username: string;
    authMethod: "basic" | "oauth_ropc";
    env: NodeJS.ProcessEnv;
    tokenProbe?: () => Promise<TokenResult>;
};
