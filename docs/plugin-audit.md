# DSH 插件实现审查

本次按独立 bundle 的契约审查发布结构、服务端配置、客户端发现与配置页，以及实际打包入口。官方 Harness workspace 的内部构建约定不直接作为独立插件的强制要求。

## 依据

- [插件基础](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md)：入口与插件注册。
- [插件配置](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.zh.md)：Config schema、默认值及配置更新。
- [打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)：bundle/patch、版本兼容、peer/dev 依赖及 Git 分发。
- [Cordis volatile configuration](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/README.md)：本机已安装 Cordis 的 README 也明确说明，Loader 将 volatile-only 更新提交给运行中的引用，不重启插件；消费者通过 `.get()` 读取。
- [添加包 cookbook](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-package)：workspace 目录、exports 和图标约定。
- [客户端模块](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/client-modules)及[模块加载 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/README.zh.md)：客户端发现、manifest 与 lazy factory。
- [包 manifest](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/util/package-manifest/README.zh.md)：入口及图标发现。其兼容性旧说明与发布教程存在差异，兼容范围判断采用发布教程。

## 已修复

| 问题 | 修复 |
| --- | --- |
| `apply()` 将 volatile 配置固定为启动快照，保存后仍使用旧 Token | 每次工具调用开始读取 `.get()`，同一次请求保持一致的配置快照 |
| 工具注册时固定 timeout，无法随配置变化 | 移除静态工具 deadline；HTTP 使用当次 `requestTimeoutMs`，继续合并会话取消信号 |
| 图标只有 `./icon.svg` export，没有官方发现字段 | manifest 添加 `icon` |
| 声明公开 `./src/*`，但发布文件不含源码 | 移除无效 export |
| DSH tools 只有 peer，开发依赖依赖 pnpm 自动补齐 | 显式同时声明 devDependency，保持已有版本范围 |
| 根 JS、lib、.release 多套产物和未使用 probe 增加同步负担 | 只保留源码和一套 lib 发布入口，删除空 probe 与重复分发目录 |
| 测试使用根 JS 副本，未直接覆盖发布入口 | 改用 lib；保留干净 Git 文件集合下的打包检查 |
| 普通配置与 volatile 配置双分支、重复默认值 | 只接受 schema 校验后的配置，直接 `.get()`，类型从 schema 推导 |
| 两次编译及客户端输出复制脚本 | 单次 tsc 同时生成运行文件和声明，客户端直接使用 lib/client/index.js |

此前 `.release` 的 patch/locale/icon 与根资源内容一致，但构建脚本不会同步它们，存在后续资源变化无法带入的缺陷。删除重复分发路径同时消除了这个同步问题。官方并未要求根 JS 和 `.release` 兼容副本，旧 README 的相关说明已更正。

## 保留的合法选择

- 独立 bundle 可以使用根入口或 lib 入口，本项目采用 src + lib。无需迁入 Harness monorepo，也无需仅为目录规范更换构建工具。
- `dsh.bundle.patch`、`exports["./client"]`、`dsh.client` 及客户端 ModuleLoader lazy factory 已存在。客户端配置页使用 configForms 的快照、订阅、revision 和 mutate；样式带 effect 清理。
- 保留提交 lib 产物的 Git 安装方式，不增加安装期 prepare 或构建授权。源码不带产物的 Git 分发才需要另一套构建安排。
- 保留 DSH peer 兼容范围；发布教程允许它作为 engines.dsh 的回退，无需重复声明。
- 支持 npm registry、Git 和 tarball 分发：已移除 private:true，publishConfig 指向公开 npm registry；prepack 在打包和发布前执行构建与检查，保留预构建产物和无安装期 prepare 的方式。

## GitHub / Gitea Pull Requests（2026-11-10）

`git_host` 新增同组 11 个 `pull_request_*` 操作，覆盖列表、详情、文件、diff、创建、修改、关闭、重开、普通评论查询/写入与合并。实现保留 provider JSON，diff 按原始文本返回。Gitea 使用 `limit` / `base_branch`，GitHub 使用 `per_page` / `base`；没有自动分页。

两平台普通评论先查询 PR，避免编号落到普通 Issue；两次 HTTP 共享调用开始时的配置快照及会话取消信号。合并必须显式指定方法；可选 head_sha 分别映射至 Gitea `head_commit_id` 与 GitHub `sha`。GitHub 不支持的方式在 HTTP 前失败，HTTP 200 的 `merged=false` 仍报错。Gitea 显式设置 `delete_branch_after_merge=false`，GitHub 按仓库自动删除设置执行。没有暴露强制合并、Review 或内联评论。

验证直接导入发布入口 `lib/index.js`：`pnpm build`、`pnpm check` 通过，共 81 项测试（新增 66 项 PR 测试），覆盖路由、请求体、原始输出、合并差异、预检查、HTTP 错误、取消、双请求配置快照及读写呈现；现有配置、客户端、Actions 与 Git 源码打包测试同时通过。`git diff --check` 通过。PR 测试使用模拟 HTTP；没有真实远端写入或安装运行环境验证。

契约依据：[Gitea 1.25 PR](https://github.com/go-gitea/gitea/blob/release/v1.25/routers/api/v1/repo/pull.go)、[合并表单](https://github.com/go-gitea/gitea/blob/release/v1.25/services/forms/repo_form.go)、[GitHub PR REST API](https://docs.github.com/en/rest/pulls/pulls)。具体设计及验收见 [双平台 PR change](../.dev-docs/changes/20261110-gitea-pull-requests/spec.md)。

## 原有配置与发布结构验证边界

构建、类型检查和 15 项测试通过。新增配置测试分别覆盖 GitHub/Gitea：注册时空 Token、保存后首次调用、再次更换 Token/地址/超时/分页、清空 Token，以及只注册一次工具。现有配置页测试覆盖保存、revision、外部快照刷新与失败保留草稿；工作流测试覆盖路由、参数、权限错误与取消；打包测试检查入口、图标和声明文件均随 Git 源码分发。

测试模拟 volatile 引用与 HTTP，没有安装插件、修改 profile 或执行 GUI 端到端升级验证。当前运行环境仍使用原已安装版本；新代码需由用户更新插件后加载。
