# 执行计划

projectRoot/cwd: /home/fooksky/projects/fooksky/dsh-plugins/dsh-git-plugin/.agents/worktrees/gitea-pull-requests
分支: gitea-pull-requests；change: 20261110-gitea-pull-requests。
基于 intent v2 / spec v2，用户已确认并授权实施。

- P1（direct，A1–A4）：Lead 修改 src/index.ts，实现 schema、验证、双平台路由、diff、评论及合并行为。
- P2（direct，A1–A4）：委派独立测试编写，仅写 test/pull-requests.test.js。Lead 集成审查并执行测试，测试不依赖 P1 完成即可编写，运行依赖 P1。
- P3（direct，A5）：Lead 更新 README 与知识入口，构建 lib，运行 pnpm build && pnpm check；检查最终差异，保存验证摘要并登记交付。

范围互不重叠。业务代码及主状态由 Lead 独占；构建统一由 Lead 执行。交付边界为当前 worktree 的可审阅修改，不创建提交、远端 PR、不合入、不发布或安装。验证为模拟 HTTP 的发布入口测试和完整既有检查，不调用真实平台写接口。
