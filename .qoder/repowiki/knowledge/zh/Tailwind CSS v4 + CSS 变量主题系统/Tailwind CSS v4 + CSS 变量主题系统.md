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
    - packages/ui/src/index.ts
---

本项目的 UI 样式体系基于 Tailwind CSS v4 与原生 CSS 变量构建，采用 Next.js App Router 的 `globals.css` 作为全局主题入口，通过 `@theme inline` 将设计令牌暴露为 Tailwind 自定义属性。

**样式系统与工具链**
- 使用 Tailwind CSS v4（`tailwindcss: ^4`）配合 `@tailwindcss/postcss` PostCSS 插件进行编译，未使用传统的 `tailwind.config.*` 文件，而是依赖 v4 的 CSS-in-Tailwind 主题声明方式。
- PostCSS 配置仅引入 `@tailwindcss/postcss`，保持极简。
- Next.js 16.2.10 作为前端框架，通过 `app/globals.css` 全局导入 Tailwind。

**主题与颜色系统**
- 所有视觉令牌通过 CSS 自定义属性定义在 `:root` 中，包括 `--background`、`--foreground`、`--surface`、`--surface-elevated`、`--border`、`--accent`、`--accent-muted`。
- 字体族通过 `--font-sans` 和 `--font-mono` 定义，支持中英文混合显示（PingFang SC、Helvetica Neue 等）。
- 支持系统级深色模式：通过 `@media (prefers-color-scheme: dark)` 切换一套暗色变量值。
- 组件中使用 `[var(--xxx)]` 语法直接引用 CSS 变量，而非 Tailwind 预设色值，确保主题一致性。

**组件库策略**
- `packages/ui` 是一个预留的共享 UI 包（`@agent-up/ui`），当前仅导出版本信息，注释表明后续计划集成 shadcn/ui 组件。
- 目前页面组件直接在 JSX 中编写 Tailwind 类名，尚未抽取为可复用 UI 组件。

**响应式与交互约定**
- 全局设置 `* { transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1) }` 统一过渡曲线。
- 输入框聚焦时通过 `outline: 2px solid var(--accent)` 提供一致的焦点指示。
- 文本选中背景使用 `--accent-muted` 变量。
- 布局采用 Tailwind 的响应式前缀（如 `max-w-sm`、`w-full`）实现自适应。

**代码组织**
- 全局样式集中在 `apps/web/app/globals.css`。
- 页面级样式通过内联 className 编写，未发现独立的模块 CSS/SCSS 文件。
- `components/ui` 目录为空，等待未来组件库落地。

**约束与规范**
- 颜色必须通过 CSS 变量引用，禁止硬编码十六进制色值（除 Tailwind 内置色如 `bg-red-500`、`text-zinc-400` 等中性色）。
- 深色模式自动跟随系统偏好，无需手动切换逻辑。
- 字体栈优先使用系统字体，保证跨平台渲染一致性。