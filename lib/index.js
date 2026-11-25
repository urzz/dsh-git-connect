import { defineTool } from '@deepseek-ai/dsh-tools';
import z from '@deepseek-ai/schemastery';
export const inject = ['tools'];
const GiteaInstance = z.object({
    origin: z.string().required(),
    baseUrl: z.string().required(),
    tokenRef: z.string().required(),
});
export const Config = z.object({
    providers: z.object({
        github: z.object({
            baseUrl: z.string().default('https://api.github.com').volatile(),
            tokenRef: z.string().default('').volatile(),
        }).default({}),
        gitea: z.object({
            instances: z.array(GiteaInstance).default([]).volatile(),
            baseUrl: z.string().default('https://gitea.com/api/v1').volatile(),
            tokenRef: z.string().default('').volatile(),
        }).default({}),
    }).default({}),
    requestTimeoutMs: z.natural().min(1000).default(30000).volatile(),
    maxPageSize: z.natural().min(1).max(100).default(50).volatile(),
});
function snapshotConfig(input) {
    return {
        providers: {
            github: {
                baseUrl: input.providers.github.baseUrl.get(),
                tokenRef: input.providers.github.tokenRef.get(),
            },
            gitea: {
                instances: input.providers.gitea.instances.get().map(instance => ({ ...instance })),
                baseUrl: input.providers.gitea.baseUrl.get(),
                tokenRef: input.providers.gitea.tokenRef.get(),
            },
        },
        requestTimeoutMs: input.requestTimeoutMs.get(),
        maxPageSize: input.maxPageSize.get(),
    };
}
const PROVIDERS = ['github', 'gitea'];
const ACTIONS = [
    'repository_get',
    'repository_list',
    'issue_list',
    'issue_get',
    'issue_create',
    'issue_comment',
    'issue_update',
    'issue_close',
    'pull_request_list',
    'pull_request_get',
    'pull_request_files',
    'pull_request_diff',
    'pull_request_create',
    'pull_request_update',
    'pull_request_close',
    'pull_request_reopen',
    'pull_request_comment_list',
    'pull_request_comment',
    'pull_request_merge',
    'workflow_run_list',
    'workflow_run_get',
    'workflow_job_list',
];
const outputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        provider: { type: 'string', required: true },
        action: { type: 'string', required: true },
        data: { type: 'json', required: true },
    },
};
const parameters = {
    action: { type: 'string', required: true, enum: ACTIONS, description: 'Operation to perform.' },
    provider: { type: 'string', enum: PROVIDERS, description: 'Target platform override. Omit to detect from the current repository origin: github.com selects GitHub; a configured Gitea origin prefix selects Gitea. Specify github or gitea for cross-platform operations or when detection is unavailable. Explicit github calls do not read the workspace origin.' },
    owner: { type: 'string', description: 'Repository owner or organization. Required except for repository_list.' },
    repo: { type: 'string', description: 'Repository name. Required except for repository_list.' },
    organization: { type: 'string', description: 'Organization to list repositories from; omit to list repositories visible to the authenticated user.' },
    run_id: { type: 'integer', description: 'Required for workflow_run_get and workflow_job_list. Use the id returned by workflow_run_list, not the run_number shown in the web UI.' },
    branch: { type: 'string', description: 'Branch filter for workflow_run_list.' },
    event: { type: 'string', description: 'Trigger event filter for workflow_run_list, e.g. push or pull_request.' },
    status: { type: 'string', description: 'Status or conclusion filter for workflow_run_list (both providers) and workflow_job_list (Gitea only), e.g. queued, in_progress, success, or failure. Omit for all statuses.' },
    actor: { type: 'string', description: 'Triggering user login filter for workflow_run_list.' },
    head_sha: { type: 'string', description: 'Commit SHA filter for workflow_run_list; expected head SHA for pull_request_merge. Omit to merge the current head without a SHA guard.' },
    head: { type: 'string', description: 'Source branch for pull_request_create; supports username:branch for forks.' },
    base: { type: 'string', description: 'Target branch, required for pull_request_create; optional for PR update and list filtering.' },
    merge_method: { type: 'string', enum: ['merge', 'rebase', 'rebase-merge', 'squash', 'fast-forward-only'], description: 'Required for pull_request_merge. GitHub supports merge, rebase, squash; Gitea additionally supports rebase-merge and fast-forward-only.' },
    number: { type: 'integer', description: 'Repository Issue or PR number, not its database id. Required for numbered Issue and PR operations.' },
    title: { type: 'string', description: 'Issue or PR title, required for issue_create and pull_request_create.' },
    body: { type: 'string', description: 'Issue, PR or ordinary comment body. An empty string clears a PR description on update.' },
    labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels.' },
    assignee: { type: 'string', description: 'Login of an assignee.' },
    state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue or PR list state filter; for issue_update only open or closed is accepted by the provider. PR close/reopen use dedicated actions.' },
    sort: { type: 'string', enum: ['created', 'updated'], description: 'Sort order for list operations.' },
    direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction for list operations.' },
    page: { type: 'integer', description: '1-based page number.' },
    per_page: { type: 'integer', description: 'Items per page, capped by plugin configuration.' },
};
function text(value, name) {
    if (typeof value !== 'string' || value.trim() === '')
        throw new Error(`${name} must be a non-empty string`);
    return value.trim();
}
function positiveInteger(value, name) {
    if (!Number.isInteger(value) || value < 1)
        throw new Error(`${name} must be a positive integer`);
    return value;
}
function pathPart(value, name) {
    return encodeURIComponent(text(value, name));
}
function endpoint(config, provider) {
    const raw = config.providers[provider].baseUrl.trim().replace(/\/+$/, '');
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new Error(`${provider}.baseUrl must be a valid URL`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`${provider}.baseUrl must use http or https`);
    }
    return raw;
}
function queryUrl(base, path, values = {}) {
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined && value !== '')
            url.searchParams.set(key, String(value));
    }
    return url;
}
function issuePath(args) {
    return `/repos/${pathPart(args.owner, 'owner')}/${pathPart(args.repo, 'repo')}/issues`;
}
function nullable(value) {
    return value === undefined ? null : value;
}
function compactIssue(issue) {
    if (Array.isArray(issue))
        return issue.map(compactIssue);
    if (!issue || typeof issue !== 'object')
        return issue;
    const value = issue;
    const user = value.user;
    const assignee = value.assignee;
    const labels = Array.isArray(value.labels)
        ? value.labels.map(label => {
            if (typeof label === 'string')
                return label;
            const name = label?.name;
            return typeof name === 'string' ? name : '';
        }).filter(Boolean)
        : [];
    const userName = typeof user?.login === 'string' ? user.login : typeof user?.username === 'string' ? user.username : null;
    const assigneeName = typeof assignee?.login === 'string' ? assignee.login : typeof assignee?.username === 'string' ? assignee.username : null;
    return {
        number: nullable(value.number),
        title: nullable(value.title),
        body: nullable(value.body),
        state: nullable(value.state),
        locked: nullable(value.locked),
        url: nullable(value.html_url ?? value.url),
        apiUrl: nullable(value.url),
        user: userName,
        assignee: assigneeName,
        labels,
        comments: nullable(value.comments),
        createdAt: nullable(value.created_at),
        updatedAt: nullable(value.updated_at),
    };
}
function compactRepositoryItem(item) {
    const owner = item.owner;
    const ownerName = typeof owner?.login === 'string' ? owner.login : typeof owner?.username === 'string' ? owner.username : null;
    return {
        id: nullable(item.id),
        name: nullable(item.name),
        fullName: nullable(item.full_name ?? item.fullName),
        description: nullable(item.description),
        private: nullable(item.private),
        archived: nullable(item.archived),
        defaultBranch: nullable(item.default_branch ?? item.defaultBranch),
        url: nullable(item.html_url ?? item.website ?? item.url),
        cloneUrl: nullable(item.clone_url ?? item.cloneUrl),
        sshUrl: nullable(item.ssh_url ?? item.sshUrl),
        stars: nullable(item.stargazers_count ?? item.stars_count ?? item.stars),
        forks: nullable(item.forks_count ?? item.forks),
        openIssues: nullable(item.open_issues_count ?? item.open_issues),
        owner: ownerName,
        permissions: nullable(item.permissions),
        createdAt: nullable(item.created_at ?? item.createdAt),
        updatedAt: nullable(item.updated_at ?? item.updatedAt),
    };
}
function compactRepository(repository) {
    if (Array.isArray(repository))
        return repository.map(item => compactRepositoryItem(item));
    if (!repository || typeof repository !== 'object')
        return repository;
    return compactRepositoryItem(repository);
}
function compactData(action, data) {
    if (action.startsWith('repository_'))
        return compactRepository(data);
    if (action.startsWith('issue_'))
        return compactIssue(data);
    return data;
}
function parseBody(raw) {
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return raw;
    }
}
function resolveToken(token) {
    return text(token, 'tokenRef');
}
async function request(config, provider, action, url, init, signal, rawText = false) {
    const providerConfig = config.providers[provider];
    const token = resolveToken(providerConfig.tokenRef);
    const headers = new Headers(init.headers);
    headers.set('Authorization', provider === 'github' ? `Bearer ${token}` : `token ${token}`);
    if (!headers.has('Accept'))
        headers.set('Accept', provider === 'github' ? 'application/vnd.github+json' : 'application/json');
    headers.set('User-Agent', 'dsh-git-connect/0.1.0');
    if (init.body !== undefined)
        headers.set('Content-Type', 'application/json');
    const timeout = AbortSignal.timeout(config.requestTimeoutMs);
    const combined = AbortSignal.any([signal, timeout]);
    const response = await fetch(url, { ...init, headers, signal: combined });
    const raw = await response.text();
    if (rawText && response.ok)
        return raw;
    const data = parseBody(raw);
    if (!response.ok) {
        const object = data && typeof data === 'object' && !Array.isArray(data) ? data : undefined;
        const detail = typeof data === 'string' ? data : object?.message ?? object?.error ?? JSON.stringify(data);
        throw new Error(`${provider} ${action} failed with HTTP ${response.status}: ${String(detail).slice(0, 1000)}`);
    }
    return data;
}
function validateArgs(args, config) {
    if (!PROVIDERS.includes(args.provider))
        throw new Error(`provider must be one of: ${PROVIDERS.join(', ')}`);
    if (!ACTIONS.includes(args.action))
        throw new Error(`action must be one of: ${ACTIONS.join(', ')}`);
    if (args.action === 'workflow_job_list' && args.provider === 'github' && args.status !== undefined) {
        throw new Error('GitHub workflow_job_list does not support status filtering; omit status and inspect returned jobs');
    }
    if (args.action === 'workflow_run_get' || args.action === 'workflow_job_list') {
        positiveInteger(args.run_id, 'run_id');
    }
    const page = args.page === undefined ? 1 : positiveInteger(args.page, 'page');
    const perPage = args.per_page === undefined ? config.maxPageSize : positiveInteger(args.per_page, 'per_page');
    if (perPage > config.maxPageSize)
        throw new Error(`per_page must be <= ${config.maxPageSize}`);
    if (args.action !== 'repository_list') {
        text(args.owner, 'owner');
        text(args.repo, 'repo');
    }
    if (args.action.startsWith('issue_') && args.action !== 'issue_create' && args.action !== 'issue_list') {
        positiveInteger(args.number, 'number');
    }
    if (args.action === 'issue_create')
        text(args.title, 'title');
    if (args.action === 'issue_comment')
        text(args.body, 'body');
    if (args.action === 'issue_update') {
        if (args.state === 'all')
            throw new Error('issue_update state must be open or closed');
        if (args.title === undefined && args.body === undefined && args.state === undefined && args.labels === undefined && args.assignee === undefined) {
            throw new Error('issue_update requires at least one of title, body, state, labels, or assignee');
        }
    }
    if (args.action.startsWith('pull_request_')) {
        if (args.action !== 'pull_request_list' && args.action !== 'pull_request_create')
            positiveInteger(args.number, 'number');
        if (args.action === 'pull_request_create') {
            text(args.title, 'title');
            text(args.head, 'head');
            text(args.base, 'base');
        }
        if (args.action === 'pull_request_update') {
            if (args.title === undefined && args.body === undefined && args.base === undefined) {
                throw new Error('pull_request_update requires at least one of title, body, or base');
            }
            if (args.title !== undefined)
                text(args.title, 'title');
            if (args.base !== undefined)
                text(args.base, 'base');
        }
        if (args.action === 'pull_request_list' && args.state !== undefined && !['open', 'closed', 'all'].includes(args.state)) {
            throw new Error('pull_request_list state must be open, closed, or all');
        }
        if (args.action === 'pull_request_comment')
            text(args.body, 'body');
        if (args.action === 'pull_request_merge') {
            const method = text(args.merge_method, 'merge_method');
            const methods = args.provider === 'github' ? ['merge', 'rebase', 'squash'] : ['merge', 'rebase', 'rebase-merge', 'squash', 'fast-forward-only'];
            if (!methods.includes(method))
                throw new Error(`${args.provider} merge_method must be one of: ${methods.join(', ')}`);
            if (args.head_sha !== undefined)
                text(args.head_sha, 'head_sha');
        }
    }
    return { page, perPage };
}
function jsonBody(value) {
    return JSON.stringify(value);
}
// Normalize clone URL forms without equating different hosts, ports or path prefixes.
function originKey(value) {
    const input = text(value, 'Repository origin');
    const scp = !input.includes('://') && input.match(/^(?:[^@/:]+@)?([^/:]+):(.*)$/);
    const url = new URL(scp ? `ssh://${scp[1]}/${scp[2]}` : input);
    if (!['http:', 'https:', 'ssh:', 'git:'].includes(url.protocol)) {
        throw new Error('Repository origin must be an HTTP(S), SSH or git clone URL');
    }
    const port = url.protocol === 'ssh:' && url.port === '22' ? '' : url.port;
    const path = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '');
    return `${url.hostname.toLowerCase()}${port ? `:${port}` : ''}${path}`;
}
async function readOrigin(ctx, config, exec) {
    const workingDirectory = ctx.get('workingDirectory');
    const subprocess = ctx.get('subprocess');
    if (!exec.agent || !workingDirectory || !subprocess) {
        throw new Error('Provider/instance detection requires an agent, workingDirectory and subprocess services; specify provider="github" or configure a single Gitea connection to operate without workspace services');
    }
    const signal = AbortSignal.any([exec.signal, AbortSignal.timeout(config.requestTimeoutMs)]);
    const cwd = await workingDirectory.ensure(exec.agent, signal);
    const git = await subprocess.resolveExecutable('git', undefined, signal);
    const proc = subprocess.spawn({
        argv: [git, 'remote', 'get-url', 'origin'], cwd, signal, graceMs: 1000,
        stdio: { stdin: 'ignore', stdout: { maxBytes: 16384 }, stderr: { maxBytes: 4096 } },
    });
    const outcome = await proc.done;
    signal.throwIfAborted();
    if (outcome.exitCode !== 0)
        throw new Error('Cannot read repository origin for provider/instance detection; specify provider explicitly when automatic detection is unavailable');
    const output = proc.collected.stdout.readFrom(0);
    if (output.lossy)
        throw new Error('Repository origin exceeds the provider/instance detection size limit');
    return originKey(output.text.trim());
}
function selectGitea(config, origin, provider) {
    const matches = config.providers.gitea.instances.map(instance => ({ instance, key: originKey(instance.origin) }))
        .filter(({ key }) => origin === key || origin.startsWith(`${key}/`))
        .sort((a, b) => b.key.length - a.key.length);
    if (!matches.length) {
        throw new Error(`${provider === undefined ? 'Automatic provider detection' : 'provider=gitea'}: No configured Gitea instance matches repository origin "${origin}". Specify provider="github" for a GitHub target, or configure a matching Gitea origin prefix.`);
    }
    if (matches[1]?.key.length === matches[0].key.length) {
        throw new Error('Multiple Gitea instances match repository origin equally; use unique origin prefixes');
    }
    Object.assign(config.providers.gitea, matches[0].instance);
}
async function resolveProvider(ctx, config, input, exec) {
    if (input.provider !== undefined && !PROVIDERS.includes(input.provider)) {
        throw new Error(`provider must be one of: ${PROVIDERS.join(', ')}`);
    }
    if (input.provider === 'github')
        return 'github';
    if (input.provider === 'gitea' && !config.providers.gitea.instances.length)
        return 'gitea';
    const origin = await readOrigin(ctx, config, exec);
    if (input.provider === undefined && origin.split('/')[0].split(':')[0] === 'github.com')
        return 'github';
    if (input.provider === undefined && !config.providers.gitea.instances.length) {
        throw new Error(`Cannot detect provider from repository origin "${origin}"; specify provider explicitly or configure Gitea origin prefixes`);
    }
    selectGitea(config, origin, input.provider);
    return 'gitea';
}
function buildRequest(args, config) {
    const base = endpoint(config, args.provider);
    const repo = args.repo === undefined ? undefined : `/repos/${pathPart(args.owner, 'owner')}/${pathPart(args.repo, 'repo')}`;
    const pagination = { page: args.page, per_page: args.per_page };
    const pr = `${repo}/pulls/${args.number}`;
    const providerPagination = args.provider === 'gitea' ? { page: args.page, limit: args.per_page } : pagination;
    switch (args.action) {
        case 'pull_request_list':
            return { method: 'GET', url: queryUrl(base, `${repo}/pulls`, {
                    ...providerPagination, state: args.state,
                    ...(args.provider === 'gitea' ? { base_branch: args.base } : { base: args.base }),
                }) };
        case 'pull_request_get':
            return { method: 'GET', url: `${base}${pr}` };
        case 'pull_request_files':
            return { method: 'GET', url: queryUrl(base, `${pr}/files`, providerPagination) };
        case 'pull_request_diff':
            return { method: 'GET', url: `${base}${pr}${args.provider === 'gitea' ? '.diff' : ''}` };
        case 'pull_request_create':
            return { method: 'POST', url: `${base}${repo}/pulls`, body: { title: args.title, head: args.head, base: args.base, body: args.body } };
        case 'pull_request_update':
            return { method: 'PATCH', url: `${base}${pr}`, body: { title: args.title, body: args.body, base: args.base } };
        case 'pull_request_close':
        case 'pull_request_reopen':
            return { method: 'PATCH', url: `${base}${pr}`, body: { state: args.action === 'pull_request_close' ? 'closed' : 'open' } };
        case 'pull_request_comment_list':
            return { method: 'GET', url: queryUrl(base, `${repo}/issues/${args.number}/comments`, providerPagination) };
        case 'pull_request_comment':
            return { method: 'POST', url: `${base}${repo}/issues/${args.number}/comments`, body: { body: args.body } };
        case 'pull_request_merge':
            return { method: args.provider === 'gitea' ? 'POST' : 'PUT', url: `${base}${pr}/merge`, body: args.provider === 'gitea'
                    ? { Do: args.merge_method, head_commit_id: args.head_sha, delete_branch_after_merge: false }
                    : { merge_method: args.merge_method, sha: args.head_sha } };
        case 'workflow_run_list':
            return { method: 'GET', url: queryUrl(base, `${repo}/actions/runs`, {
                    ...providerPagination, branch: args.branch,
                    event: args.event, status: args.status, actor: args.actor, head_sha: args.head_sha,
                }) };
        case 'workflow_run_get':
            return { method: 'GET', url: `${base}${repo}/actions/runs/${args.run_id}` };
        case 'workflow_job_list':
            return { method: 'GET', url: queryUrl(base, `${repo}/actions/runs/${args.run_id}/jobs`, {
                    ...providerPagination, ...(args.provider === 'gitea' ? { status: args.status } : {}),
                }) };
        case 'repository_get':
            return { method: 'GET', url: `${base}${repo}` };
        case 'repository_list': {
            const path = args.organization ? `/orgs/${pathPart(args.organization, 'organization')}/repos` : '/user/repos';
            return { method: 'GET', url: queryUrl(base, path, { ...pagination, sort: args.sort, direction: args.direction }) };
        }
        case 'issue_list':
            return { method: 'GET', url: queryUrl(base, `${repo}/issues`, { ...pagination, state: args.state, sort: args.sort, direction: args.direction, labels: args.labels?.join(',') }) };
        case 'issue_get':
            return { method: 'GET', url: `${base}${issuePath(args)}/${positiveInteger(args.number, 'number')}` };
        case 'issue_create':
            return { method: 'POST', url: `${base}${issuePath(args)}`, body: { title: args.title, body: args.body, labels: args.labels, assignee: args.assignee } };
        case 'issue_comment':
            return { method: 'POST', url: `${base}${issuePath(args)}/${positiveInteger(args.number, 'number')}/comments`, body: { body: args.body } };
        case 'issue_close':
            return { method: 'PATCH', url: `${base}${issuePath(args)}/${positiveInteger(args.number, 'number')}`, body: { state: 'closed' } };
        case 'issue_update':
            return { method: 'PATCH', url: `${base}${issuePath(args)}/${positiveInteger(args.number, 'number')}`, body: {
                    title: args.title,
                    body: args.body,
                    state: args.state,
                    labels: args.labels,
                    assignee: args.assignee,
                } };
        default:
            throw new Error(`Unsupported action: ${args.action}`);
    }
}
function connectionFailure(code, message, status) {
    return { ok: false, error: { code, message, details: status === undefined ? {} : { status } } };
}
/** Test an unsaved Gitea draft. Never include credentials or upstream error bodies in results. */
export async function testConnection(payload, signal) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return connectionFailure('validation', 'Connection draft must be an object');
    }
    const { baseUrl, tokenRef, timeoutMs } = payload;
    if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
        return connectionFailure('validation', 'baseUrl must be a non-empty HTTP(S) URL');
    }
    let url;
    try {
        url = new URL(baseUrl.trim());
    }
    catch {
        return connectionFailure('validation', 'baseUrl must be a valid HTTP(S) URL');
    }
    // Require explicit authority and check raw delimiters: URL normalizes empty userinfo/query/hash away.
    const authority = baseUrl.trim().match(/^https?:\/\/([^/\\?#]*)/i)?.[1];
    if (authority === undefined || authority.includes('@') || /[\\?#]/.test(baseUrl)
        || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        return connectionFailure('validation', 'baseUrl must use HTTP(S) without userinfo, query or hash');
    }
    if (typeof tokenRef !== 'string' || !tokenRef.trim() || /[\r\n]/.test(tokenRef)) {
        return connectionFailure('validation', 'tokenRef must be a non-empty single-line token');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 2147483647) {
        return connectionFailure('validation', 'timeoutMs must be an integer from 1000 to 2147483647');
    }
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/user`;
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = AbortSignal.any([signal, timeout]);
    try {
        combined.throwIfAborted();
        const response = await fetch(url, {
            method: 'GET', redirect: 'manual', signal: combined,
            headers: { Authorization: `token ${tokenRef.trim()}`, Accept: 'application/json' },
        });
        if (response.status >= 300 && response.status < 400) {
            await response.body?.cancel();
            return connectionFailure('redirect', 'Gitea redirected the request; use the final API base URL', response.status);
        }
        if (!response.ok) {
            await response.body?.cancel();
            return response.status === 401 || response.status === 403
                ? connectionFailure('authentication', 'Gitea authentication failed', response.status)
                : connectionFailure('http', 'Gitea returned an HTTP error', response.status);
        }
        let data;
        try {
            data = await response.json();
        }
        catch (error) {
            if (combined.aborted)
                throw error;
            return connectionFailure('response', 'Gitea returned invalid JSON');
        }
        const login = data && typeof data === 'object' ? data.login : undefined;
        if (typeof login !== 'string' || !login.trim()) {
            return connectionFailure('response', 'Gitea response did not include a login');
        }
        return { ok: true, value: { login } };
    }
    catch {
        if (signal.aborted)
            return connectionFailure('cancelled', 'Connection test was cancelled');
        if (timeout.aborted)
            return connectionFailure('timeout', 'Gitea connection test timed out');
        return connectionFailure('network', 'Could not reach Gitea');
    }
}
export function apply(ctx, config) {
    // Cordis binds the contribution to the injected Context and disposes it with the service.
    // Keep tools usable in compositions without a browser Connection service.
    ctx.inject?.(['connection'], connectionCtx => {
        // Exact API routes inherit Connection's trust, authentication and owner-only admission.
        connectionCtx.connection.fetch.register({
            path: '/api/git-connect/connection-test', methods: ['POST'], requestBody: 'buffered',
            async fetch(request) {
                let payload;
                try {
                    payload = await request.json();
                }
                catch {
                    return Response.json(connectionFailure('validation', 'Expected a JSON connection draft'), { status: 400 });
                }
                return Response.json(await testConnection(payload, request.signal));
            },
        });
    });
    ctx.tools.register(defineTool({
        name: 'git_host',
        description: 'Read and manage repositories, Issues and Pull Requests through GitHub or Gitea. Supports repository metadata/listing and Issue management. Both providers support pull_request_list/get/files/diff/create/update/close/reopen/comment_list/comment/merge. PR comments are ordinary conversation comments, not reviews. Merge requires explicit merge_method; optional head_sha guards against changed commits. GitHub supports merge/rebase/squash; Gitea also supports rebase-merge/fast-forward-only. GitHub source branch deletion follows repository settings. Both providers also support workflow_run_list (runs with branch/status/event/actor/SHA filters), workflow_run_get (run details), and workflow_job_list (jobs and steps for a run; GitHub returns the latest execution). Use returned run id, not run_number. Gitea may require repository owner permissions to list runs. Omit provider to detect the platform from the current repository origin. Gitea connections are selected by configured origin prefixes; unmatched or ambiguous origins fail. Authentication uses the chosen provider connection token configured in the plugin; never include tokens in tool arguments.',
        parameters,
        output: {
            schema: outputSchema,
            render: (_args, value) => [{ type: 'text', text: String(JSON.stringify(value, null, 2)) }],
        },
        async execute(input, exec) {
            // Volatile fields stay live between calls; each request uses one coherent snapshot.
            const resolvedConfig = snapshotConfig(config);
            const provider = await resolveProvider(ctx, resolvedConfig, input, exec);
            const args = { ...input, provider };
            const { page, perPage } = validateArgs(args, resolvedConfig);
            const requestConfig = buildRequest({ ...args, page, per_page: perPage }, resolvedConfig);
            if (requestConfig.body) {
                for (const key of Object.keys(requestConfig.body)) {
                    if (requestConfig.body[key] === undefined)
                        delete requestConfig.body[key];
                }
            }
            if (args.action === 'pull_request_comment' || args.action === 'pull_request_comment_list') {
                const prRequest = buildRequest({ ...args, action: 'pull_request_get' }, resolvedConfig);
                await request(resolvedConfig, args.provider, args.action, prRequest.url, { method: 'GET' }, exec.signal);
            }
            const isDiff = args.action === 'pull_request_diff';
            const data = await request(resolvedConfig, args.provider, args.action, requestConfig.url, {
                method: requestConfig.method,
                headers: isDiff && args.provider === 'github' ? { Accept: 'application/vnd.github.diff' } : undefined,
                body: requestConfig.body ? jsonBody(requestConfig.body) : undefined,
            }, exec.signal, isDiff);
            if (args.action === 'pull_request_merge' && args.provider === 'github' && data && typeof data === 'object' && !Array.isArray(data) && data.merged === false) {
                throw new Error(`github pull_request_merge failed: ${String(data.message)}`);
            }
            return { provider: args.provider, action: args.action, data: compactData(args.action, data) };
        },
        presentCall: args => ({
            card: 'generic',
            title: `${args.provider ?? 'auto'} ${args.action}`,
            kind: args.action.startsWith('pull_request_')
                ? (['pull_request_create', 'pull_request_update', 'pull_request_close', 'pull_request_reopen', 'pull_request_comment', 'pull_request_merge'].includes(args.action) ? 'other' : 'read')
                : (args.action.includes('create') || args.action.includes('update') || args.action.includes('comment') || args.action.includes('close') ? 'other' : 'read'),
            rawInput: args,
        }),
    }));
}
