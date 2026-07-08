---
kind: frontend_style
name: Tailwind CSS v4 + Next.js App Router 样式体系
category: frontend_style
scope:
    - '**'
source_files:
    - apps/web/app/globals.css
    - apps/web/postcss.config.mjs
    - packages/ui/package.json
    - packages/ui/src/index.ts
---

本仓库采用 Tailwind CSS v4（基于 @tailwindcss/postcss）作为唯一的前端样式方案，配合 Next.js App Router 的 globals.css 全局入口进行主题与字体配置。

样式架构与工具链
- 样式引擎：Tailwind CSS v4，通过 PostCSS 插件 @tailwindcss/postcss 注入，无需传统 tailwind.config.js，改用 @theme inline 在 CSS 中声明设计令牌。
- 全局入口：apps/web/app/globals.css 使用 @import "tailwindcss" 引入框架，并通过 :root 自定义属性定义背景/前景色，@media (prefers-color-scheme: dark) 实现系统级暗色模式切换。
- 字体策略：通过 --font-sans / --font-mono 指向 Geist Sans/Mono，同时 fallback 到 Arial, Helvetica, sans-serif。
- 组件库：packages/ui 为预留的私有 React 19 UI 包（@agent-up/ui），当前仅导出版本号，注释明确后续集成 shadcn/ui。

设计令牌与配色约定
- 语义化变量：--background、--foreground 映射到 Tailwind 的 --color-background / --color-foreground，遵循 Tailwind v4 的 @theme inline 规范。
- 色彩体系：目前仅使用 slate 色系（slate-50 ~ slate-900）构建登录页与仪表盘骨架，尚未扩展自定义调色板。
- 布局风格：大量使用 rounded-xl、border border-slate-200、bg-white、shadow-sm 等原子类组合出卡片式管理后台视觉。

开发约束与建议
- 所有页面样式应通过 Tailwind 原子类直接书写，避免新增独立 .css 文件；如需复用样式片段，优先抽取至 components/ui 或共享 UI 包。
- 主题扩展应在 globals.css 的 @theme inline 块内集中声明，不要分散在各组件文件中。
- 暗色模式依赖系统偏好，如需手动开关，应在 :root 上切换 CSS 变量而非覆盖 Tailwind 默认值。
- 待 @agent-up/ui 接入 shadcn/ui 后，业务组件应从该包导入基础控件，保持跨页面视觉一致性。