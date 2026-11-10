# 代码协作 · Code Collaboration

Connect agents to code hosting platforms and bring development collaboration into everyday work.

`dsh-git-connect` adds one Agent tool, `git_host`, for GitHub and Gitea repositories, Issues, and Pull Requests.

Supported operations:

- `repository_get`: repository metadata
- `repository_list`: repositories visible to the authenticated user, or an organization
- `issue_list` and `issue_get`
- `issue_create`
- `issue_comment`
- `issue_update`
- `issue_close`
- `pull_request_list`, `pull_request_get`, `pull_request_files`, `pull_request_diff`
- `pull_request_create`, `pull_request_update`, `pull_request_close`, `pull_request_reopen`
- `pull_request_comment_list`, `pull_request_comment`, `pull_request_merge`
- `workflow_run_list`, `workflow_run_get`, and `workflow_job_list`: Gitea Actions execution status (read-only)

## Installation

Install from npm into a DSH profile:

```bash
dsh plugin --profile demo add dsh-git-connect
```

Alternatively, install from GitHub or a local tarball:

```bash
dsh plugin --profile demo add github:urzz/dsh-git-connect
dsh plugin --profile demo add ./dsh-git-connect-0.0.12.tgz
```

## Configuration

The plugin uses the GitHub REST API and the Gitea v1 API. The default endpoints are:

- GitHub: `https://api.github.com`
- Gitea: `https://gitea.com/api/v1`

Configure each provider's access token directly in its `tokenRef` field (despite the field name, this is a token value, not a credential-store reference). Enter the token without an authorization prefix: the plugin adds `Bearer` for GitHub and `token` for Gitea.

Settings take effect on the next tool call after saving, without disabling the plugin. Each in-flight request retains the configuration it started with. Requests respect the configured timeout and session cancellation.

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

## Pull Requests (GitHub and Gitea)

Both providers support the following actions with `provider`, `owner`, and `repo`. Use the repository's PR **number**, not its database ID.

| Action | Additional arguments |
| --- | --- |
| `pull_request_list` | Optional `state` (`open`, `closed`, `all`), `base`, `page`, `per_page` |
| `pull_request_get` | `number` |
| `pull_request_files` | `number`; optional `page`, `per_page` |
| `pull_request_diff` | `number` |
| `pull_request_create` | `title`, `head`, `base`; optional `body` |
| `pull_request_update` | `number`; at least one of `title`, `body`, `base` |
| `pull_request_close`, `pull_request_reopen` | `number` |
| `pull_request_comment_list` | `number`; optional `page`, `per_page` |
| `pull_request_comment` | `number`, nonempty `body` |
| `pull_request_merge` | `number`, explicit `merge_method`; optional `head_sha` |

Create a PR (use either provider):

```json
{"provider":"github","action":"pull_request_create","owner":"my-org","repo":"my-repo","title":"Fix login","head":"fix/login","base":"main","body":"Handle expired sessions."}
```

`head` also accepts `username:branch` for a fork when the platform permits it. An empty `body` on update clears the description. PR, file, and comment responses preserve provider JSON in `data`; diff returns raw text. Lists fetch one page per call: request further pages explicitly. Gitea maps `per_page` to `limit`; GitHub uses `per_page` and caps the files endpoint at 3,000 files. A diff is a single response, not a paginated list.

Comments are ordinary conversation comments. Both providers share their Issue comment endpoints with PRs; the tool verifies the PR exists before accessing comments. Review approvals, inline review comments, and reviewer management are not supported.

Merge after inspecting the PR's `head.sha`:

```json
{"provider":"gitea","action":"pull_request_merge","owner":"my-org","repo":"my-repo","number":42,"merge_method":"squash","head_sha":"<head.sha from pull_request_get>"}
```

GitHub supports `merge`, `rebase`, and `squash`; Gitea additionally supports `rebase-merge` and `fast-forward-only`. There is no default method. When provided, `head_sha` is checked by the server to reject a changed head; omitting it merges the current head without this guard. Repository rules, enabled merge methods, permissions, and conflicts still apply. There is no force merge or automatic retry. GitHub's `merged: false` response is reported as failure even with HTTP 200. Gitea may return no body on success (`data: null`).

The tool does not call branch deletion APIs. Gitea merges explicitly request retaining the source branch. GitHub merges follow the repository's automatic branch deletion setting, which this API cannot override.

The Gitea contract targets [1.25](https://github.com/go-gitea/gitea/blob/release/v1.25/routers/api/v1/repo/pull.go); GitHub uses the [PR REST API](https://docs.github.com/en/rest/pulls/pulls). Tokens must have access to the repository and permission for the requested operation. GitHub fine-grained tokens need Pull requests read/write as appropriate; Gitea scoped tokens need repository and issue access appropriate to PRs and comments. HTTP errors remain visible; check repository access, branch protections and instance API support when an operation fails.

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
