interface ModuleLoader {
  load(module: { id: string; factory(require: (name: string) => unknown): ClientPlugin }): void;
}

type ProviderName = 'github' | 'gitea';
type ConfigPath =
  | readonly ['providers', ProviderName, 'baseUrl' | 'tokenRef']
  | readonly ['providers', 'gitea', 'instances']
  | readonly ['requestTimeoutMs' | 'maxPageSize'];

type FieldValue = string | number;
type ConfigValue = FieldValue | GiteaInstance[];

interface GiteaInstance {
  origin: string;
  baseUrl: string;
  tokenRef: string;
}

interface GitConfig {
  providers: {
    github: { baseUrl: string; tokenRef: string };
    gitea: { baseUrl: string; tokenRef: string; instances: GiteaInstance[] };
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
  register(options: { name: string; key: string; locale: string }, component: unknown): void;
}

interface ClientContext {
  effect(callback: () => void | (() => void), label?: string): void;
  locale: LocaleApi;
  configForms: { get(id: string): ConfigForm | undefined };
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
  type?: 'text' | 'number' | 'password';
  min?: number;
  max?: number;
}

interface ProviderCardProps {
  name: ProviderName;
  config: GitConfig;
  update(path: ConfigPath, value: ConfigValue): void;
  check(key: string, connection: { baseUrl: string; tokenRef: string }): unknown;
}

interface PageState {
  status: 'loading' | 'ready' | 'unavailable' | string;
  snapshot: ConfigSnapshot | null;
  config: GitConfig | null;
  error: Error | null;
  checks?: Record<string, { signature: string; pending: boolean; ok?: boolean; message?: string }>;
  saving: boolean;
  saved: boolean;
}

type Translate = (key: string) => string;

function cloneConfig(config: GitConfig): GitConfig {
  return {
    ...config,
    providers: {
      github: { ...config.providers.github },
      gitea: { ...config.providers.gitea, instances: (config.providers.gitea.instances ?? []).map(instance => ({ ...instance })) },
    },
  };
}

const copy = {
  en: {
    label: 'Code Collaboration',
    title: 'Code Collaboration',
    description: 'Configure the GitHub and Gitea connections used by the git_host tool.',
    github: 'GitHub',
    gitea: 'Gitea',
    origin: 'Repository clone URL prefix',
    originHint: 'For example: https://git.example.com, git@git.example.com: or ssh://git@git.example.com:2222.',
    instancesHint: 'When instances are configured, they replace the single connection. Remove all instances to use the single connection again.',
    instance: 'Instance',
    test: 'Test connection', testing: 'Testing…', connected: 'Connected as',
    testHint: 'Tests the current inputs without saving. Requires permission to read your user profile.',
    general: 'Request settings',
    failures: {
      validation: 'Check the API URL, token and request timeout. The URL must use HTTP(S) without credentials, query or fragment.',
      authentication: 'Token rejected. Check its value and permission to read your user profile.',
      http: 'Gitea returned an HTTP error. Check the API URL and server status.',
      network: 'Could not reach Gitea. Check the address, network and TLS certificate.',
      timeout: 'Connection timed out. Check the network or increase the request timeout.',
      cancelled: 'Connection test cancelled. Try again.',
      redirect: 'Gitea redirected the request. Enter the final API URL.',
      response: 'The response is not a Gitea user profile. Check the API URL.',
      forbidden: 'Only the owner can test connections.',
      'not-found': 'Connection testing is unavailable. Check the plugin version.',
    },
    testUnavailable: 'Connection testing is unavailable. Check the plugin and server connection.',
    addInstance: 'Add instance',
    removeInstance: 'Remove instance',
    baseUrl: 'API base URL',
    tokenRef: 'Access token',
    timeout: 'Request timeout (ms)',
    pageSize: 'Maximum page size',
    save: 'Save changes',
    saving: 'Saving…',
    saved: 'Saved',
    loading: 'Loading configuration…',
    unavailable: 'Configuration is unavailable in this page.',
    error: 'Could not load or save the configuration.',
    credentialHint: 'Paste the access token used for this provider.',
    giteaHint: 'For self-hosted Gitea, include the complete API root, usually ending in /api/v1.',
  },
  zh: {
    label: '代码协作',
    title: '代码协作',
    description: '配置 git_host 工具使用的 GitHub 和 Gitea 连接。',
    github: 'GitHub',
    gitea: 'Gitea',
    origin: '仓库 clone URL 匹配前缀',
    originHint: '例如：https://git.example.com、git@git.example.com: 或 ssh://git@git.example.com:2222。',
    instancesHint: '配置实例后将使用实例列表；删除全部实例后恢复使用单实例连接。',
    instance: '实例',
    test: '检测连接', testing: '检测中…', connected: '已连接，当前账号：',
    testHint: '使用当前输入检测，无需先保存。Token 需具有读取当前用户资料的权限。',
    general: '请求设置',
    failures: {
      validation: '请检查 API 地址、Token 和请求超时。地址须使用 HTTP(S)，且不含账号密码、查询参数或片段。',
      authentication: 'Token 验证失败，请检查 Token 是否有效，并具有读取当前用户资料的权限。',
      http: 'Gitea 返回 HTTP 错误，请检查 API 地址和服务器状态。',
      network: '无法连接 Gitea，请检查地址、网络和 TLS 证书。',
      timeout: '连接超时，请检查网络或增加请求超时。',
      cancelled: '检测已取消，请重试。',
      redirect: 'Gitea 返回了重定向，请填写最终的 API 地址。',
      response: '返回内容不是 Gitea 用户资料，请检查 API 地址。',
      forbidden: '仅所有者可以检测连接。',
      'not-found': '连接检测不可用，请检查插件版本。',
    },
    testUnavailable: '连接检测接口不可用，请检查插件和宿主连接。',
    addInstance: '新增实例',
    removeInstance: '删除实例',
    baseUrl: 'API 基础地址',
    tokenRef: '访问 Token',
    timeout: '请求超时（毫秒）',
    pageSize: '最大分页数量',
    save: '保存更改',
    saving: '保存中…',
    saved: '已保存',
    loading: '正在加载配置…',
    unavailable: '此页面暂时无法访问配置。',
    error: '配置加载或保存失败。',
    credentialHint: '填写此服务使用的访问 Token。',
    giteaHint: '自部署 Gitea 请填写完整 API 根地址，通常以 /api/v1 结尾。',
  },
};

(window as unknown as Window & { __ModuleLoader__: ModuleLoader }).__ModuleLoader__.load({
  id: 'dsh-git-connect',
  factory(require) {
    const React = require('react') as ReactLike;
    const h = React.createElement;
    const NS = 'dsh-git-plugin.settings';

    function makePage(t: Translate, form: ConfigForm | undefined): unknown {
      async function testConnection(input: { baseUrl: string; tokenRef: string }, timeoutMs: number): Promise<{ login: string }> {
        const response = await fetch('/api/git-connect/connection-test', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseUrl: input.baseUrl, tokenRef: input.tokenRef, timeoutMs }),
        });
        if (!response.ok) throw new Error(`${t('testUnavailable')} (HTTP ${response.status})`);
        const result = await response.json();
        if (!result.ok) {
          const { code, message, details } = result.error;
          const translated = Object.hasOwn(copy.en.failures, code) ? t(`failures.${code}`) : message;
          throw new Error(`${translated}${details?.status ? ` (HTTP ${details.status})` : ''}`);
        }
        return result.value;
      }

      function getConfigValue<T>(config: unknown, path: readonly string[], fallback: T): T {
        let value: unknown = config;
        for (const part of path) {
          value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
        }
        return (value ?? fallback) as T;
      }

      function ConfigField({ label, hint, value, onChange, type = 'text', min, max }: ConfigFieldProps): ElementNode {
        return h('label', { className: 'dsh-git-field' },
          h('span', { className: 'dsh-git-field-label' }, label),
          h('input', {
            className: 'dsh-git-input',
            type,
            value: value ?? '',
            min,
            max,
            autoComplete: type === 'password' ? 'new-password' : 'off',
            spellCheck: false,
            onChange: (event: { target: { value: string } }) => onChange(type === 'number' ? Number(event.target.value) : event.target.value),
          }),
          hint ? h('span', { className: 'dsh-git-field-hint' }, hint) : null,
        );
      }

      function ProviderCard({ name, config, update, check }: ProviderCardProps): ElementNode {
        const isGitea = name === 'gitea';
        const instances = getConfigValue<GiteaInstance[]>(config, ['providers', 'gitea', 'instances'], []);
        const updateInstances = (next: GiteaInstance[]): void => update(['providers', 'gitea', 'instances'], next);
        return h('section', { className: 'dsh-git-card' },
          h('div', { className: 'dsh-git-provider-heading' },
            h('h2', { className: 'dsh-git-card-title' }, isGitea ? t('gitea') : t('github')),
            isGitea && instances.length ? h('span', { className: 'dsh-git-count' }, String(instances.length)) : null,
            isGitea ? h('button', {
              className: 'dsh-git-add', type: 'button',
              onClick: () => updateInstances([...instances, { origin: '', baseUrl: '', tokenRef: '' }]),
            }, h('span', { 'aria-hidden': true }, '+'), t('addInstance')) : null),
          isGitea ? h('p', { className: 'dsh-git-field-hint' }, t('instancesHint')) : null,
          isGitea && instances.length ? instances.map((instance, index) => h('section', { className: 'dsh-git-instance', key: index },
            h('div', { className: 'dsh-git-instance-heading' },
              h('h3', { className: 'dsh-git-card-title' }, `${t('instance')} ${index + 1}`),
              h('button', { className: 'dsh-git-remove', type: 'button',
                'aria-label': `${t('removeInstance')} ${index + 1}`,
                onClick: () => updateInstances(instances.filter((_, itemIndex) => itemIndex !== index)),
              }, t('removeInstance'))),
            ...(['origin', 'baseUrl', 'tokenRef'] as const).map(field => h(ConfigField, {
              key: field,
              label: t(field),
              type: field === 'tokenRef' ? 'password' : 'text',
              value: instance[field],
              hint: t(field === 'origin' ? 'originHint' : field === 'baseUrl' ? 'giteaHint' : 'credentialHint'),
              onChange: (value: FieldValue) => updateInstances(instances.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: String(value) } : item)),
            })),
            check(`instance-${index}`, instance),
          )) : [h(ConfigField, {
            key: 'baseUrl',
            label: t('baseUrl'),
            value: getConfigValue(config, ['providers', name, 'baseUrl'], ''),
            onChange: (value: ConfigValue) => update(['providers', name, 'baseUrl'], value),
            hint: isGitea ? t('giteaHint') : null,
          }),
          h(ConfigField, {
            key: 'tokenRef',
            type: 'password',
            label: t('tokenRef'),
            value: getConfigValue(config, ['providers', name, 'tokenRef'], ''),
            onChange: (value: ConfigValue) => update(['providers', name, 'tokenRef'], value),
            hint: t('credentialHint'),
          })],
          isGitea && !instances.length ? check('single', config.providers.gitea) : null,
        );
      }

      return function GitSettingsPage(): ElementNode {
        const [state, setState] = React.useState<PageState>({ status: 'loading', snapshot: null, config: null, error: null, saving: false, saved: false });
        React.useEffect(() => {
          if (!form) {
            setState(current => ({ ...current, status: 'unavailable' }));
            return undefined;
          }
          const sync = () => {
            const snapshot = form.getSnapshot();
            setState(current => ({
              ...current,
              status: snapshot.status,
              snapshot,
              error: null,
            }));
          };
          const dispose = form.subscribe(sync);
          sync();
          return dispose;
        }, []);

        if (state.status === 'loading') {
          return h('section', { className: 'dsh-git-settings' }, h('p', { className: 'dsh-git-status' }, t('loading')));
        }
        const config = state.config ?? state.snapshot?.value;
        if (state.status !== 'ready' || !config) {
          return h('section', { className: 'dsh-git-settings' },
            h('p', { className: 'dsh-git-error' }, t('unavailable')),
          );
        }

        const update = (path: ConfigPath, value: ConfigValue): void => {
          setState(current => {
            const next = cloneConfig(current.config ?? current.snapshot?.value ?? config);
            let target: Record<string, unknown> = next as unknown as Record<string, unknown>;
            for (let index = 0; index < path.length - 1; index += 1) {
              const key = path[index];
              const nested = target[key];
              target[key] = { ...(nested && typeof nested === 'object' ? nested : {}) };
              target = target[key] as Record<string, unknown>;
            }
            target[path[path.length - 1]] = value;
            return { ...current, config: next, saved: false };
          });
        };
        const save = async (): Promise<void> => {
          setState(current => ({ ...current, saving: true, saved: false, error: null }));
          try {
            const paths: ConfigPath[] = [
              ['providers', 'github', 'baseUrl'],
              ['providers', 'github', 'tokenRef'],
              ['providers', 'gitea', 'baseUrl'],
              ['providers', 'gitea', 'tokenRef'],
              ['providers', 'gitea', 'instances'],
              ['requestTimeoutMs'],
              ['maxPageSize'],
            ];
            const operations: ConfigOperation[] = paths.map(path => ({
              op: 'set', path, value: getConfigValue<ConfigValue>(config, path, path[2] === 'instances' ? [] : ''),
            }));
            const accepted = await form?.mutate(operations, state.snapshot?.revision);
            if (!accepted) throw new Error('The configuration was changed elsewhere. Reload and try again.');
            const snapshot = form?.getSnapshot();
            if (!snapshot) throw new Error('Configuration snapshot is unavailable.');
            setState(current => ({
              ...current,
              status: snapshot.status,
              snapshot,
              config: null,
              saving: false,
              saved: true,
            }));
          } catch (error) {
            console.error(error);
            setState(current => ({ ...current, saving: false, saved: false, error: error instanceof Error ? error : new Error(String(error)) }));
          }
        };

        const check = (key: string, connection: { baseUrl: string; tokenRef: string }): ElementNode => {
          const signature = JSON.stringify([connection, config.requestTimeoutMs]);
          const result = state.checks?.[key];
          const current = result?.signature === signature ? result : undefined;
          const run = async (): Promise<void> => {
            const pending = { signature, pending: true };
            setState(value => ({ ...value, checks: { ...value.checks, [key]: pending } }));
            try {
              const response = await testConnection(connection, config.requestTimeoutMs);
              setState(value => value.checks?.[key] !== pending ? value : ({ ...value, checks: { ...value.checks, [key]: { signature, pending: false, ok: true, message: `${t('connected')} ${response.login}` } } }));
            } catch (error) {
              setState(value => value.checks?.[key] !== pending ? value : ({ ...value, checks: { ...value.checks, [key]: { signature, pending: false, ok: false, message: error instanceof Error ? error.message : String(error) } } }));
            }
          };
          return h('div', { className: 'dsh-git-check' },
            h('div', { className: 'dsh-git-check-row' },
              h('button', { type: 'button', className: 'dsh-git-secondary', 'aria-label': `${t('test')} ${key === 'single' ? t('gitea') : `${t('instance')} ${Number(key.split('-')[1]) + 1}`}`, disabled: current?.pending || !connection.baseUrl.trim() || !connection.tokenRef.trim(), onClick: run }, t(current?.pending ? 'testing' : 'test')),
              h('span', { role: 'status', 'aria-live': 'polite', className: current?.ok ? 'dsh-git-saved' : 'dsh-git-error' }, current?.message ?? '')),
            h('p', { className: 'dsh-git-field-hint' }, t('testHint')));
        };

        return h('section', { className: 'dsh-git-settings' },
          h('header', { className: 'dsh-git-header' },
            h('h1', { className: 'dsh-git-title' }, t('title')),
            h('p', { className: 'dsh-git-description' }, t('description')),
          ),
          h(ProviderCard, { name: 'github', config, update, check }),
          h(ProviderCard, { name: 'gitea', config, update, check }),
          h('section', { className: 'dsh-git-card dsh-git-general' },
            h('h2', { className: 'dsh-git-card-title' }, t('general')),
            h(ConfigField, {
              label: t('timeout'),
              type: 'number',
              min: 1000,
              value: getConfigValue(config, ['requestTimeoutMs'], 30000),
              onChange: (value: ConfigValue) => update(['requestTimeoutMs'], value),
            }),
            h(ConfigField, {
              label: t('pageSize'),
              type: 'number',
              min: 1,
              max: 100,
              value: getConfigValue(config, ['maxPageSize'], 50),
              onChange: (value: ConfigValue) => update(['maxPageSize'], value),
            }),
          ),
          state.error ? h('p', { className: 'dsh-git-error' }, `${t('error')} ${state.error.message}`) : null,
          h('div', { className: 'dsh-git-actions' },
            h('button', {
              className: 'dsh-git-save',
              type: 'button',
              disabled: state.saving,
              onClick: save,
            }, state.saving ? t('saving') : t('save')),
            state.saved ? h('span', { className: 'dsh-git-saved' }, t('saved')) : null,
          ),
        );
      };
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx: ClientContext): void {
        ctx.effect(() => ctx.locale.register(NS, copy), 'git plugin settings translations');
        const t = ctx.locale.bind(NS);
        ctx.effect(() => {
          if (typeof document === 'undefined') return undefined;
          const style = document.createElement('style');
          style.dataset.plugin = 'dsh-git-connect';
          style.textContent = `
            .dsh-git-settings { width: 100%; max-width: 880px; color: var(--dsw-alias-label-primary); font: inherit; display: flex; flex-direction: column; gap: 24px; padding-bottom: 24px; }
            .dsh-git-header { display: flex; flex-direction: column; gap: 8px; }
            .dsh-git-title { margin: 0; font-size: 22px; line-height: 30px; font-weight: 650; letter-spacing: -.4px; }
            .dsh-git-description, .dsh-git-status, .dsh-git-field-hint { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 19px; margin: 0; max-width: 72ch; overflow-wrap: anywhere; }
            .dsh-git-card { min-width: 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 18px; }
            .dsh-git-provider-heading, .dsh-git-instance-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
            .dsh-git-provider-heading { justify-content: flex-start; flex-wrap: wrap; }
            .dsh-git-add { margin-left: auto; display: inline-flex; align-items: center; gap: 7px; border: 1px solid currentColor; background: var(--dsw-alias-brand-primary, #3565d9); color: var(--dsw-alias-bg-base, #fff); font-weight: 600; }
            .dsh-git-card-title { margin: 0; font-size: 15px; line-height: 22px; font-weight: 600; }
            .dsh-git-count { font-size: 12px; padding: 1px 8px; border-radius: 12px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); }
            .dsh-git-instance { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; border: 1px solid var(--dsw-alias-border-l1, #8590a566); border-radius: 10px; padding: 18px; }
            .dsh-git-instance-heading, .dsh-git-instance > .dsh-git-field:nth-child(2), .dsh-git-check { grid-column: 1 / -1; }
            .dsh-git-instance-heading .dsh-git-card-title { font-size: 13px; }
            .dsh-git-add, .dsh-git-secondary, .dsh-git-remove, .dsh-git-save { cursor: pointer; font: inherit; font-size: 13px; line-height: 20px; border-radius: 7px; padding: 8px 14px; }
            .dsh-git-secondary { align-self: flex-start; border: 1px solid var(--dsw-alias-border-l2, #8590a5); background: var(--dsw-alias-bg-base, transparent); color: var(--dsw-alias-label-primary, inherit); font-weight: 600; }
            .dsh-git-remove { border: 1px solid currentColor; background: transparent; color: var(--dsw-alias-state-error-primary, #d34242); }
            .dsh-git-field { min-width: 0; display: flex; flex-direction: column; gap: 7px; }
            .dsh-git-field-label { font-size: 13px; color: var(--dsw-alias-label-primary); }
            .dsh-git-input { box-sizing: border-box; width: 100%; height: 40px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; padding: 0 12px; }
            .dsh-git-input:focus-visible, .dsh-git-settings button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; }
            .dsh-git-check { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--dsw-alias-border-l1, #8590a566); padding-top: 16px; }
            .dsh-git-settings button:not(:disabled):hover { filter: brightness(.92); }
            .dsh-git-settings button { min-height: 38px; flex-shrink: 0; }
            .dsh-git-check-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
            .dsh-git-general { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
            .dsh-git-general > h2 { grid-column: 1 / -1; }
            .dsh-git-actions { display: flex; align-items: center; gap: 12px; border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 18px; }
            .dsh-git-save { border: 0; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }
            .dsh-git-settings button:disabled { cursor: default; opacity: .55; }
            .dsh-git-saved { color: var(--dsw-alias-state-success-primary); font-size: 13px; overflow-wrap: anywhere; }
            .dsh-git-error { color: var(--dsw-alias-state-error-primary); font-size: 13px; line-height: 20px; margin: 0; overflow-wrap: anywhere; }
            @media (max-width: 600px) { .dsh-git-card { padding: 16px; } .dsh-git-instance, .dsh-git-general { grid-template-columns: minmax(0, 1fr); } }
          `;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'git plugin settings styles');
        const form = ctx.configForms.get('dsh-git-plugin');
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: 'dsh-git-connect',
          locale: NS,
        }, makePage(t, form)));
      },
    };
  },
});
