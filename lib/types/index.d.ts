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
interface PluginContext {
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
export declare function apply(ctx: PluginContext, config: Config): void;
export {};
