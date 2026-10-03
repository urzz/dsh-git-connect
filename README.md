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
