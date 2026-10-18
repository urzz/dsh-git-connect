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
- `workflow_run_list`, `workflow_run_get`, and `workflow_job_list`: Gitea Actions execution status (read-only)

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

## Gitea workflow execution status

Use `git_host` with `provider: "gitea"`, `owner`, and `repo`:

| Action | Purpose | Additional arguments |
| --- | --- | --- |
| `workflow_run_list` | List runs, including status and conclusion | Optional `branch`, `event`, `status`, `actor`, `head_sha`, `page`, `per_page` |
| `workflow_run_get` | Inspect a specific run | Required `run_id` |
| `workflow_job_list` | Inspect jobs and steps in a run | Required `run_id`; optional `status`, `page`, `per_page` |

For example, list failed runs on the main branch:

```json
{"provider":"gitea","action":"workflow_run_list","owner":"my-org","repo":"my-repo","branch":"main","status":"failure","per_page":10}
```

Then inspect the jobs using the returned run's **`id`**, not its `run_number` or the number in a web URL:

```json
{"provider":"gitea","action":"workflow_job_list","owner":"my-org","repo":"my-repo","run_id":801}
```

Responses preserve the provider JSON in `data`, including `total_count`, `workflow_runs` or `jobs`, statuses, conclusions, timestamps, steps, and runner information when returned by Gitea. The tool maps `per_page` to Gitea's `limit`; request subsequent pages explicitly. These actions do not fetch logs, list available runners, trigger workflows, cancel runs, or rerun jobs. GitHub workflow queries are not implemented.

Gitea 1.25 derives step status/conclusion from the job status in its API converter, so step entries alone cannot reliably identify the failing step; inspect the linked web run for that diagnosis. A jobs query for an unknown positive run ID can return an empty list; use `workflow_run_get` to check that the run exists.

The API contract was checked against [Gitea 1.25 handlers](https://github.com/go-gitea/gitea/blob/release/v1.25/routers/api/v1/repo/action.go) and [routes](https://github.com/go-gitea/gitea/blob/release/v1.25/routers/api/v1/api.go). Your instance must expose these Actions endpoints. In that version, listing repository runs requires a signed-in repository owner or site administrator; getting a run or listing its jobs requires Actions read access. Scoped tokens need `read:repository` access to the target repository. Older versions may lack these endpoints. HTTP 403/404 remain explicit errors: check token permissions, repository visibility, Actions availability, and the instance's API version rather than treating an error as an empty run list.

## DSH compatibility

The `@deepseek-ai/dsh-tools` peer dependency declares `^0.2.0-rc.2`: DSH 0.2 releases starting at 0.2.0-rc.2 are supported, including 0.2.1-rc.2. DSH's compatibility checker includes prereleases when evaluating this range. Versions before that minimum and the 0.3 series (including its prereleases) are outside the declared range.

Keep the peer dependency as a compatibility range; `pnpm-lock.yaml` pins the concrete development dependency version for reproducible installs. Do not replace the range with the current host's exact version on each upgrade. Reassess the range when the plugin starts requiring newer APIs or DSH introduces breaking changes.

## Development

The implementation lives in `src/index.ts` and `src/client/index.ts`. Runtime JavaScript and declarations are generated into the official `lib/` package layout, with compatibility copies for the existing DSH loader:

```bash
pnpm typecheck
pnpm build
pnpm test
```

`pnpm build` writes the compiled entry points to the project root and synchronizes the `.release` bundle. Commit `lib/index.js`, `lib/client.js`, and `lib/types/**/*.d.ts` together with source changes: direct GitHub installs (`github:urzz/dsh-git-connect`) use the repository root and its declared `lib/` entry points, not the `.release/` directory. The runtime artifacts are checked in so installation does not depend on running TypeScript or package lifecycle scripts.

`pnpm test` includes a Git-source packaging check: it copies only tracked and nonignored candidate files to a temporary directory, then checks the npm package file list without running lifecycle scripts or installing dependencies. This catches missing entry points even when an ignored local build directory exists.

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
