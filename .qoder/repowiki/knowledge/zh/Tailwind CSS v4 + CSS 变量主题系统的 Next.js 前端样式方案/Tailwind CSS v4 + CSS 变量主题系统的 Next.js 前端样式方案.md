---
kind: frontend_style
name: Tailwind CSS v4 + CSS 变量主题系统的 Next.js 前端样式方案
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

## 1. 系统/方法概述

本项目采用 **Next.js App Router**（Next 16）+ **Tailwind CSS v4**（通过 `@tailwindcss/postcss` 插件）作为前端样式体系。样式以原子化 CSS 类名直接写在 React 组件的 `className` 中，未引入第三方 UI 组件库（如 shadcn/ui），而是通过自定义 CSS 变量构建轻量设计令牌系统。

- 构建工具链：PostCSS → `@tailwindcss/postcss`（v4）→ Tailwind CSS v4
- 样式入口：`apps/web/app/globals.css`，使用 `@import "tailwindcss"` 引入框架
- 布局与页面：全部位于 `apps/web/app/` 下，遵循 Next.js App Router 约定
- 共享 UI 包：`packages/ui` 当前为空壳（仅导出版本号），注释标明“后续集成 shadcn/ui”，尚未实际承载组件

## 2. 关键文件

- `apps/web/app/globals.css`：全局主题、设计令牌、暗色模式、基础样式
- `apps/web/postcss.config.mjs`：PostCSS 配置，仅启用 `@tailwindcss/postcss`
- `apps/web/package.json`：声明依赖 `tailwindcss ^4`、`@tailwindcss/postcss ^4`
- `apps/web/app/layout.tsx`：根布局，引入 `globals.css`，设置 `lang="zh-CN"`、`antialiased`
- `apps/web/app/(dashboard)/layout.tsx`：侧边栏导航布局，集中定义菜单项与活跃态样式
- `packages/ui/src/index.ts`：预留的共享 UI 包入口，当前仅占位

## 3. 架构与设计约定

### 设计令牌（Design Tokens）
所有颜色、字体均通过 CSS 自定义属性暴露，并在 Tailwind 的 `@theme inline` 块中映射为语义化 token：

| Token | 用途 | 亮色值 | 暗色值 |
|---|---|---|---|
| `--background` | 页面背景 | `#fafafa` | `#09090b` |
| `--foreground` | 正文文字 | `#18181b` | `fafafa` |
| `--surface` | 卡片/面板背景 | `#ffffff` | `#18181b` |
| `--surface-elevated` | 悬浮层级背景 | `#f4f4f5` | `#27272a` |
| `--border` | 边框/分割线 | `#e4e4e7` | `#3f3f46` |
| `--accent` | 强调色（主按钮等） | `#2563eb` | `#3b82f6` |
| `--accent-muted` | 强调色弱化（选中态背景） | `#dbeafe` | `#1e3a5f` |
| `--font-sans` | 无衬线字体栈（含 PingFang SC） | — | — |
| `--font-mono` | 等宽字体栈 | — | — |

暗色模式通过 `@media (prefers-color-scheme: dark)` 自动切换，无需 JS 开关。

### 主题使用方式
组件中使用 `bg-[var(--background)]`、`text-[var(--foreground)]`、`ring-[var(--border)]` 等内联变量引用，而非 Tailwind 内置色板。这使主题完全由 CSS 变量驱动，便于统一换肤。

### 响应式策略
- 使用 Tailwind 默认断点（sm/md/lg/xl/2xl）进行响应式布局
- 侧边栏布局基于 flexbox：`flex min-h-[100dvh]` + 固定宽度 `w-56` aside + `flex-1` main
- 内容区域限制最大宽度：`max-w-6xl px-8 py-8`

### 组件组织
- 页面级组件直接放在 `app/(auth)/...`、`app/(dashboard)/...` 路由目录下
- 通用 UI 组件目录 `components/ui/` 已创建但为空，尚未填充
- 业务布局（侧边栏、导航）集中在 `(dashboard)/layout.tsx` 中
- 错误边界封装在 `app/components/error-boundary.tsx`

### 动画与交互
- 全局过渡缓动：`transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1)` 应用于所有元素
- 选中高亮：`::selection` 使用 `--accent-muted` 背景
- 表单聚焦：`input:focus, select:focus, textarea:focus` 统一 `outline: 2px solid var(--accent)`

## 4. 约定与约束

- **样式来源单一**：所有样式来自 Tailwind CSS v4 原子类 + `globals.css` 中的 CSS 变量，不引入额外 CSS 框架
- **主题色唯一出口**：颜色必须通过 `var(--xxx)` 引用，禁止在组件中硬编码十六进制颜色值（除少数装饰性状态色如 `amber-500/10`、`red-500/10` 用于告警/错误提示）
- **字体规范**：全局使用 `--font-sans` 字体栈，优先系统字体并包含中文苹方（PingFang SC）
- **暗色模式**：基于系统偏好自动切换，不实现手动切换逻辑
- **共享 UI 包**：`packages/ui` 当前仅为空壳，注释明确“后续集成 shadcn/ui”，现阶段不应在此处添加样式
- **语言与排版**：根布局强制 `lang="zh-CN"`，全局启用 `antialiased` 抗锯齿
- **移动端适配**：登录页使用 `min-h-[100dvh]` 确保全屏高度，侧边栏布局在小屏上需自行处理（当前未见媒体查询适配）
- **数据标注**：界面中标注 MOCK 的区域使用 `amber-500/15` 背景 + `dark:text-amber-400` 区分测试态

该方案轻量、可维护，通过 CSS 变量实现主题一致性，适合中小型管理后台场景。未来若扩展为大型应用，可考虑将 `packages/ui` 落地为真正的共享组件库。