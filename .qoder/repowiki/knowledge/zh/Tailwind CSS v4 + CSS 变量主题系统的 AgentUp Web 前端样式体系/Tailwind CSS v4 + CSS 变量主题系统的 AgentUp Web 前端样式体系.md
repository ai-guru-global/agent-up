---
kind: frontend_style
name: Tailwind CSS v4 + CSS 变量主题系统的 AgentUp Web 前端样式体系
category: frontend_style
scope:
    - '**'
source_files:
    - apps/web/app/globals.css
    - apps/web/components/ui/primitives.tsx
    - apps/web/components/ui/status.ts
    - apps/web/postcss.config.mjs
    - apps/web/package.json
    - apps/web/next.config.ts
---

## 1. 系统与方法论

AgentUp 的 Web 应用（`apps/web/`）采用 **Next.js App Router + Tailwind CSS v4** 作为前端样式方案，不使用任何第三方 UI 组件库（如 shadcn/ui、Ant Design、MUI），而是自研一套轻量级基元组件。

- 构建管线：`postcss.config.mjs` 仅注册 `@tailwindcss/postcss`；`package.json` 依赖 `tailwindcss ^4` 与 `@tailwindcss/postcss ^4`，通过 `next.config.ts` 的 `pageExtensions: ["tsx"]` 让 Tailwind 扫描 `.tsx` 中的 className。
- 样式入口：`app/globals.css` 使用 `@import "tailwindcss"` 引入 Tailwind 原子类，并通过 `@theme inline { ... }` 声明设计令牌（design tokens），将 CSS 自定义属性映射到 Tailwind 语义色名（`--color-background` / `--color-foreground` / `--color-surface` / `--color-accent` / `--color-muted` / `--color-subtle` / `--color-danger` / `--color-success` / `--color-warn` 等）。
- 无 `tailwind.config.*`：Tailwind v4 采用零配置模式，所有主题定义集中在 `globals.css` 的 `@theme` 块中。

## 2. 主题与 Token 架构

`globals.css` 定义了完整的明暗双主题：

- 亮色主题：`--background: #fafafa`、`--surface: #ffffff`、`--accent: #2563eb`、`--muted: #52525b`、`--subtle: #63636c`、`--danger: #b91c1c` 等。
- 暗色主题：通过 `@media (prefers-color-scheme: dark)` 覆盖同一组变量，并额外提供 `--danger-bg` / `--success-bg` / `--warn-bg` 等背景+边框成对变量。
- 静态演示模式：`DEMO_EXPORT=1` 时 `<html>` 被注入 `data-force-light`，`:root[data-force-light]` 强制浅色并设置 `color-scheme: light`，跳过系统深色变量。
- 字体 token：`--font-sans` 包含 `ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Helvetica Neue", Arial, sans-serif`，兼顾中英文排版。
- 可访问性：注释明确标注 `muted` 7.7:1、`subtle` 5.9:1 均通过 WCAG AA，状态色在两套主题下都经过对比度验证。

## 3. 全局样式约定

`globals.css` 还集中了跨页面一致的视觉行为：

- 全局过渡缓动：`* { transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }`。
- 焦点可见：`:focus-visible` 统一 2px `var(--ring)` 外描边，输入控件额外设置 `-1px` offset 以贴合边框。
- 滚动条：通过 `scrollbar-color` + `::-webkit-scrollbar-*` 自定义 thumb 颜色与圆角，thumb hover 变深。
- 数字对齐：`time, [data-numeric] { font-variant-numeric: tabular-nums; }` 用于表格化数据防跳动。
- 无障碍动画降级：`prefers-reduced-motion: reduce` 下将所有动画/过渡时长压至 `0.01ms`。

## 4. 组件库与样式组织

自研 UI 基元位于 `components/ui/`，核心文件：

- `primitives.tsx`：按钮（`Button`）、图标按钮（`IconButton`）、加载转圈（`Spinner`）、徽章（`Badge`）、状态徽章（`StatusBadge`）、卡片（`Card`）、页面标题（`PageHeader`）、提示（`Hint`、`Term`）、计数行（`CountLine`）、告警（`Alert`）、空状态（`EmptyState`）、骨架屏（`Skeleton`、`LoadingBlock`）、区块标题（`SectionTitle`）、Mock 标签（`MockTag`）、键值对（`KeyValue`）。
- `status.ts`：`Tone` 联合类型与 `metaOf` 字典，驱动 Badge/Alert 的语义色。
- `modal.tsx`、`form.tsx`：模态框与表单封装。
- `index.ts`：统一导出入口。

关键约定（来自 `primitives.tsx` 顶部注释与代码实现）：

- 所有颜色走 `globals.css` 的语义 token，不再硬编码色值。
- 卡片内边距统一为三档 `none/sm/md`，杜绝 `p-4/p-5` 混用。
- 按钮 variant 限定为 `primary | secondary | ghost | danger`，size 限定为 `sm | md`。
- `IconButton` 强制要求 `label` prop，避免读屏器读到裸图标。
- `EmptyState.titleAs` 默认 `p`，仅在整页空状态时传 `h1`，避免多 h1 破坏文档结构。
- `Alert` 默认 tone 为 `danger`，带 `onRetry` 回调才渲染重试按钮——“凡是重新拉一次数据就能恢复的区域，都应该把这个回调传进来”。
- 微型 `cn()` 工具函数替代 `clsx`，过滤 `false/null/undefined` 后拼接 className。

## 5. 响应式策略

- 基于 Tailwind 原子类的断点（如 `LoadingBlock` 中的 `sm:grid-cols-2 lg:grid-cols-4`）。
- 无媒体查询定制布局，仅保留主题切换与 `prefers-reduced-motion` 两类媒体查询。
- Chrome 扩展（`chrome-extension/popup.css`）是独立样式，未复用 web 应用的 Tailwind 系统。

## 6. 约束与规则

- **颜色来源约束**：`primitives.tsx` 注释明确要求「颜色全部走 globals.css 的语义 token，不再出现硬编码色值」，这是组件层的设计契约。
- **WCAG 对比度约束**：`globals.css` 注释显式声明 muted/subtle 色阶已通过 WCAG AA，状态色在明暗两套主题下均已验证对比度达标。
- **演示模式约束**：`next.config.ts` 在 `DEMO_EXPORT=1` 时启用 `output: "export"` + `trailingSlash: true` + `NEXT_PUBLIC_DEMO_MODE=1`，配合 `:root[data-force-light]` 固定浅色输出，供 Meoo CDN 托管静态站点。
- **Tailwind v4 零配置**：仓库不存在 `tailwind.config.*`，所有主题定义集中在 `@theme inline` 块中，由 PostCSS 插件处理。
- **无第三方 UI 框架**：依赖树中未发现 shadcn/ui、antd、@radix-ui 等 UI 包，所有交互组件均为自研。