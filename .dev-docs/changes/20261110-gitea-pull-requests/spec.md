# Gitea 与 GitHub Pull Request 操作方案

基于 [intent](intent.md)：Gitea 首批范围已确认；用户追问 GitHub 后补充本双平台方案，新增范围与具体方案待审核。

## 接口与职责

扩展现有 git_host 的 action 枚举、参数、校验和请求路由，两平台共用同一组 pull_request_* 操作。继续使用 provider、owner/repo，number 为仓库内 PR 编号，不是数据库 id。

下表路径省略 /repos/{owner}/{repo}，未注明差异时两平台相同。

| Action | API | 参数与行为 |
| --- | --- | --- |
| pull_request_list | GET /pulls | state=open/closed/all；可选 base 过滤目标分支；分页见下文 |
| pull_request_get | GET /pulls/{number} | PR 完整 JSON |
| pull_request_files | GET /pulls/{number}/files | 分页，保留完整文件条目 |
| pull_request_diff | Gitea GET /pulls/{number}.diff；GitHub GET /pulls/{number} + Accept: application/vnd.github.diff | data 为原始 diff 文本，不尝试 JSON 解析 |
| pull_request_create | POST /pulls | title、head、base 必填；body 可选；head 支持 username:branch 跨 fork 形式，受各平台规则限制 |
| pull_request_update | PATCH /pulls/{number} | title/body/base 至少一个；body 可为空字符串以清空描述 |
| pull_request_close | PATCH /pulls/{number} | 固定 state=closed |
| pull_request_reopen | PATCH /pulls/{number} | 固定 state=open |
| pull_request_comment_list | GET /issues/{number}/comments | 普通会话评论，分页 |
| pull_request_comment | POST /issues/{number}/comments | body 必填且非空 |
| pull_request_merge | Gitea POST /pulls/{number}/merge；GitHub PUT 同路径 | merge_method 必填；可选 head_sha |

列表、文件、评论列表共用 page/per_page 参数；Gitea 映射 page/limit，GitHub 映射 page/per_page。列表 base 对 Gitea 映射 base_branch，对 GitHub 直接映射 base。不复用现有 sort/direction，避免混淆两平台的排序枚举。

两平台评论操作均先 GET /pulls/{number}，确认编号对应 PR，再调用共享 Issue 评论接口；复用同一次调用的配置快照及取消信号。此检查用于保证 PR 操作不会落到普通 Issue 上。

## 合并差异

| 行为 | Gitea | GitHub |
| --- | --- | --- |
| 方法 | POST | PUT |
| merge_method 值 | merge、rebase、rebase-merge、squash、fast-forward-only | merge、rebase、squash |
| 请求字段 | Do | merge_method |
| head_sha 映射 | head_commit_id | sha |
| 响应 | 原样保留；无响应体返回 null | 原样保留 sha、merged、message |

GitHub 不支持的合并方式在 HTTP 前失败。两平台均无默认合并方式。head_sha 提供时由服务器原子校验；省略则按平台语义合并请求时的 head。GitHub HTTP 200 返回 merged=false 时必须明确报合并失败并保留 message，不能因 HTTP 成功而声称已合并。

不暴露强制合并、手工标记合并或自动合并队列，不主动调用删除分支接口。Gitea 请求设置 delete_branch_after_merge=false；GitHub REST 合并接口没有对应选项，源分支是否自动删除由仓库设置控制，插件不能承诺保留。

## 架构与兼容性

- 仅扩展现有工具，不引入依赖、独立服务、配置项或客户端协议。新增 base/head/merge_method schema 字段；现有 head_sha 除用于 Actions 过滤外，也用于 PR 合并预期 SHA。
- PR、评论和文件保留 provider 原始 JSON，避免 Issue 精简逻辑丢失 head/base SHA、mergeable、merged 等信息。输出仍为 provider/action/data；diff 为原始字符串，空响应为 null。不统一改写两平台返回字段，文档说明差异。
- 复用鉴权、路径编码、单次调用配置快照、HTTP 错误和取消机制。diff 的 Accept 覆盖只用于 GitHub diff 请求，其余请求保留原 JSON Accept。没有自动重试、自动分页或吞错，403/404/409/405 等保持显式错误；仓库保护规则由平台判断。
- 明确列举 PR 写操作（create/update/close/reopen/comment/merge），其他 PR 操作为 read，避免 comment_list 被现有字符串匹配误判。
- 现有仓库、Issue、Gitea Actions 能力保持兼容；Review 审批、行级评论、审阅者管理不在本次范围。

## 验收

- A1（required）：工具 schema 包含上述 11 个 action 与参数；两平台路由、方法、路径编码及分页正确；缺失/非法必要参数在 HTTP 前失败。
- A2（required）：两平台创建/修改/关闭/重开/评论请求体正确；空 body 更新保留；评论验证 PR 后访问共享端点，验证失败不发评论。
- A3（required）：两平台合并方式与预期 SHA 字段映射正确；GitHub 拒绝不支持的方法且 merged=false 不作成功；过期 SHA/权限错误保持可见；分支删除行为符合上述平台差异；merge/reopen 为写操作，评论列表只读。
- A4（required）：完整 PR/文件/评论 JSON 和原始 diff 得以保留；GitHub diff 媒体类型不影响其他请求；取消及错误受测试覆盖；既有测试、类型检查、构建与打包检查通过，测试导入 lib。
- A5（required）：README 给出两平台参数、示例、权限和限制，lib 同步。验收环境为本地构建和模拟 HTTP 的自动化测试；不声称真实远端端到端验证，不执行真实远端写入。

## 依据

- [Gitea 1.25 PR 处理器](https://github.com/go-gitea/gitea/blob/release/v1.25/routers/api/v1/repo/pull.go)
- [Gitea PR 创建/修改结构](https://github.com/go-gitea/gitea/blob/release/v1.25/modules/structs/pull.go)
- [Gitea MergePullRequestOption](https://github.com/go-gitea/gitea/blob/release/v1.25/services/forms/repo_form.go)
- [GitHub PR REST API](https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28)
- [DSH 工具编写指南](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-tool)

状态：双平台方案待用户确认范围、审核并授权实施，尚未开始业务实现。
