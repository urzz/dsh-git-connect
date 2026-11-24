"use strict";
function cloneConfig(config) {
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
window.__ModuleLoader__.load({
    id: 'dsh-git-connect',
    factory(require) {
        const React = require('react');
        const h = React.createElement;
        const NS = 'dsh-git-plugin.settings';
        function makePage(t, form, connection) {
            async function testConnection(input, timeoutMs) {
                const result = await connection.rpc.call('/git-connect', 'connection-test', { baseUrl: input.baseUrl, tokenRef: input.tokenRef, timeoutMs });
                if (!result.ok) {
                    const { code, message, details } = result.error;
                    const translated = Object.hasOwn(copy.en.failures, code) ? t(`failures.${code}`) : message;
                    throw new Error(`${translated}${details?.status ? ` (HTTP ${details.status})` : ''}`);
                }
                return result.value;
            }
            function getConfigValue(config, path, fallback) {
                let value = config;
                for (const part of path) {
                    value = value && typeof value === 'object' ? value[part] : undefined;
                }
                return (value ?? fallback);
            }
            function ConfigField({ label, hint, value, onChange, type = 'text', min, max }) {
                return h('label', { className: 'dsh-git-field' }, h('span', { className: 'dsh-git-field-label' }, label), h('input', {
                    className: 'dsh-git-input',
                    type,
                    value: value ?? '',
                    min,
                    max,
                    autoComplete: type === 'password' ? 'new-password' : 'off',
                    spellCheck: false,
                    onChange: (event) => onChange(type === 'number' ? Number(event.target.value) : event.target.value),
                }), hint ? h('span', { className: 'dsh-git-field-hint' }, hint) : null);
            }
            function ProviderCard({ name, config, update, check }) {
                const isGitea = name === 'gitea';
                const instances = getConfigValue(config, ['providers', 'gitea', 'instances'], []);
                const updateInstances = (next) => update(['providers', 'gitea', 'instances'], next);
                return h('section', { className: 'dsh-git-card' }, h('div', { className: 'dsh-git-provider-heading' }, h('h2', { className: 'dsh-git-card-title' }, isGitea ? t('gitea') : t('github')), isGitea && instances.length ? h('span', { className: 'dsh-git-count' }, String(instances.length)) : null), isGitea ? h('p', { className: 'dsh-git-field-hint' }, t('instancesHint')) : null, isGitea && instances.length ? instances.map((instance, index) => h('section', { className: 'dsh-git-instance', key: index }, h('div', { className: 'dsh-git-instance-heading' }, h('h3', { className: 'dsh-git-card-title' }, `${t('instance')} ${index + 1}`), h('button', { className: 'dsh-git-remove', type: 'button',
                    'aria-label': `${t('removeInstance')} ${index + 1}`,
                    onClick: () => updateInstances(instances.filter((_, itemIndex) => itemIndex !== index)),
                }, t('removeInstance'))), ...['origin', 'baseUrl', 'tokenRef'].map(field => h(ConfigField, {
                    key: field,
                    label: t(field),
                    type: field === 'tokenRef' ? 'password' : 'text',
                    value: instance[field],
                    hint: t(field === 'origin' ? 'originHint' : field === 'baseUrl' ? 'giteaHint' : 'credentialHint'),
                    onChange: (value) => updateInstances(instances.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: String(value) } : item)),
                })), check(`instance-${index}`, instance))) : [h(ConfigField, {
                        key: 'baseUrl',
                        label: t('baseUrl'),
                        value: getConfigValue(config, ['providers', name, 'baseUrl'], ''),
                        onChange: (value) => update(['providers', name, 'baseUrl'], value),
                        hint: isGitea ? t('giteaHint') : null,
                    }),
                    h(ConfigField, {
                        key: 'tokenRef',
                        type: 'password',
                        label: t('tokenRef'),
                        value: getConfigValue(config, ['providers', name, 'tokenRef'], ''),
                        onChange: (value) => update(['providers', name, 'tokenRef'], value),
                        hint: t('credentialHint'),
                    })], isGitea && !instances.length ? check('single', config.providers.gitea) : null, isGitea ? h('button', {
                    className: 'dsh-git-secondary', type: 'button',
                    onClick: () => updateInstances([...instances, { origin: '', baseUrl: '', tokenRef: '' }]),
                }, t('addInstance')) : null);
            }
            return function GitSettingsPage() {
                const [state, setState] = React.useState({ status: 'loading', snapshot: null, config: null, error: null, saving: false, saved: false });
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
                    return h('section', { className: 'dsh-git-settings' }, h('p', { className: 'dsh-git-error' }, t('unavailable')));
                }
                const update = (path, value) => {
                    setState(current => {
                        const next = cloneConfig(current.config ?? current.snapshot?.value ?? config);
                        let target = next;
                        for (let index = 0; index < path.length - 1; index += 1) {
                            const key = path[index];
                            const nested = target[key];
                            target[key] = { ...(nested && typeof nested === 'object' ? nested : {}) };
                            target = target[key];
                        }
                        target[path[path.length - 1]] = value;
                        return { ...current, config: next, saved: false };
                    });
                };
                const save = async () => {
                    setState(current => ({ ...current, saving: true, saved: false, error: null }));
                    try {
                        const paths = [
                            ['providers', 'github', 'baseUrl'],
                            ['providers', 'github', 'tokenRef'],
                            ['providers', 'gitea', 'baseUrl'],
                            ['providers', 'gitea', 'tokenRef'],
                            ['providers', 'gitea', 'instances'],
                            ['requestTimeoutMs'],
                            ['maxPageSize'],
                        ];
                        const operations = paths.map(path => ({
                            op: 'set', path, value: getConfigValue(config, path, path[2] === 'instances' ? [] : ''),
                        }));
                        const accepted = await form?.mutate(operations, state.snapshot?.revision);
                        if (!accepted)
                            throw new Error('The configuration was changed elsewhere. Reload and try again.');
                        const snapshot = form?.getSnapshot();
                        if (!snapshot)
                            throw new Error('Configuration snapshot is unavailable.');
                        setState(current => ({
                            ...current,
                            status: snapshot.status,
                            snapshot,
                            config: null,
                            saving: false,
                            saved: true,
                        }));
                    }
                    catch (error) {
                        console.error(error);
                        setState(current => ({ ...current, saving: false, saved: false, error: error instanceof Error ? error : new Error(String(error)) }));
                    }
                };
                const check = (key, connection) => {
                    const signature = JSON.stringify([connection, config.requestTimeoutMs]);
                    const result = state.checks?.[key];
                    const current = result?.signature === signature ? result : undefined;
                    const run = async () => {
                        const pending = { signature, pending: true };
                        setState(value => ({ ...value, checks: { ...value.checks, [key]: pending } }));
                        try {
                            const response = await testConnection(connection, config.requestTimeoutMs);
                            setState(value => value.checks?.[key] !== pending ? value : ({ ...value, checks: { ...value.checks, [key]: { signature, pending: false, ok: true, message: `${t('connected')} ${response.login}` } } }));
                        }
                        catch (error) {
                            setState(value => value.checks?.[key] !== pending ? value : ({ ...value, checks: { ...value.checks, [key]: { signature, pending: false, ok: false, message: error instanceof Error ? error.message : String(error) } } }));
                        }
                    };
                    return h('div', { className: 'dsh-git-check' }, h('div', { className: 'dsh-git-check-row' }, h('button', { type: 'button', className: 'dsh-git-secondary', 'aria-label': `${t('test')} ${key === 'single' ? t('gitea') : `${t('instance')} ${Number(key.split('-')[1]) + 1}`}`, disabled: current?.pending || !connection.baseUrl.trim() || !connection.tokenRef.trim(), onClick: run }, t(current?.pending ? 'testing' : 'test')), h('span', { role: 'status', 'aria-live': 'polite', className: current?.ok ? 'dsh-git-saved' : 'dsh-git-error' }, current?.message ?? '')), h('p', { className: 'dsh-git-field-hint' }, t('testHint')));
                };
                return h('section', { className: 'dsh-git-settings' }, h('header', { className: 'dsh-git-header' }, h('h1', { className: 'dsh-git-title' }, t('title')), h('p', { className: 'dsh-git-description' }, t('description'))), h(ProviderCard, { name: 'github', config, update, check }), h(ProviderCard, { name: 'gitea', config, update, check }), h('section', { className: 'dsh-git-card dsh-git-general' }, h('h2', { className: 'dsh-git-card-title' }, t('general')), h(ConfigField, {
                    label: t('timeout'),
                    type: 'number',
                    min: 1000,
                    value: getConfigValue(config, ['requestTimeoutMs'], 30000),
                    onChange: (value) => update(['requestTimeoutMs'], value),
                }), h(ConfigField, {
                    label: t('pageSize'),
                    type: 'number',
                    min: 1,
                    max: 100,
                    value: getConfigValue(config, ['maxPageSize'], 50),
                    onChange: (value) => update(['maxPageSize'], value),
                })), state.error ? h('p', { className: 'dsh-git-error' }, `${t('error')} ${state.error.message}`) : null, h('div', { className: 'dsh-git-actions' }, h('button', {
                    className: 'dsh-git-save',
                    type: 'button',
                    disabled: state.saving,
                    onClick: save,
                }, state.saving ? t('saving') : t('save')), state.saved ? h('span', { className: 'dsh-git-saved' }, t('saved')) : null));
            };
        }
        return {
            inject: ['slots', 'locale', 'configForms', 'connection'],
            apply(ctx) {
                ctx.effect(() => ctx.locale.register(NS, copy), 'git plugin settings translations');
                const t = ctx.locale.bind(NS);
                ctx.effect(() => {
                    if (typeof document === 'undefined')
                        return undefined;
                    const style = document.createElement('style');
                    style.dataset.plugin = 'dsh-git-connect';
                    style.textContent = `
            .dsh-git-settings { width: 100%; max-width: 880px; color: var(--dsw-alias-label-primary); font: inherit; display: flex; flex-direction: column; gap: 24px; padding-bottom: 24px; }
            .dsh-git-header { display: flex; flex-direction: column; gap: 8px; }
            .dsh-git-title { margin: 0; font-size: 22px; line-height: 30px; font-weight: 650; letter-spacing: -.4px; }
            .dsh-git-description, .dsh-git-status, .dsh-git-field-hint { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 19px; margin: 0; max-width: 72ch; overflow-wrap: anywhere; }
            .dsh-git-card { min-width: 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 18px; }
            .dsh-git-provider-heading, .dsh-git-instance-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
            .dsh-git-provider-heading { justify-content: flex-start; }
            .dsh-git-card-title { margin: 0; font-size: 15px; line-height: 22px; font-weight: 600; }
            .dsh-git-count { font-size: 12px; padding: 1px 8px; border-radius: 12px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); }
            .dsh-git-instance { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 20px; }
            .dsh-git-instance-heading, .dsh-git-instance > .dsh-git-field:nth-child(2), .dsh-git-check { grid-column: 1 / -1; }
            .dsh-git-instance-heading .dsh-git-card-title { font-size: 13px; }
            .dsh-git-secondary, .dsh-git-remove, .dsh-git-save { cursor: pointer; font: inherit; font-size: 13px; line-height: 20px; border-radius: 7px; padding: 8px 14px; }
            .dsh-git-secondary { align-self: flex-start; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
            .dsh-git-remove { border: 0; background: transparent; color: var(--dsw-alias-state-error-primary); padding: 4px 0 4px 8px; }
            .dsh-git-field { min-width: 0; display: flex; flex-direction: column; gap: 7px; }
            .dsh-git-field-label { font-size: 13px; color: var(--dsw-alias-label-primary); }
            .dsh-git-input { box-sizing: border-box; width: 100%; height: 40px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; padding: 0 12px; }
            .dsh-git-input:focus-visible, .dsh-git-settings button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; }
            .dsh-git-check { display: flex; flex-direction: column; gap: 8px; }
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
                }, makePage(t, form, ctx.connection)));
            },
        };
    },
});
