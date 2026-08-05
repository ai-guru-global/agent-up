---
kind: frontend_style
name: Tailwind CSS v4 + CSS 变量主题系统
category: frontend_style
scope:
    - '**'
source_files:
    - apps/web/app/globals.css
    - apps/web/postcss.config.mjs
    - apps/web/package.json
    - apps/web/app/layout.tsx
    - apps/web/app/(dashboard)/layout.tsx
    - packages/ui/src/index.ts
---

本项目的 UI 样式体系基于 Tailwind CSS v4（通过 `@tailwindcss/postcss`）构建，采用纯 CSS 变量驱动的主题方案，未引入第三方组件库（如 shadcn/ui），UI 组件以页面内联 className 方式实现。

**样式系统与工具链**
- 样式引擎：Tailwind CSS v4，通过 PostCSS 插件 `@tailwindcss/postcss` 处理，入口为 `apps/web/app/globals.css`，使用 `@import "tailwindcss"` 引入。
- CSS 变量主题：在 `globals.css` 的 `:root` 中定义语义化颜色变量（`--background`、`--foreground`、`--surface`、`--surface-elevated`、`--border`、`--accent`、`--accent-muted`），并通过 `@theme inline` 映射到 Tailwind 的 `color-*` 命名空间；字体变量 `--font-sans`、`--font-mono` 同样注入 theme。
- 暗色模式：通过 `@media (prefers-color-scheme: dark)` 覆盖 `:root` 中的 CSS 变量值，实现系统级暗色主题切换。
- 全局样式：body 设置 `antialiased` 和 `font-family`，所有元素统一 `transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1)`，输入框 focus 状态使用 accent 色描边，选中文字背景使用 `--accent-muted`。

**组件与布局约定**
- 无共享 UI 组件库：`packages/ui` 目前仅是一个空壳包（`src/index.ts` 仅有版本导出，注释写明“后续集成 shadcn/ui”），实际样式全部写在页面组件的 className 中。
- 样式组织：所有页面组件直接使用 Tailwind 原子类组合样式，例如登录页使用 `bg-[var(--surface)]`、`ring-[var(--border)]`、`text-[var(--foreground)]` 等变量引用；侧边栏导航通过条件拼接 active/hover 状态类。
- 布局结构：Dashboard 布局采用 flex 左右分栏（aside + main），主内容区限制 `max-w-6xl` 居中；登录页使用 `min-h-[100dvh]` 垂直居中卡片。

**设计令牌与约束**
- 颜色体系：通过 CSS 变量集中管理，组件不直接写十六进制色值，而是引用 `var(--xxx)`，保证主题一致性。
- 字体栈：`ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Helvetica Neue", Arial, sans-serif`，优先系统字体并支持中文回退。
- 交互反馈：统一的缓动曲线、focus 描边、hover/active 态透明度与缩放效果。
- 响应式：依赖 Tailwind 默认断点，未发现自定义 `tailwind.config.js`，使用 Tailwind v4 的内置响应式策略。

**关键文件**
- `apps/web/app/globals.css`：主题变量、全局样式、暗色模式定义
- `apps/web/postcss.config.mjs`：PostCSS + Tailwind v4 配置
- `apps/web/package.json`：声明 tailwindcss ^4、@tailwindcss/postcss ^4
- `apps/web/app/layout.tsx`：根布局，应用 antialiased 和全局 CSS
- `apps/web/app/(dashboard)/layout.tsx`：侧边栏布局示例，展示变量使用模式
- `packages/ui/src/index.ts`：预留的共享 UI 包占位