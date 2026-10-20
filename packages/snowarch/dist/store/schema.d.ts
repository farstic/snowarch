/**
 * The store schema, version 1 — exactly `01` §7.
 *
 * Two shapes are refused deliberately, because both look right and behave wrong:
 *
 *  - `flags` values are the literal STRINGS "true" / "false", never booleans. The env
 *    path compares byte-exactly against "true", so a JSON boolean would read as absent
 *    and silently disable a write flag the user believes they enabled.
 *  - `auth.method` is `basic | oauth_ropc`. `client_credentials` is roadmap: accepting it
 *    would store a client id and secret the client code has no branch to use.
 */
import { z } from 'zod';
export declare const STORE_VERSION = 1;
export declare const FLAG_NAMES: readonly ["WRITE_ENABLED", "CMDB_WRITE_ENABLED", "SCRIPTING_ENABLED", "ATF_ENABLED", "NOW_ASSIST_ENABLED", "FLUENT_ENABLED"];
export type FlagName = (typeof FLAG_NAMES)[number];
export declare const instanceSchema: z.ZodObject<{
    url: z.ZodEffects<z.ZodString, string, string>;
    environment: z.ZodEnum<["pdi", "dev", "test", "prod"]>;
    auth: z.ZodDiscriminatedUnion<"method", [z.ZodObject<{
        method: z.ZodLiteral<"basic">;
        username: z.ZodString;
        password: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        username: string;
        password: string;
        method: "basic";
    }, {
        username: string;
        password: string;
        method: "basic";
    }>, z.ZodObject<{
        method: z.ZodLiteral<"oauth_ropc">;
        clientId: z.ZodString;
        clientSecret: z.ZodString;
        username: z.ZodString;
        password: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        clientId: string;
        clientSecret: string;
        username: string;
        password: string;
        method: "oauth_ropc";
    }, {
        clientId: string;
        clientSecret: string;
        username: string;
        password: string;
        method: "oauth_ropc";
    }>]>;
    preset: z.ZodEnum<["read-only", "pdi-developer", "full", "custom"]>;
    flags: z.ZodDefault<z.ZodRecord<z.ZodEnum<["WRITE_ENABLED", "CMDB_WRITE_ENABLED", "SCRIPTING_ENABLED", "ATF_ENABLED", "NOW_ASSIST_ENABLED", "FLUENT_ENABLED"]>, z.ZodEnum<["true", "false"]>>>;
    toolPackage: z.ZodDefault<z.ZodEnum<["full"]>>;
    maxRecords: z.ZodDefault<z.ZodNumber>;
    prodWriteAck: z.ZodDefault<z.ZodBoolean>;
    lastProbe: z.ZodOptional<z.ZodObject<{
        at: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        at: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        at: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>>;
}, "strict", z.ZodTypeAny, {
    url: string;
    environment: "pdi" | "dev" | "test" | "prod";
    auth: {
        username: string;
        password: string;
        method: "basic";
    } | {
        clientId: string;
        clientSecret: string;
        username: string;
        password: string;
        method: "oauth_ropc";
    };
    preset: "full" | "custom" | "read-only" | "pdi-developer";
    flags: Partial<Record<"WRITE_ENABLED" | "CMDB_WRITE_ENABLED" | "SCRIPTING_ENABLED" | "ATF_ENABLED" | "NOW_ASSIST_ENABLED" | "FLUENT_ENABLED", "false" | "true">>;
    toolPackage: "full";
    maxRecords: number;
    prodWriteAck: boolean;
    lastProbe?: z.objectOutputType<{
        at: z.ZodString;
    }, z.ZodTypeAny, "passthrough"> | undefined;
}, {
    url: string;
    environment: "pdi" | "dev" | "test" | "prod";
    auth: {
        username: string;
        password: string;
        method: "basic";
    } | {
        clientId: string;
        clientSecret: string;
        username: string;
        password: string;
        method: "oauth_ropc";
    };
    preset: "full" | "custom" | "read-only" | "pdi-developer";
    flags?: Partial<Record<"WRITE_ENABLED" | "CMDB_WRITE_ENABLED" | "SCRIPTING_ENABLED" | "ATF_ENABLED" | "NOW_ASSIST_ENABLED" | "FLUENT_ENABLED", "false" | "true">> | undefined;
    toolPackage?: "full" | undefined;
    maxRecords?: number | undefined;
    prodWriteAck?: boolean | undefined;
    lastProbe?: z.objectInputType<{
        at: z.ZodString;
    }, z.ZodTypeAny, "passthrough"> | undefined;
}>;
export declare const storeSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    defaultInstance: z.ZodOptional<z.ZodString>;
    instances: z.ZodRecord<z.ZodString, z.ZodObject<{
        url: z.ZodEffects<z.ZodString, string, string>;
        environment: z.ZodEnum<["pdi", "dev", "test", "prod"]>;
        auth: z.ZodDiscriminatedUnion<"method", [z.ZodObject<{
            method: z.ZodLiteral<"basic">;
            username: z.ZodString;
            password: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            username: string;
            password: string;
            method: "basic";
        }, {
            username: string;
            password: string;
            method: "basic";
        }>, z.ZodObject<{
            method: z.ZodLiteral<"oauth_ropc">;
            clientId: z.ZodString;
            clientSecret: z.ZodString;
            username: z.ZodString;
            password: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            clientId: string;
            clientSecret: string;
            username: string;
            password: string;
            method: "oauth_ropc";
        }, {
            clientId: string;
            clientSecret: string;
            username: string;
            password: string;
            method: "oauth_ropc";
        }>]>;
        preset: z.ZodEnum<["read-only", "pdi-developer", "full", "custom"]>;
        flags: z.ZodDefault<z.ZodRecord<z.ZodEnum<["WRITE_ENABLED", "CMDB_WRITE_ENABLED", "SCRIPTING_ENABLED", "ATF_ENABLED", "NOW_ASSIST_ENABLED", "FLUENT_ENABLED"]>, z.ZodEnum<["true", "false"]>>>;
        toolPackage: z.ZodDefault<z.ZodEnum<["full"]>>;
        maxRecords: z.ZodDefault<z.ZodNumber>;
        prodWriteAck: z.ZodDefault<z.ZodBoolean>;
        lastProbe: z.ZodOptional<z.ZodObject<{
            at: z.ZodString;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            at: z.ZodString;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            at: z.ZodString;
        }, z.ZodTypeAny, "passthrough">>>;
    }, "strict", z.ZodTypeAny, {
        url: string;
        environment: "pdi" | "dev" | "test" | "prod";
        auth: {
            username: string;
            password: string;
            method: "basic";
        } | {
            clientId: string;
            clientSecret: string;
            username: string;
            password: string;
            method: "oauth_ropc";
        };
        preset: "full" | "custom" | "read-only" | "pdi-developer";
        flags: Partial<Record<"WRITE_ENABLED" | "CMDB_WRITE_ENABLED" | "SCRIPTING_ENABLED" | "ATF_ENABLED" | "NOW_ASSIST_ENABLED" | "FLUENT_ENABLED", "false" | "true">>;
        toolPackage: "full";
        maxRecords: number;
        prodWriteAck: boolean;
        lastProbe?: z.objectOutputType<{
            at: z.ZodString;
        }, z.ZodTypeAny, "passthrough"> | undefined;
    }, {
        url: string;
        environment: "pdi" | "dev" | "test" | "prod";
        auth: {
            username: string;
            password: string;
            method: "basic";
        } | {
            clientId: string;
            clientSecret: string;
            username: string;
            password: string;
            method: "oauth_ropc";
        };
        preset: "full" | "custom" | "read-only" | "pdi-developer";
        flags?: Partial<Record<"WRITE_ENABLED" | "CMDB_WRITE_ENABLED" | "SCRIPTING_ENABLED" | "ATF_ENABLED" | "NOW_ASSIST_ENABLED" | "FLUENT_ENABLED", "false" | "true">> | undefined;
        toolPackage?: "full" | undefined;
        maxRecords?: number | undefined;
        prodWriteAck?: boolean | undefined;
        lastProbe?: z.objectInputType<{
            at: z.ZodString;
        }, z.ZodTypeAny, "passthrough"> | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    version: 1;
    instances: Record<string, {
        url: string;
        environment: "pdi" | "dev" | "test" | "prod";
        auth: {
            username: string;
            password: string;
            method: "basic";
        } | {
            clientId: string;
            clientSecret: string;
            username: string;
            password: string;
            method: "oauth_ropc";
        };
        preset: "full" | "custom" | "read-only" | "pdi-developer";
        flags: Partial<Record<"WRITE_ENABLED" | "CMDB_WRITE_ENABLED" | "SCRIPTING_ENABLED" | "ATF_ENABLED" | "NOW_ASSIST_ENABLED" | "FLUENT_ENABLED", "false" | "true">>;
        toolPackage: "full";
        maxRecords: number;
        prodWriteAck: boolean;
        lastProbe?: z.objectOutputType<{
            at: z.ZodString;
        }, z.ZodTypeAny, "passthrough"> | undefined;
    }>;
    defaultInstance?: string | undefined;
}, {
    version: 1;
    instances: Record<string, {
        url: string;
        environment: "pdi" | "dev" | "test" | "prod";
        auth: {
            username: string;
            password: string;
            method: "basic";
        } | {
            clientId: string;
            clientSecret: string;
            username: string;
            password: string;
            method: "oauth_ropc";
        };
        preset: "full" | "custom" | "read-only" | "pdi-developer";
        flags?: Partial<Record<"WRITE_ENABLED" | "CMDB_WRITE_ENABLED" | "SCRIPTING_ENABLED" | "ATF_ENABLED" | "NOW_ASSIST_ENABLED" | "FLUENT_ENABLED", "false" | "true">> | undefined;
        toolPackage?: "full" | undefined;
        maxRecords?: number | undefined;
        prodWriteAck?: boolean | undefined;
        lastProbe?: z.objectInputType<{
            at: z.ZodString;
        }, z.ZodTypeAny, "passthrough"> | undefined;
    }>;
    defaultInstance?: string | undefined;
}>;
export type StoreInstance = z.infer<typeof instanceSchema>;
export type Store = z.infer<typeof storeSchema>;
export interface StoreError {
    code: 'STORE_NOT_FOUND' | 'STORE_UNREADABLE' | 'STORE_SCHEMA_INVALID' | 'STORE_SCHEMA_OUTDATED' | 'STORE_SCHEMA_NEWER' | 'STORE_PERMISSIONS_TOO_OPEN';
    message: string;
}
/** `instances.pdi.flags.WRITE_ENABLED` — the path a user can find in their own file. */
export declare function issuePath(issue: z.ZodIssue): string;
/**
 * Version first, and separately from the schema: a store written by a different server is a
 * different failure from a malformed one, and the remedy is a command, not an edit.
 *
 * TWO codes, not one (ARC-09-S06). `STORE_SCHEMA_UNSUPPORTED` said "run ./snowarch upgrade" in
 * both directions, which is right for a store from the future and wrong — actively misleading —
 * for one from the past: upgrading the checkout that already reads the newer schema does nothing
 * at all, and the file the user needed to migrate sits there through it. The two directions have
 * two remedies and now say so.
 */
/**
 * ARC-07-C31 slice 3 — A DEFAULT IS ALLOWED: exactly one product caller, `store/index.ts:94`.
 */
export declare function parseStore(raw: unknown, cli?: string): {
    store: Store;
} | {
    error: StoreError;
};
/** Absent flags read as "false" — the same semantics the env path has always had. */
export declare function completeFlags(flags: Partial<Record<FlagName, 'true' | 'false'>>): Record<FlagName, 'true' | 'false'>;
