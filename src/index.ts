import { defineTool, type InferArgs } from '@deepseek-ai/dsh-tools';
import z from '@deepseek-ai/schemastery';

export const inject = ['tools'] as const;

export const Config = z.object({
  providers: z.object({
    github: z.object({
      baseUrl: z.string().default('https://api.github.com').volatile(),
      tokenRef: z.string().default('').volatile(),
    }).default({}),
    gitea: z.object({
      baseUrl: z.string().default('https://gitea.com/api/v1').volatile(),
      tokenRef: z.string().default('').volatile(),
    }).default({}),
  }).default({}),
  requestTimeoutMs: z.natural().min(1000).default(30000).volatile(),
  maxPageSize: z.natural().min(1).max(100).default(50).volatile(),
});

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = Record<string, unknown>;

interface VolatileValue<T> {
  get(): T | undefined;
}

type ConfigValue<T> = T | VolatileValue<T> | undefined;

interface ConfigInput {
  providers?: {
    github?: { baseUrl?: ConfigValue<string>; tokenRef?: ConfigValue<string> };
    gitea?: { baseUrl?: ConfigValue<string>; tokenRef?: ConfigValue<string> };
  };
  requestTimeoutMs?: ConfigValue<number>;
  maxPageSize?: ConfigValue<number>;
}

interface ProviderConfig {
  baseUrl: string;
  tokenRef: string;
}

interface ResolvedConfig {
  providers: {
    github: ProviderConfig;
    gitea: ProviderConfig;
  };
  requestTimeoutMs: number;
  maxPageSize: number;
}

const DEFAULT_CONFIG: ConfigInput = {};

function liveValue<T>(value: ConfigValue<T>, fallback: T): T {
  const resolved: T | undefined = value && typeof value === 'object' && 'get' in value && typeof value.get === 'function'
    ? value.get()
    : value as T | undefined;
  return resolved === undefined ? fallback : resolved;
}

function snapshotConfig(input: ConfigInput | ResolvedConfig): ResolvedConfig {
  return {
    providers: {
      github: {
        baseUrl: liveValue(input.providers?.github?.baseUrl, 'https://api.github.com'),
        tokenRef: liveValue(input.providers?.github?.tokenRef, ''),
      },
      gitea: {
        baseUrl: liveValue(input.providers?.gitea?.baseUrl, 'https://gitea.com/api/v1'),
        tokenRef: liveValue(input.providers?.gitea?.tokenRef, ''),
      },
    },
    requestTimeoutMs: liveValue(input.requestTimeoutMs, 30000),
    maxPageSize: liveValue(input.maxPageSize, 50),
  };
}

const PROVIDERS = ['github', 'gitea'] as const;
type Provider = typeof PROVIDERS[number];

const ACTIONS = [
  'repository_get',
  'repository_list',
  'issue_list',
  'issue_get',
  'issue_create',
  'issue_comment',
  'issue_update',
  'issue_close',
] as const;
type Action = typeof ACTIONS[number];

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    provider: { type: 'string', required: true },
    action: { type: 'string', required: true },
    data: { type: 'json', required: true },
  },
} as const;

const parameters = {
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
} as const;

type GitToolArgs = InferArgs<typeof parameters>;

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(`${name} must be a positive integer`);
  return value as number;
}

function pathPart(value: unknown, name: string): string {
  return encodeURIComponent(text(value, name));
}

function endpoint(config: ResolvedConfig, provider: Provider): string {
  const raw = config.providers[provider].baseUrl.trim().replace(/\/+$/, '');
  let url: URL;
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

function queryUrl(base: string, path: string, values: Record<string, unknown> = {}): URL {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

function issuePath(args: GitToolArgs): string {
  return `/repos/${pathPart(args.owner, 'owner')}/${pathPart(args.repo, 'repo')}/issues`;
}

function nullable(value: unknown): JsonValue {
  return value === undefined ? null : value as JsonValue;
}

function compactIssue(issue: unknown): JsonValue {
  if (Array.isArray(issue)) return issue.map(compactIssue);
  if (!issue || typeof issue !== 'object') return issue as JsonValue;
  const value = issue as JsonObject;
  const user = value.user as JsonObject | undefined;
  const assignee = value.assignee as JsonObject | undefined;
  const labels: string[] = Array.isArray(value.labels)
    ? value.labels.map(label => {
      if (typeof label === 'string') return label;
      const name = (label as JsonObject | undefined)?.name;
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

function compactRepositoryItem(item: JsonObject): JsonValue {
  const owner = item.owner as JsonObject | undefined;
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

function compactRepository(repository: unknown): JsonValue {
  if (Array.isArray(repository)) return repository.map(item => compactRepositoryItem(item as JsonObject));
  if (!repository || typeof repository !== 'object') return repository as JsonValue;
  return compactRepositoryItem(repository as JsonObject);
}

function compactData(action: Action, data: JsonValue): JsonValue {
  if (action.startsWith('repository_')) return compactRepository(data);
  if (action.startsWith('issue_')) return compactIssue(data);
  return data;
}

function parseBody(raw: string): JsonValue {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return raw;
  }
}

function resolveToken(token: string): string {
  return text(token, 'tokenRef');
}

async function request(
  config: ResolvedConfig,
  provider: Provider,
  action: Action,
  url: string | URL,
  init: RequestInit,
  signal: AbortSignal,
): Promise<JsonValue> {
  const providerConfig = config.providers[provider];
  const token = resolveToken(providerConfig.tokenRef);
  const headers = new Headers(init.headers);
  headers.set('Authorization', provider === 'github' ? `Bearer ${token}` : `token ${token}`);
  headers.set('Accept', provider === 'github' ? 'application/vnd.github+json' : 'application/json');
  headers.set('User-Agent', 'dsh-git-connect/0.1.0');
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  const timeout = AbortSignal.timeout(config.requestTimeoutMs);
  const combined = AbortSignal.any([signal, timeout]);
  const response = await fetch(url, { ...init, headers, signal: combined });
  const raw = await response.text();
  const data = parseBody(raw);
  if (!response.ok) {
    const object = data && typeof data === 'object' && !Array.isArray(data) ? data as JsonObject : undefined;
    const detail = typeof data === 'string' ? data : object?.message ?? object?.error ?? JSON.stringify(data);
    throw new Error(`${provider} ${action} failed with HTTP ${response.status}: ${String(detail).slice(0, 1000)}`);
  }
  return data;
}

function validateArgs(args: GitToolArgs, config: ResolvedConfig): { page: number; perPage: number } {
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

function jsonBody(value: JsonObject): string {
  return JSON.stringify(value);
}

interface RequestConfig {
  method: string;
  url: string | URL;
  body?: JsonObject;
}

interface PluginContext {
  tools: {
    register(tool: unknown): void;
  };
}

function buildRequest(args: GitToolArgs, config: ResolvedConfig): RequestConfig {
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

export function apply(ctx: PluginContext, config: ConfigInput | ResolvedConfig = DEFAULT_CONFIG): void {
  const resolvedConfig = snapshotConfig(config);
  ctx.tools.register(defineTool({
    name: 'git_host',
    description: 'Read and manage repositories and Issues through GitHub or Gitea. Supports repository metadata/listing, issue listing/details, creating issues, commenting, updating, and closing issues. Authentication uses the provider token configured in the plugin; never include tokens in tool arguments.',
    parameters,
    output: {
      schema: outputSchema,
      render: (_args, value) => [{ type: 'text', text: String(JSON.stringify(value, null, 2)) }],
    },
    timeoutMs: resolvedConfig.requestTimeoutMs,
    async execute(args, exec) {
      const { page, perPage } = validateArgs(args, resolvedConfig);
      const requestConfig = buildRequest({ ...args, page, per_page: perPage }, resolvedConfig);
      if (requestConfig.body) {
        for (const key of Object.keys(requestConfig.body)) {
          if (requestConfig.body[key] === undefined) delete requestConfig.body[key];
        }
      }
      const data = await request(resolvedConfig, args.provider, args.action, requestConfig.url, {
        method: requestConfig.method,
        body: requestConfig.body ? jsonBody(requestConfig.body) : undefined,
      }, exec.signal);
      return { provider: args.provider, action: args.action, data: compactData(args.action, data) };
    },
    presentCall: args => ({
      card: 'generic',
      title: `${args.provider} ${args.action}`,
      kind: args.action.includes('create') || args.action.includes('update') || args.action.includes('comment') || args.action.includes('close') ? 'other' : 'read',
      rawInput: args,
    }),
  }));
}
