# 安全策略

## 支持的版本

| 版本 | 支持状态 |
| ---- | -------- |
| `main` 分支 | ✅ 支持 |
| 历史 commit | ❌ 不支持，请先升级到 `main` |

本项目尚未发布版本号 / tag，安全修复直接落在 `main`。

## 报告漏洞

**请不要通过公开 issue、讨论区或 PR 报告安全漏洞。**

- 首选：GitHub 私密漏洞报告——仓库 **Security → Report a vulnerability**（维护者需在仓库 Settings → Code security 中启用 Private vulnerability reporting）。
- 备选：邮件至 `allengaller@qq.com`，标题以 `[security] agent-up` 开头。

请尽量包含：复现步骤、影响评估、受影响的端点/文件。我们承诺 **3 个工作日内**给出初步响应，并在修复发布前对报告内容保密。修复后会公开致谢（除非你要求匿名）。

## 漏洞范围

欢迎报告的问题：

- 认证与会话：令牌签发/校验（`apps/web/lib/auth-token.ts`）、口令哈希（`apps/web/lib/password-hash.ts`）、cookie 属性
- 鉴权与 RBAC：API 路由的权限校验绕过、越权访问他人产品组资源
- 注入类：SQL 注入（经 Prisma 之外的拼接）、XSS、SSRF（LLM 网关外呼 URL 可控等）
- 审计完整性：写操作审计可被绕过或篡改
- 依赖中的已知 CVE（也可直接走 Dependabot 自动 PR）

不在范围内（已知设计决策，欢迎讨论但不算漏洞）：

- 开发环境（`NODE_ENV !== production`）未配置 `AUTH_SECRET` 时登录成功但签不出令牌——生产环境由 `instrumentation.ts` 启动期强制退出进程，这是文档化的降级行为。
- 明文 `x-actor-*` 请求头：仅当部署方显式设置 `AUTH_TRUST_ACTOR_HEADERS=1` 且已置于可信网关之后才被采纳；production 默认拒绝（见 `.env.example` 注释）。
- `DEMO_EXPORT=1` 静态导出形态：演示产物，不含任何真实鉴权，不得暴露公网。
- 种子数据中的演示账号口令（README 公开记载，仅用于本地演示）。
- 缺失速率限制 / CORS 策略：当前定位为演示/内部平台，生产化路线见 README「下一步」。
