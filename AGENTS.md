# DSH Git Host 开发约定

## 文档分工

- README.md 面向插件使用者，保留功能、安装、配置、兼容性和使用限制。
- 开发、构建、验证、打包、发布流程，以及给 Agent 的实现约束放在本文件，不写入 README.md。
- 实现审查记录见 [docs/plugin-audit.md](docs/plugin-audit.md)。

## 开发与验证

实现入口为 `src/index.ts` 和 `src/client/index.ts`，使用单次 TypeScript 编译生成一套 `lib/` 产物：

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm check
```

- `pnpm build` 生成 `lib/index.js`、`lib/client/index.js` 和 `lib/types/**/*.d.ts`，随源码变更一起提交。
- `pnpm check` 执行类型检查和测试；也可按需分别运行 `pnpm typecheck`、`pnpm test`。
- 测试直接导入 `lib/` 入口，源码修改后先构建再测试。
- 打包测试只复制 Git 已跟踪及未忽略的候选文件，在临时目录通过 `npm pack --dry-run --ignore-scripts` 检查发布清单，不安装依赖、不执行生命周期脚本，避免本地忽略的构建产物掩盖缺失文件。

## 打包与发布

包名为 `dsh-git-connect`，支持 npm registry、Git 和 tarball 分发。

- `publishConfig` 指定 `https://registry.npmjs.org/` 和 public access。
- `prepack` 执行 `pnpm build && pnpm check`，构建或检查失败会阻止打包和发布。
- 发布包包含预构建 JavaScript、声明、bundle patch、locale 和图标；安装者不需要 TypeScript 或安装期构建。
- 发布文件白名单保持聚焦运行所需文件，不将本文件加入发布清单。

预演发布：

```bash
npm publish --dry-run
```

该命令构建、检查并展示包内容，不上传，也不验证 npm 账号权限或版本是否可用。

正式发布优先通过 GitHub Actions：

- 工作流：`.github/workflows/npm-publish.yml`，由 GitHub Release 的 `published` 事件触发。
- npm 包的 Trusted Publisher 必须绑定 GitHub owner `urzz`、repository `dsh-git-connect`、workflow filename `npm-publish.yml`；不设置 environment，也不需要 NPM_TOKEN。
- 工作流使用 Node 24、npm 11 和 OIDC 发布；安装依赖后检查 Release tag 与包版本一致，`npm publish` 通过 prepack 构建和检查。
- 先将 `package.json` 中的版本设为尚未发布的版本，提交并普通推送到 main，再发布对应的 `v<version>` GitHub Release。例如当前版本：

```bash
gh release create v0.0.12 --repo urzz/dsh-git-connect --target main --title v0.0.12 --notes-file <release-notes-file>
```

检查 Action 结果后再报告 npm 发布成功；若 npm Trusted Publisher 未绑定或认证失败，应明确报告并修正 npm 侧配置，不自动改用其他凭据。

需要手动发布时，使用有包发布权限的 npm 账号执行 `npm login --registry=https://registry.npmjs.org/`，再执行 `npm publish`。`pnpm publish` 使用相同生命周期。只需生成本地 tarball 时运行：

```bash
pnpm pack
```

GitHub 直接安装 `github:urzz/dsh-git-connect` 使用根 manifest 和已提交的构建产物，不依赖安装期生命周期脚本。保持这一方式，不增加 `prepare`，不引入根 JavaScript 别名或独立 `.release/` 包。源码不携带构建产物的 Git 分发才需要自包含 `prepare` 和用户构建授权，参见[官方发布指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)。

## 兼容性与包契约

- `@deepseek-ai/dsh-tools` 同时作为 runtime peer 和显式开发依赖，范围保持 `^0.2.0-rc.2`；`pnpm-lock.yaml` 锁定开发安装版本。不要随宿主升级将兼容范围改成其精确版本；插件使用更新 API 或 DSH 有破坏性变更时再重新评估范围。
- 本项目是独立 bundle，无需迁入 Harness monorepo。`main`、条件 `exports` 和 `files` 必须与实际产物保持一致。
- `dsh.bundle.patch` 指向 `cordis.patch.yml`；客户端扫描使用 `exports["./client"]` 和 `dsh.client`；图标通过 `icon` 暴露。
- `defineTool` 通过 `InferArgs` 从参数 schema 推导 execute 参数类型；`output.schema` 描述 execute 的结构化 JSON，render 只负责可读呈现。
- HTTP 请求遵守 `exec.signal`；凭据属于插件配置，不作为工具参数。
- schema DSL 无法表达的 provider 和分页约束，在 execute 发出请求前检查。
- 配置默认值只在 schema 定义。运行时直接消费 schema 的 volatile 值，每次调用开始读取最新配置，同一次请求保持配置快照，HTTP 超时合并会话取消信号。
- 浏览器侧通过 `window.__ModuleLoader__` 注册 lazy module，使用 configForms 的快照、订阅、revision 和 mutate；写入携带表单 revision，防止并发覆盖。
- `tokenRef` 当前表示直接 Token 值；若部署使用凭据引用服务，应使用宿主设施，并按 settings-card 指南标记凭据字段。

## 官方参考

扩展插件前，先参考对应的官方工具与设置指南，再引入新事件、slot 或客户端协议。权威入口为 [DSH reference index](https://deepseek-harness.github.io/deepseek-harness/reference/)。

- [Adding a workspace package](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-package)：包结构、exports、构建产物、元数据与验证；独立插件不直接套用 monorepo 的目录要求。
- [Writing a tool](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-tool)：defineTool、参数与输出 schema、取消、呈现及测试。
- [Adding a settings card](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-settings-card)：volatile 配置、revision 与浏览器设置模块。
- [Extension cookbook](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/extension-cookbook)：扩展点及机制选择。
- [Client modules](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/client-modules)：浏览器模块加载契约。
- 官方示例：[dsh-tool-bash](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/shell/tool-bash)、[dsh-client-ui-settings-plugins](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-settings-plugins)。
