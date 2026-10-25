# HANDOFF.MD — 踩坑与交接记录

> 执行新任务前先看本文件，避免重复踩坑。按用户全局规约维护；历史工程坑见 `gotchas.md`。

## 2026-10-25 · UI 第一方文案债（存储迁移后遗症）

**坑**：2026-10-05 存储 PostgreSQL → SQLite 迁移后，代码与文档口径已同步，但 **UI 用户可见文案里残留 20 处 PostgreSQL 表述**（侧边栏数据源标注、5 个页面的加载失败提示、架构页叙事）。最危险的是排查指引类文案——错误提示让用户「确认本地 PostgreSQL 已启动」「docker compose up -d postgres」，而 compose 文件已删除、SQLite 零守护进程，**照着做必然失败**。另有路线图页「334 个测试」过期计数。

**修复**：commit 94b67c2。现状声明一律改 SQLite；历史里程碑保留 PostgreSQL 事实并补「（2026-10-05 迁 SQLite）」；排查指引改为「确认已完成迁移与种子初始化（SQLite 单文件，无需启动任何服务）」。

**How to apply（防复发）**：任何基础设施迁移（存储/依赖/域名）后，除了代码与 README，必须 grep **用户可见文案**（app/ 页面字符串、错误提示、MockTag note）而不只是注释与文档。检查命令：

```bash
grep -rn -i '<旧技术名>' apps/web/app apps/web/components --include='*.tsx' | grep -v __tests__
```

## 2026-10-20 · turbo 不透传 vitest 参数

`pnpm test -- --coverage` 会把 `--coverage` 当 turbo 自身参数报错。覆盖率入口必须用根级 `pnpm test:coverage`（内部走 `--filter web`）。已在 package.json / CONTRIBUTING / CI 固化。
