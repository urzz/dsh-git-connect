# DSH Git Host

`dsh-git-connect` adds one Agent tool, `git_host`, for GitHub and Gitea repositories and Issues.

Supported operations:

- `repository_get`: repository metadata
- `repository_list`: repositories visible to the authenticated user, or an organization
- `issue_list` and `issue_get`
- `issue_create`
- `issue_comment`
- `issue_update`
- `issue_close`

The plugin uses the GitHub REST API and the Gitea v1 API. The default endpoints are:

- GitHub: `https://api.github.com`
- Gitea: `https://gitea.com/api/v1`

Configure each provider's access token directly in its `tokenRef` field. The plugin sends that value in the provider's Authorization header as-is.

A profile patch can override endpoints or tokens:

```yaml
- override:
    - id: dsh-git-plugin
      config:
        providers:
          github:
            baseUrl: https://api.github.com
            tokenRef: '<github-access-token>'
          gitea:
            # Include the Gitea REST API suffix for a self-hosted instance.
            baseUrl: https://gitea.example.com/api/v1
            tokenRef: '<gitea-access-token>'
        requestTimeoutMs: 30000
        maxPageSize: 50
```

For self-hosted Gitea, set `providers.gitea.baseUrl` to the complete REST API root, such as `https://git.example.com/api/v1`. This supports installations behind a reverse proxy or at a custom API path as well.

Set each provider's token value in the profile configuration. The tool accepts `provider: github|gitea`, an `action`, and the repository/issue arguments described in its schema.

## Development

The implementation lives in `src/index.ts` and `src/client/index.ts`. Runtime JavaScript and declarations are generated into the official `lib/` package layout, with compatibility copies for the existing DSH loader:

```bash
pnpm typecheck
pnpm build
pnpm test
```

`pnpm build` writes the compiled entry points to the project root and synchronizes the `.release` bundle.

## DSH reference and package conventions

The authoritative DSH documentation is the [reference index](https://deepseek-harness.github.io/deepseek-harness/reference/). The pages most relevant to this plugin are:

- [Adding a workspace package](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-package) — package layout, exports, TypeScript build outputs, metadata, and verification.
- [Writing a tool](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-tool) — `defineTool`, typed arguments, output schemas, cancellation, rendering, and tool tests.
- [Adding a settings card](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-settings-card) — volatile configuration, revision-aware form mutations, and browser-side settings modules.
- [Extension cookbook](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/extension-cookbook) — the extension-point map for tools, hooks, UI, and other plugins.
- [Client modules](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/client-modules) — the browser module loader contract.

This repository is a standalone plugin rather than a package inside the Harness workspace, but it now follows the official published package layout: `lib/index.js` and `lib/client.js` contain runtime output, and `lib/types/**/*.d.ts` contains declarations. The package manifest exposes those files through conditional `exports` and lists the exact published artifacts in `files`. The TypeScript source remains under `src/`, with the browser half at `src/client/index.ts`. Root `index.js`, `client.js`, and `probe-index.js` are generated compatibility copies for the existing standalone loader. `.release/` contains the same official `lib` package outputs plus the root aliases used by the release loader. `scripts/sync-release.mjs` produces these copies after the official `lib` outputs are built.

The implementation follows the tool-side contracts that apply here:

- `defineTool` derives the `execute` argument type from the parameter schema through `InferArgs`.
- `output.schema` describes the structured JSON returned by `execute`; `render` only creates the human-readable view.
- Request work receives and honors `exec.signal`, while provider credentials stay in plugin configuration rather than tool arguments.
- Provider and pagination constraints that the schema DSL cannot express are checked in `execute` before making a request.
- The browser half registers a lazy module with `window.__ModuleLoader__`, obtains the settings form through `configForms`, and writes with the form revision so concurrent edits are rejected safely.

When extending the plugin, follow the official tool and settings guides before introducing a new event, slot, or client-side protocol. Configuration fields are currently documented as direct token values in `tokenRef`; deployments with a credential-reference service should use that host facility and mark credential fields as secret according to the settings-card guide.

Official production examples include [`dsh-tool-bash`](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/shell/tool-bash) for a typed model-facing tool and [`dsh-client-ui-settings-plugins`](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-settings-plugins) for a host/browser settings surface.
