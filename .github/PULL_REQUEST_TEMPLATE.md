## 变更说明

<!-- 做了什么、为什么这么做；关联 issue 用 Fixes #N / Closes #N。 -->

## 变更类型

- [ ] feat（新功能）
- [ ] fix（缺陷修复）
- [ ] docs（文档）
- [ ] refactor（重构，无行为变化）
- [ ] test（测试）
- [ ] chore / ci（工程化）

## 自查清单

- [ ] `pnpm lint` 全绿
- [ ] `pnpm typecheck` 全绿
- [ ] `pnpm test` 全绿（本地 SQLite 测试库自动创建，无需数据库服务）
- [ ] 新增/变更的 API 入参有 Zod schema，且补了测试
- [ ] 覆盖率阈值未被下调（全局 80/80/80/70 是硬约束，只能补测试不能降阈值）
- [ ] 新增 mock 数据/页面遵守 MOCK 标注规范（徽标 + 代码注释；真实调用标 LIVE）
- [ ] 文档已同步（新文档按 `YYYY-MM-DD-主题.md` 放入 `docs/` 对应目录）
- [ ] commit message 遵循 Conventional Commits（`type(scope): 中文摘要`）

## 截图 / 证据

<!-- 涉及 UI 的变更请附截图；涉及行为的变更附测试输出或 curl 证据。 -->
