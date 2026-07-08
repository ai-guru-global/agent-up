---
kind: dependency_management
name: pnpm + Turborepo 多包依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - turbo.json
    - pnpm-lock.yaml
    - package-lock.json
    - apps/web/package.json
    - packages/shared/package.json
    - packages/db/package.json
    - packages/ui/package.json
---

本仓库采用 pnpm workspace 与 Turborepo 构建的 Monorepo，通过集中式脚本与任务编排统一管理第三方依赖。

## 使用的系统与工具
- **包管理器**：pnpm（根 package.json 通过 packageManager: "pnpm@9.15.0" 锁定版本），同时存在 package-lock.json 与 pnpm-lock.yaml 两个锁文件。
- **工作区**：pnpm-workspace.yaml 声明 apps/* 与 packages/* 为工作区成员。
- **任务编排**：Turborepo v2（turbo.json）统一调度各包的 build/dev/lint/db 等任务，并配置缓存策略与输入输出。
- **Node 引擎约束**：根 engines.node >= 20。

## 关键文件与包结构
- 根级：package.json、pnpm-workspace.yaml、turbo.json、pnpm-lock.yaml、package-lock.json。
- 应用包：apps/web/package.json（Next.js 16 + React 19 + Prisma Client）。
- 共享包：
  - packages/shared/package.json（@agent-up/shared，纯 TS 类型/常量，无运行时依赖）。
  - packages/db/package.json（@agent-up/db，导出 Prisma Client 单例，依赖 @prisma/client ^6.10.0）。
  - packages/ui/package.json（@agent-up/ui，React 19 UI 骨架，使用 peerDependencies 声明 React）。

## 架构与约定
- **内部包引用**：应用通过 workspace:* 协议消费共享包，如 "@agent-up/shared": "workspace:*"、"@agent-up/db": "workspace:*"，避免硬编码版本号，确保跨包版本一致。
- **依赖分层**：
  - 运行时依赖集中在 dependencies（如 Next、React、Prisma Client、Zod）。
  - 构建/开发工具放在 devDependencies（TypeScript、ESLint、Tailwind、Prisma CLI）。
  - UI 包以 peerDependencies 暴露 React 宿主版本，由应用提供具体实现。
- **任务编排**：根 scripts 仅转发到 turbo run <task>；turbo.json 中 build 任务通过 dependsOn: ["^build"] 强制先构建上游依赖包，lint 同样依赖上游构建产物。
- **环境变量**：globalDependencies: [".env"] 使 .env 变更触发重新构建。

## 开发者应遵循的规则
1. 新增包：在 packages/ 或 apps/ 下创建目录后，务必在 pnpm-workspace.yaml 的匹配模式内（当前已覆盖 apps/*、packages/*），并在其 package.json 中声明 name、version、main/types 入口。
2. 引用内部包：一律使用 "workspace:*" 协议，禁止写死版本号，保证 monorepo 内版本一致性。
3. 添加外部依赖：仅在真正需要的子包中添加，优先放入 dependencies；构建/测试相关工具放入 devDependencies。
4. 保持 Node 版本：所有环境需满足 node >= 20，否则 pnpm 安装会失败。
5. 同步锁文件：提交时同时保留 pnpm-lock.yaml 与 package-lock.json（后者可能由 CI 或其他流程生成），避免依赖解析不一致。
6. UI 包 peer 依赖：@agent-up/ui 的 react/react-dom 应保持在 peerDependencies，由宿主应用提供具体版本，避免重复打包。