window.__ModuleLoader__.load({
  id: '@local/dsh-git-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'dsh-git-plugin.settings';

    const copy = {
      en: {
        label: 'Git repositories',
        title: 'Git repositories and issues',
        description: 'Configure the GitHub and Gitea connections used by the git_host tool.',
        github: 'GitHub',
        gitea: 'Gitea',
        baseUrl: 'API base URL',
        tokenRef: 'Credential reference',
        timeout: 'Request timeout (ms)',
        pageSize: 'Maximum page size',
        save: 'Save changes',
        saving: 'Saving…',
        saved: 'Saved',
        loading: 'Loading configuration…',
        unavailable: 'Configuration is unavailable in this page.',
        error: 'Could not load or save the configuration.',
        credentialHint: 'Name of the credential configured in DSH.',
        giteaHint: 'For self-hosted Gitea, include the complete API root, usually ending in /api/v1.',
      },
      zh: {
        label: 'Git 仓库',
        title: 'Git 仓库与 Issues',
        description: '配置 git_host 工具使用的 GitHub 和 Gitea 连接。',
        github: 'GitHub',
        gitea: 'Gitea',
        baseUrl: 'API 基础地址',
        tokenRef: '凭据引用',
        timeout: '请求超时（毫秒）',
        pageSize: '最大分页数量',
        save: '保存更改',
        saving: '保存中…',
        saved: '已保存',
        loading: '正在加载配置…',
        unavailable: '此页面暂时无法访问配置。',
        error: '配置加载或保存失败。',
        credentialHint: '填写 DSH 中已配置的凭据名称。',
        giteaHint: '自部署 Gitea 请填写完整 API 根地址，通常以 /api/v1 结尾。',
      },
    };

    function makePage(t, form) {
      function getConfigValue(config, path, fallback) {
        let value = config;
        for (const part of path) value = value?.[part];
        return value ?? fallback;
      }

      function ConfigField({ label, hint, value, onChange, type = 'text', min, max }) {
        return h('label', { className: 'dsh-git-field' },
          h('span', { className: 'dsh-git-field-label' }, label),
          h('input', {
            className: 'dsh-git-input',
            type,
            value: value ?? '',
            min,
            max,
            onChange: event => onChange(type === 'number' ? Number(event.target.value) : event.target.value),
          }),
          hint ? h('span', { className: 'dsh-git-field-hint' }, hint) : null,
        );
      }

      function ProviderCard({ name, config, update }) {
        const isGitea = name === 'gitea';
        return h('section', { className: 'dsh-git-card' },
          h('h2', { className: 'dsh-git-card-title' }, isGitea ? t('gitea') : t('github')),
          h(ConfigField, {
            label: t('baseUrl'),
            value: getConfigValue(config, ['providers', name, 'baseUrl'], ''),
            onChange: value => update(['providers', name, 'baseUrl'], value),
            hint: isGitea ? t('giteaHint') : null,
          }),
          h(ConfigField, {
            label: t('tokenRef'),
            value: getConfigValue(config, ['providers', name, 'tokenRef'], ''),
            onChange: value => update(['providers', name, 'tokenRef'], value),
            hint: t('credentialHint'),
          }),
        );
      }

      return function GitSettingsPage() {
        const [state, setState] = React.useState({ status: 'loading', snapshot: null, config: null, error: null, saved: false });
        React.useEffect(() => {
          if (!form) {
            setState(current => ({ ...current, status: 'unavailable' }));
            return undefined;
          }
          const sync = () => {
            const snapshot = form.getSnapshot();
            setState(current => ({
              ...current,
              status: snapshot.status === 'ready' ? 'ready' : snapshot.status,
              snapshot,
              config: current.config ?? snapshot.value,
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
        if (state.status !== 'ready' || !state.config) {
          return h('section', { className: 'dsh-git-settings' },
            h('p', { className: 'dsh-git-error' }, t('unavailable')),
          );
        }

        const config = state.config;
        const update = (path, value) => {
          setState(current => {
            const next = { ...current.config };
            let target = next;
            for (let index = 0; index < path.length - 1; index += 1) {
              target[path[index]] = { ...(target[path[index]] ?? {}) };
              target = target[path[index]];
            }
            target[path[path.length - 1]] = value;
            return { ...current, config: next, saved: false };
          });
        };
        const save = async () => {
          setState(current => ({ ...current, saving: true, saved: false, error: null }));
          try {
            const operations = [
              ['providers', 'github', 'baseUrl'],
              ['providers', 'github', 'tokenRef'],
              ['providers', 'gitea', 'baseUrl'],
              ['providers', 'gitea', 'tokenRef'],
              ['requestTimeoutMs'],
              ['maxPageSize'],
            ].map(path => ({ op: 'set', path, value: getConfigValue(state.config, path, '') }));
            const accepted = await form.mutate(operations, state.snapshot?.revision);
            if (!accepted) throw new Error('The configuration was changed elsewhere. Reload and try again.');
            setState(current => ({ ...current, config: null, saving: false, saved: true }));
          } catch (error) {
            console.error(error);
            setState(current => ({ ...current, saving: false, saved: false, error }));
          }
        };

        return h('section', { className: 'dsh-git-settings' },
          h('header', { className: 'dsh-git-header' },
            h('h1', { className: 'dsh-git-title' }, t('title')),
            h('p', { className: 'dsh-git-description' }, t('description')),
          ),
          h(ProviderCard, { name: 'github', config, update }),
          h(ProviderCard, { name: 'gitea', config, update }),
          h('section', { className: 'dsh-git-card dsh-git-general' },
            h(ConfigField, {
              label: t('timeout'),
              type: 'number',
              min: 1000,
              value: getConfigValue(config, ['requestTimeoutMs'], 30000),
              onChange: value => update(['requestTimeoutMs'], value),
            }),
            h(ConfigField, {
              label: t('pageSize'),
              type: 'number',
              min: 1,
              max: 100,
              value: getConfigValue(config, ['maxPageSize'], 50),
              onChange: value => update(['maxPageSize'], value),
            }),
          ),
          state.error ? h('p', { className: 'dsh-git-error' }, `${t('error')} ${state.error.message ?? ''}`) : null,
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
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, copy), 'git plugin settings translations');
        const t = ctx.locale.bind(NS);
        ctx.effect(() => {
          if (typeof document === 'undefined') return undefined;
          const style = document.createElement('style');
          style.dataset.plugin = '@local/dsh-git-plugin';
          style.textContent = `
            .dsh-git-settings { width: 100%; max-width: 760px; color: var(--dsw-alias-label-primary); display: flex; flex-direction: column; gap: 16px; }
            .dsh-git-header { display: flex; flex-direction: column; gap: 6px; }
            .dsh-git-title, .dsh-git-card-title { margin: 0; font-size: 16px; font-weight: 600; }
            .dsh-git-description, .dsh-git-status, .dsh-git-field-hint { color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; margin: 0; }
            .dsh-git-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
            .dsh-git-card-title { font-size: 14px; }
            .dsh-git-field { display: flex; flex-direction: column; gap: 6px; }
            .dsh-git-field-label { font-size: 13px; color: var(--dsw-alias-label-primary); }
            .dsh-git-input { box-sizing: border-box; width: 100%; height: 36px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; padding: 0 10px; outline: none; }
            .dsh-git-input:focus { border-color: var(--dsw-alias-brand-primary); }
            .dsh-git-actions { display: flex; align-items: center; gap: 12px; }
            .dsh-git-save { border: 0; border-radius: 6px; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); cursor: pointer; font: inherit; font-size: 13px; padding: 9px 16px; }
            .dsh-git-save:disabled { cursor: default; opacity: .6; }
            .dsh-git-saved { color: var(--dsw-alias-state-success-primary); font-size: 13px; }
            .dsh-git-error { color: var(--dsw-alias-state-error-primary); font-size: 13px; line-height: 20px; margin: 0; }
          `;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'git plugin settings styles');
        const form = ctx.configForms.get('dsh-git-plugin');
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: '@local/dsh-git-plugin',
          locale: NS,
        }, makePage(t, form)));
      },
    };
  },
});
