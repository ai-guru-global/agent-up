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

## 样式体系概览

AgentUp Web 应用采用 **Tailwind CSS v4**（PostCSS 插件模式）作为核心样式框架，配合原生 CSS 自定义属性构建设计令牌系统，未引入第三方 UI 组件库。

## 核心架构与工具链

- **样式框架**: Tailwind CSS v4 + `@tailwindcss/postcss` PostCSS 插件，通过 `apps/web/postcss.config.mjs` 配置
- **CSS 入口**: `apps/web/app/globals.css` 使用 `@import "tailwindcss"` 引入 Tailwind
- **字体系统**: 通过 Next.js `next/font/google` 加载 Geist Sans/Mono，以 CSS 变量 `--font-geist-sans` / `--font-geist-mono` 注入
- **构建工具**: Next.js 16 + Turbopack 开发服务器，pnpm workspace 管理依赖

## 设计令牌系统（Design Tokens）

在 `globals.css` 中通过 CSS 自定义属性定义完整的设计令牌：

- **颜色体系**: `--background`、`--foreground`、`--surface`、`--surface-elevated`、`--border`、`--accent`、`--accent-muted`
- **字体变量**: `--font-sans`、`--font-mono` 映射到 Geist 字体族
- **暗色模式**: 通过 `@media (prefers-color-scheme: dark)` 自动切换主题变量值
- **全局过渡**: 所有元素统一使用 `cubic-bezier(0.16, 1, 0.3, 1)` 缓动函数
- **交互细节**: 选中背景、输入框焦点边框等微交互样式

## 组件库策略

- **共享 UI 包**: `packages/ui` 目前为空壳，仅导出版本号，注释表明计划集成 shadcn/ui
- **当前实现**: 页面内联样式为主，侧边栏导航等布局组件直接写在 layout.tsx 中
- **组件目录**: `apps/web/components/ui/` 存在但为空，预留组件库位置

## 响应式与布局约定

- **移动端优先**: 使用 Tailwind 响应式前缀进行适配
- **布局结构**: Dashboard 采用 flex 布局，左侧固定宽度侧边栏（w-56），右侧主内容区自适应
- **间距系统**: 基于 Tailwind 默认 spacing scale（px-3、py-1.5、space-y-0.5 等）
- **容器约束**: 主内容区使用 `max-w-6xl` 限制最大宽度

## 样式组织规范

- **全局样式**: 集中在 `globals.css`，包含主题变量、基础重置、全局动画
- **组件样式**: 优先使用 Tailwind 原子类内联，避免额外 CSS 文件
- **CSS 变量使用**: 通过 `bg-[var(--background)]` 形式引用设计令牌，保持主题一致性
- **字体应用**: 根布局设置 `antialiased`，字体变量通过 className 注入 html 元素