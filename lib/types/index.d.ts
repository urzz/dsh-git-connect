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
export type Config = ReturnType<typeof Config>;
interface PluginContext {
    tools: {
        register(tool: unknown): void;
    };
}
export declare function apply(ctx: PluginContext, config: Config): void;
export {};
