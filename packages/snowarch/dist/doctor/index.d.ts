import { type DoctorReport, type Probes } from './types.js';
export * from './types.js';
export { ALL_CHECKS, pollutingAncestors, resetHandshakeCache } from './checks.js';
export interface DoctorOptions {
    noNetwork?: boolean;
    cwd?: string;
    probes?: Probes;
    /** The SDK resolver, injected in tests so no cell spawns `npm root -g` (ARC-08-S04). */
    fluent?: () => {
        installed: boolean;
        where?: string;
        version?: string;
    };
    /** Reserved for ARC-08's merged report; only `server` exists today. */
    section?: 'server';
    /**
     * The shell the remedies are spelled for — ARC-07-C38, and the runner is the ONE legitimate read.
     *
     * Optional here and required on `CheckContext`: a caller that does not care gets the process, and
     * every check downstream is handed an answer rather than reaching for one. That asymmetry is the
     * point — the read happens once, where it can be overridden, instead of in ten remedies.
     */
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
}
export declare function runServerDoctor(opts?: DoctorOptions): Promise<DoctorReport>;
/** 0 = nothing failed, 1 = at least one FAIL, 3 = the run itself could not complete. */
export declare function exitCodeFor(report: DoctorReport): 0 | 1 | 3;
/** The human rendering: one aligned line per check, then a summary. */
export declare function formatReport(report: DoctorReport): string;
