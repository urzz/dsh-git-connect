interface ModuleLoader {
    load(module: {
        id: string;
        factory(require: (name: string) => unknown): ClientPlugin;
    }): void;
}
type ProviderName = 'github' | 'gitea';
type ConfigPath = readonly ['providers', ProviderName, 'baseUrl' | 'tokenRef'] | readonly ['providers', 'gitea', 'instances'] | readonly ['requestTimeoutMs' | 'maxPageSize'];
type FieldValue = string | number;
type ConfigValue = FieldValue | GiteaInstance[];
interface GiteaInstance {
    origin: string;
    baseUrl: string;
    tokenRef: string;
}
interface GitConfig {
    providers: {
        github: {
            baseUrl: string;
            tokenRef: string;
        };
        gitea: {
            baseUrl: string;
            tokenRef: string;
            instances: GiteaInstance[];
        };
    };
    requestTimeoutMs: number;
    maxPageSize: number;
}
interface ConfigSnapshot {
    status: string;
    writable?: boolean;
    revision: number;
    value: GitConfig;
}
interface ConfigOperation {
    op: 'set';
    path: ConfigPath;
    value: ConfigValue;
}
interface ConfigForm {
    getSnapshot(): ConfigSnapshot;
    subscribe(callback: () => void): () => void;
    mutate(operations: ConfigOperation[], revision?: number): Promise<boolean>;
}
interface LocaleApi {
    register(namespace: string, messages: Record<string, unknown>): void;
    bind(namespace: string): (key: string) => string;
}
interface SlotsApi {
    inject(name: string, callback: () => void): void;
    register(options: {
        name: string;
        key: string;
        locale: string;
    }, component: unknown): void;
}
interface ClientContext {
    effect(callback: () => void | (() => void), label?: string): void;
    locale: LocaleApi;
    configForms: {
        get(id: string): ConfigForm | undefined;
    };
    slots: SlotsApi;
}
interface ClientPlugin {
    inject: string[];
    apply(ctx: ClientContext): void;
}
interface ElementNode {
    type: unknown;
    props: Record<string, unknown>;
    children: unknown[];
}
type StateSetter<T> = (value: T | ((current: T) => T)) => void;
interface ReactLike {
    createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): ElementNode;
    useState<T>(initial: T): [T, StateSetter<T>];
    useEffect(callback: () => void | (() => void), dependencies?: readonly unknown[]): void;
}
interface ConfigFieldProps {
    label: string;
    hint?: string | null;
    value: FieldValue;
    onChange(value: FieldValue): void;
    type?: 'text' | 'number';
    min?: number;
    max?: number;
}
interface ProviderCardProps {
    name: ProviderName;
    config: GitConfig;
    update(path: ConfigPath, value: ConfigValue): void;
}
interface PageState {
    status: 'loading' | 'ready' | 'unavailable' | string;
    snapshot: ConfigSnapshot | null;
    config: GitConfig | null;
    error: Error | null;
    saving: boolean;
    saved: boolean;
}
type Translate = (key: string) => string;
declare function cloneConfig(config: GitConfig): GitConfig;
declare const copy: {
    en: {
        label: string;
        title: string;
        description: string;
        github: string;
        gitea: string;
        origin: string;
        originHint: string;
        instancesHint: string;
        instance: string;
        addInstance: string;
        removeInstance: string;
        baseUrl: string;
        tokenRef: string;
        timeout: string;
        pageSize: string;
        save: string;
        saving: string;
        saved: string;
        loading: string;
        unavailable: string;
        error: string;
        credentialHint: string;
        giteaHint: string;
    };
    zh: {
        label: string;
        title: string;
        description: string;
        github: string;
        gitea: string;
        origin: string;
        originHint: string;
        instancesHint: string;
        instance: string;
        addInstance: string;
        removeInstance: string;
        baseUrl: string;
        tokenRef: string;
        timeout: string;
        pageSize: string;
        save: string;
        saving: string;
        saved: string;
        loading: string;
        unavailable: string;
        error: string;
        credentialHint: string;
        giteaHint: string;
    };
};
