import { type ToolRunContext } from '@deepseek-ai/dsh-tools';
import z from '@deepseek-ai/schemastery';
export declare const inject: string[];
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    providers: z<Schemastery.ObjectS<NoInfer<{
        github: z<Schemastery.ObjectS<NoInfer<{
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, "defined">;
        gitea: z<Schemastery.ObjectS<NoInfer<{
            instances: z<NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, "volatile-defined">;
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            instances: z<NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, "volatile-defined">;
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        github: z<Schemastery.ObjectS<NoInfer<{
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, "defined">;
        gitea: z<Schemastery.ObjectS<NoInfer<{
            instances: z<NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, "volatile-defined">;
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            instances: z<NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, "volatile-defined">;
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, "defined">;
    }>>, "defined">;
    requestTimeoutMs: z<number, number, "volatile-defined">;
    maxPageSize: z<number, number, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    providers: z<Schemastery.ObjectS<NoInfer<{
        github: z<Schemastery.ObjectS<NoInfer<{
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, "defined">;
        gitea: z<Schemastery.ObjectS<NoInfer<{
            instances: z<NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, "volatile-defined">;
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            instances: z<NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, "volatile-defined">;
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        github: z<Schemastery.ObjectS<NoInfer<{
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, "defined">;
        gitea: z<Schemastery.ObjectS<NoInfer<{
            instances: z<NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, "volatile-defined">;
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            instances: z<NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, NoInfer<{
                origin: string;
                baseUrl: string;
                tokenRef: string;
            }[]>, "volatile-defined">;
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, "defined">;
    }>>, "defined">;
    requestTimeoutMs: z<number, number, "volatile-defined">;
    maxPageSize: z<number, number, "volatile-defined">;
}>>, "plain">;
export type Config = ReturnType<typeof Config>;
interface ConnectionContext {
    connection: {
        fetch: {
            register(route: {
                path: string;
                methods: readonly ['POST'];
                requestBody: 'buffered';
                fetch(request: Request): Promise<Response>;
            }): unknown;
        };
    };
}
interface PluginContext {
    inject?(dependencies: string[], callback: (ctx: ConnectionContext) => void): unknown;
    tools: {
        register(tool: unknown): void;
    };
    get(name: 'workingDirectory'): {
        ensure(agent: NonNullable<ToolRunContext['agent']>, signal: AbortSignal): Promise<string>;
    } | undefined;
    get(name: 'subprocess'): {
        resolveExecutable(command: string, env: undefined, signal: AbortSignal): Promise<string>;
        spawn(spec: {
            argv: readonly string[];
            cwd: string;
            signal: AbortSignal;
            graceMs: number;
            stdio: {
                stdin: 'ignore';
                stdout: {
                    maxBytes: number;
                };
                stderr: {
                    maxBytes: number;
                };
            };
        }): {
            done: Promise<{
                exitCode: number | null;
            }>;
            collected: {
                stdout?: {
                    readFrom(offset: number): {
                        text: string;
                        lossy: boolean;
                    };
                };
            };
        };
    } | undefined;
}
type ConnectionTestResult = {
    ok: true;
    value: {
        login: string;
    };
} | {
    ok: false;
    error: {
        code: string;
        message: string;
        details: {
            status?: number;
        };
    };
};
/** Test an unsaved Gitea draft. Never include credentials or upstream error bodies in results. */
export declare function testConnection(payload: unknown, signal: AbortSignal): Promise<ConnectionTestResult>;
export declare function apply(ctx: PluginContext, config: Config): void;
export {};
