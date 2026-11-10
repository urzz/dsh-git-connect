# 双平台 PR 验收记录

日期：2026-11-10。对应 intent v2 / spec v2 / plan v1；用户“确认，继续”后的本地实现。批准记录以 state.json decisions 为准，方案正文保留原审核时快照。

## 检查与结果

- `pnpm install --frozen-lockfile` 成功，没有修改依赖声明或 lockfile。
- `pnpm build` 成功，同步 `lib/index.js`；声明输出无变化。
- `pnpm check` 成功：TypeScript 无错误，81 项测试全部通过（原有 15 项，新增 66 项）。包含 Git 源码发布清单检查，不执行安装脚本。
- `git diff --check` 成功。
- Lead 审阅源码、README 和新增测试；独立子代理仅编写 PR 测试，Lead 修正其对注册 schema 结构、呈现 kind、JSON undefined 输入的框架假设后完成验证。

## 验收对应

| 条目 | 证据 | 结果 |
| --- | --- | --- |
| A1 | src/index.ts 与 test/pull-requests.test.js：两平台 11 action、编码、分页/base 映射、schema 与 HTTP 前参数校验 | 通过 |
| A2 | 同文件：创建/更新空描述、关闭/重开、普通评论 GET PR 保护和失败停止 | 通过 |
| A3 | 同文件：Gitea 五种/GitHub 三种方式、SHA、分支保留字段、merged=false、HTTP 403/404/405/409、读写呈现 | 通过 |
| A4 | pnpm build/check：原始 JSON 和 diff（含 JSON 外观及空串）、Accept 隔离、取消、配置快照、原有测试与打包 | 通过 |
| A5 | README.md 的双平台 PR 章节、lib/index.js、docs/plugin-audit.md | 通过 |

## 交付范围与限制

交付分支 gitea-pull-requests 的本地可审阅修改。未提交、推送、发布、安装插件或执行远端写入。全部 HTTP 均为测试模拟；未声称针对真实 GitHub/Gitea 实例端到端验证。Gitea 以 1.25 API 为契约；GitHub 分支自动删除按仓库设置。Review 审批和内联评论不在范围内。
