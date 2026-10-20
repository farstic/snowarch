import { type ProductKey } from './core.js';
/** A live start's whole budget for the refresh, across its three git calls. */
export declare const LIVE_BUDGET_MS = 3000;
export type FetchResult = {
    status: 'fetched';
    text: string;
} | {
    status: 'none';
    detail: string;
} | {
    status: 'unreachable';
    detail: string;
};
/** Fetch the list's text. Never rejects. */
export declare function fetchListAsync({ url, ref, path, budgetMs, env }: {
    url: string;
    ref?: string;
    path?: string;
    budgetMs?: number;
    env?: NodeJS.ProcessEnv;
}): Promise<FetchResult>;
export interface RefreshResult {
    outcome: 'updated' | 'unchanged' | 'older' | 'none' | 'refused' | 'unreachable' | 'unconfigured';
    version: number | null;
    previous?: number | null;
    fetchedVersion?: number;
    detail?: string;
    reason?: string;
}
/** Fetch, verify and cache, as the CLI's `refreshList` does. Never rejects. */
export declare function refreshList(root: string, { config, keys, now, env, budgetMs, fetcher }: {
    config: unknown;
    keys?: readonly ProductKey[];
    now?: Date;
    env?: NodeJS.ProcessEnv;
    budgetMs?: number;
    fetcher?: typeof fetchListAsync;
}): Promise<RefreshResult>;
