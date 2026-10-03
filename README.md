# DSH Git Host

`@local/dsh-git-plugin` adds one Agent tool, `git_host`, for GitHub and Gitea repositories and Issues.

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

Tokens are never placed in the plugin configuration. The configuration stores credential references (environment variable names) and resolves them through DSH's credential service for each request. The defaults are `GITHUB_TOKEN` and `GITEA_TOKEN`.

A profile patch can override endpoints or references:

```yaml
- override:
    - id: dsh-git-plugin
      config:
        providers:
          github:
            baseUrl: https://api.github.com
            tokenRef: GITHUB_TOKEN
          gitea:
            # Include the Gitea REST API suffix for a self-hosted instance.
            baseUrl: https://gitea.example.com/api/v1
            tokenRef: GITEA_TOKEN
        requestTimeoutMs: 30000
        maxPageSize: 50
```

For self-hosted Gitea, set `providers.gitea.baseUrl` to the complete REST API root, such as `https://git.example.com/api/v1`. This supports installations behind a reverse proxy or at a custom API path as well.

Set the referenced credentials through the DSH credential settings or the corresponding environment variables. The tool accepts `provider: github|gitea`, an `action`, and the repository/issue arguments described in its schema.
