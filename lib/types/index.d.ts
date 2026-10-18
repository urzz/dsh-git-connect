import z from '@deepseek-ai/schemastery';
export declare const inject: readonly ["tools"];
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
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
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
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
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
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
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
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            baseUrl: z<string, string, "volatile-defined">;
            tokenRef: z<string, string, "volatile-defined">;
        }>>, "defined">;
    }>>, "defined">;
    requestTimeoutMs: z<number, number, "volatile-defined">;
    maxPageSize: z<number, number, "volatile-defined">;
}>>, "plain">;
interface VolatileValue<T> {
    get(): T | undefined;
}
type ConfigValue<T> = T | VolatileValue<T> | undefined;
interface ConfigInput {
    providers?: {
        github?: {
            baseUrl?: ConfigValue<string>;
            tokenRef?: ConfigValue<string>;
        };
        gitea?: {
            baseUrl?: ConfigValue<string>;
            tokenRef?: ConfigValue<string>;
        };
    };
    requestTimeoutMs?: ConfigValue<number>;
    maxPageSize?: ConfigValue<number>;
}
interface ProviderConfig {
    baseUrl: string;
    tokenRef: string;
}
interface ResolvedConfig {
    providers: {
        github: ProviderConfig;
        gitea: ProviderConfig;
    };
    requestTimeoutMs: number;
    maxPageSize: number;
}
interface PluginContext {
    tools: {
        register(tool: unknown): void;
    };
}
export declare function apply(ctx: PluginContext, config?: ConfigInput | ResolvedConfig): void;
export {};
