import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
export const inject = ['tools', 'credentials'];

export const Config = z.object({
  providers: z.object({
    github: z.object({
      baseUrl: z.string().default('https://api.github.com').volatile(),
      tokenRef: z.string().default('GITHUB_TOKEN').volatile(),
    }).default({}),
    gitea: z.object({
      baseUrl: z.string().default('https://gitea.com/api/v1').volatile(),
      tokenRef: z.string().default('GITEA_TOKEN').volatile(),
    }).default({}),
  }).default({}),
  requestTimeoutMs: z.natural().min(1000).default(30000).volatile(),
  maxPageSize: z.natural().min(1).max(100).default(50).volatile(),
});

const DEFAULT_CONFIG = Config({});

function liveValue(value, fallback) {
  const resolved = typeof value?.get === 'function' ? value.get() : value;
  return resolved === undefined ? fallback : resolved;
}

function snapshotConfig(input) {
  const config = typeof input?.requestTimeoutMs?.get === 'function'
    || typeof input?.providers?.github?.baseUrl?.get === 'function'
    ? input
    : Config(input);
  return {
    providers: {
      github: {
        baseUrl: liveValue(config.providers?.github?.baseUrl, 'https://api.github.com'),
        tokenRef: liveValue(config.providers?.github?.tokenRef, 'GITHUB_TOKEN'),
      },
      gitea: {
        baseUrl: liveValue(config.providers?.gitea?.baseUrl, 'https://gitea.com/api/v1'),
        tokenRef: liveValue(config.providers?.gitea?.tokenRef, 'GITEA_TOKEN'),
      },
    },
    requestTimeoutMs: liveValue(config.requestTimeoutMs, 30000),
    maxPageSize: liveValue(config.maxPageSize, 50),
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

function text(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
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
  } catch {
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
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
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
  if (Array.isArray(issue)) return issue.map(compactIssue);
  if (!issue || typeof issue !== 'object') return issue;
  return {
    number: nullable(issue.number),
    title: nullable(issue.title),
    body: nullable(issue.body),
    state: nullable(issue.state),
    locked: nullable(issue.locked),
    url: nullable(issue.html_url ?? issue.url),
    apiUrl: nullable(issue.url),
    user: issue.user?.login ?? issue.user?.username ?? null,
    assignee: issue.assignee?.login ?? issue.assignee?.username ?? null,
    labels: Array.isArray(issue.labels) ? issue.labels.map(label => typeof label === 'string' ? label : label?.name).filter(Boolean) : [],
    comments: nullable(issue.comments),
    createdAt: nullable(issue.created_at),
    updatedAt: nullable(issue.updated_at),
  };
}

function compactRepositoryItem(item) {
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
    owner: item.owner?.login ?? item.owner?.username ?? null,
    permissions: nullable(item.permissions),
    createdAt: nullable(item.created_at ?? item.createdAt),
    updatedAt: nullable(item.updated_at ?? item.updatedAt),
  };
}

function compactRepository(repository) {
  if (Array.isArray(repository)) return repository.map(compactRepositoryItem);
  if (!repository || typeof repository !== 'object') return repository;
  return compactRepositoryItem(repository);
}

function compactData(action, data) {
  if (action.startsWith('repository_')) return compactRepository(data);
  if (action.startsWith('issue_')) return compactIssue(data);
  return data;
}

function parseBody(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function resolveToken(ctx, tokenRef) {
  const reference = text(tokenRef, 'tokenRef');
  try {
    const resolved = await ctx.credentials.resolve(reference);
    if (resolved?.value) return resolved.value;
  } catch {
    // A configured token can be supplied directly for backwards compatibility.
  }
  return reference;
}

async function request(ctx, config, provider, action, url, init, signal) {
  const providerConfig = config.providers[provider];
  const token = await resolveToken(ctx, providerConfig.tokenRef);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', provider === 'github' ? `Bearer ${token}` : `token ${token}`);
  headers.set('Accept', provider === 'github' ? 'application/vnd.github+json' : 'application/json');
  headers.set('User-Agent', 'dsh-git-plugin/0.1.0');
  if (init?.body !== undefined) headers.set('Content-Type', 'application/json');
  const timeout = AbortSignal.timeout(config.requestTimeoutMs);
  const combined = AbortSignal.any([signal, timeout]);
  const response = await fetch(url, { ...init, headers, signal: combined });
  const raw = await response.text();
  const data = parseBody(raw);
  if (!response.ok) {
    const detail = typeof data === 'string' ? data : data?.message ?? data?.error ?? JSON.stringify(data);
    throw new Error(`${provider} ${action} failed with HTTP ${response.status}: ${String(detail).slice(0, 1000)}`);
  }
  return data;
}

function validateArgs(args, config) {
  if (!PROVIDERS.includes(args.provider)) throw new Error(`provider must be one of: ${PROVIDERS.join(', ')}`);
  if (!ACTIONS.includes(args.action)) throw new Error(`action must be one of: ${ACTIONS.join(', ')}`);
  const page = args.page === undefined ? 1 : positiveInteger(args.page, 'page');
  const perPage = args.per_page === undefined ? config.maxPageSize : positiveInteger(args.per_page, 'per_page');
  if (perPage > config.maxPageSize) throw new Error(`per_page must be <= ${config.maxPageSize}`);
  if (args.action !== 'repository_list') {
    text(args.owner, 'owner');
    text(args.repo, 'repo');
  }
  if (args.action.startsWith('issue_') && args.action !== 'issue_create' && args.action !== 'issue_list') {
    positiveInteger(args.number, 'number');
  }
  if (args.action === 'issue_create') text(args.title, 'title');
  if (args.action === 'issue_comment') text(args.body, 'body');
  if (args.action === 'issue_update') {
    if (args.state === 'all') throw new Error('issue_update state must be open or closed');
    if (args.title === undefined && args.body === undefined && args.state === undefined && args.labels === undefined && args.assignee === undefined) {
      throw new Error('issue_update requires at least one of title, body, state, labels, or assignee');
    }
  }
  return { page, perPage };
}

function jsonBody(value) {
  return JSON.stringify(value);
}

function buildRequest(args, config) {
  const base = endpoint(config, args.provider);
  const repo = args.repo === undefined ? undefined : `/repos/${pathPart(args.owner, 'owner')}/${pathPart(args.repo, 'repo')}`;
  const pagination = { page: args.page, per_page: args.per_page };
  switch (args.action) {
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

export function apply(ctx, config = DEFAULT_CONFIG) {
  config = snapshotConfig(config);
  ctx.tools.register(defineTool({
    name: 'git_host',
    description: 'Read and manage repositories and Issues through GitHub or Gitea. Supports repository metadata/listing, issue listing/details, creating issues, commenting, updating, and closing issues. Credentials come from configured credential references; never include tokens in arguments.',
    parameters: {
      action: { type: 'string', required: true, enum: ACTIONS, description: 'Operation to perform.' },
      provider: { type: 'string', required: true, enum: PROVIDERS, description: 'Git hosting provider.' },
      owner: { type: 'string', description: 'Repository owner or organization. Required except for repository_list.' },
      repo: { type: 'string', description: 'Repository name. Required except for repository_list.' },
      organization: { type: 'string', description: 'Organization to list repositories from; omit to list repositories visible to the authenticated user.' },
      number: { type: 'integer', description: 'Issue number for issue_get, issue_comment, issue_update, and issue_close.' },
      title: { type: 'string', description: 'Issue title, required for issue_create.' },
      body: { type: 'string', description: 'Issue or comment body.' },
      labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels.' },
      assignee: { type: 'string', description: 'Login of an assignee.' },
      state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state filter; for issue_update only open or closed is accepted by the provider.' },
      sort: { type: 'string', enum: ['created', 'updated'], description: 'Sort order for list operations.' },
      direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction for list operations.' },
      page: { type: 'integer', description: '1-based page number.' },
      per_page: { type: 'integer', description: 'Items per page, capped by plugin configuration.' },
    },
    output: {
      schema: outputSchema,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    timeoutMs: config.requestTimeoutMs,
    async execute(args, exec) {
      const { page, perPage } = validateArgs(args, config);
      const requestConfig = buildRequest({ ...args, page, per_page: perPage }, config);
      if (requestConfig.body) {
        for (const key of Object.keys(requestConfig.body)) {
          if (requestConfig.body[key] === undefined) delete requestConfig.body[key];
        }
      }
      const data = await request(ctx, config, args.provider, args.action, requestConfig.url, {
        method: requestConfig.method,
        body: requestConfig.body ? jsonBody(requestConfig.body) : undefined,
      }, exec.signal);
      return { provider: args.provider, action: args.action, data: compactData(args.action, data) };
    },
    presentCall: args => ({ card: 'generic', title: `${args.provider} ${args.action}`, kind: args.action.includes('create') || args.action.includes('update') || args.action.includes('comment') || args.action.includes('close') ? 'other' : 'read', rawInput: args }),
  }));
}
