# MiMo 真实 LLM 接入交付报告

> 日期：2026-08-25
> 类型：交付沉淀 / 实施记录
> 前置设计：[MiMo 真实 LLM 接入设计](../superpowers/specs/2026-08-25-mimo-llm-integration-design.md)
> 状态：✅ 全部交付并真实验证通过

## 一、背景与决策

agent-up 此前的所有「智能」环节均为 mock / 规则实现（`lib/services/` 零 LLM 调用）。
2026-08-25 拿到小米 MiMo Token Plan 订阅凭据（`tp-` 前缀 API Key）后，决策为：
**项目内所有可用上 LLM 的位置全部接入真实模型**，把「演示项目」升级为「真实模型在跑的项目」——
这对客户现场演示与 SA 面试都是最硬的证据。

关键事实（来自 MiMo 官方文档，2026-08-25 查证）：

- Token Plan 为套餐专属凭据：**专属 Base URL + `tp-` 前缀 Key**，与按量付费（`sk-`）相互独立不可混用
- 协议：OpenAI 兼容（`/chat/completions`）与 Anthropic 兼容双协议；本项目采用 OpenAI 兼容
- 中国集群 Base URL：`https://token-plan-cn.xiaomimimo.com/v1`
- 鉴权头：`api-key`（OpenAI 兼容协议下）
- 可用模型：`mimo-v2.5-pro`（文本/深度思考/函数调用/结构化输出，1M 上下文）、`mimo-v2.5`（全模态）；v2 系列已于 2026-06-30 下线
- **推理模型特性**：响应含 `reasoning_content` 且消耗 completion tokens，`max_completion_tokens` 不足时 `content` 会为空

## 二、交付架构

### LLM 网关（地基）

`apps/web/lib/services/llm-service.ts`：

- 凭据走 env（`MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_MODEL`），代码零硬编码
- 原生 fetch 直连，不引 SDK；`AbortSignal.timeout` 统一超时（默认 120s，推理模型响应偏慢）
- 结构化错误全部纳入 AppError 体系：`LlmNotConfiguredError`(503) / `LlmUpstreamError`(502，携带上游 status 与截断 body) / `LlmTimeoutError`(504)
- 返回 `{ content, model, usage, latencyMs }`，前端统一展示时延与 tokens

### 四个集成点

| # | 集成点 | 端点 | 前端入口 | 产品叙事 |
|---|--------|------|---------|---------|
| ① | 连通性测试 | `GET/POST /api/maas/probe` | `/maas` 页顶部 LIVE 区块 | 「这个平台连的模型是活的」 |
| ② | 反馈 AI 归因 | `POST /api/feedback/[id]/insight` | 反馈页 NEGATIVE 条目「AI 归因」 | L2 环：反馈 → 归因到分区 → 改配置 |
| ③ | 发布 AI 摘要 | `POST /api/releases/[id]/summary` | 发布审批「查看变更」内「AI 变更摘要」 | 审批有据：影响面 + 风险提示 |
| ④ | Agent 试聊 | `POST /api/agents/[id]/chat` | Agent 详情页「试聊 Playground」 | 改完 Prompt 立即可验（加载当前分区配置） |

设计取舍：②③ 无状态返回不落库（避免 schema 变更）；④ 会话仅存前端内存；
试聊入参走新增 Zod schema `agentChatSchema`（Zod schema 22 → 23）。

## 三、真实验证证据（2026-08-25 实测）

| 验证项 | 结果 |
|--------|------|
| 凭据连通（curl 直连） | `mimo-v2.5-pro` 返回响应，288 tokens |
| ① 探针（浏览器点击） | 「连接状态正常！我是MiMo，由小米公司大模型Core团队开发的智能助手」· 2557ms · 45 入 / 73 出 |
| ② 归因（fb-001） | 正确归因到 **Knowledge 分区**（安全组入/出方向概念解释缺失）并给出可执行改进动作 |
| ③ 摘要（rel-001） | 识破「变更与说明不符」——四分区快照无变化但 changeNote 声称优化知识，判定可能为空操作 |
| ④ 试聊（ecs-assistant） | 以真实 systemPrompt 回答 ECS SSH 排查，第一步指向安全组规则，附控制台操作路径 |
| 测试 | 232/232（新增 18 个：llm-service 单测 9 + API 集成 9），全 mock `global.fetch`，绝不发真实请求 |
| lint / build | 0 errors；build 产出 4 个新路由 + `/maas` |

## 四、踩坑记录（可复用经验）

1. **Next.js 只加载应用目录的 `.env`**：monorepo 里根目录 `.env` 对 `apps/web` 的 Next.js 运行时**不生效**，
   凭据必须放 `apps/web/.env`（该文件已被 web 级 `.gitignore` 的 `.env*` 覆盖）。已三处文档标注。
2. **推理模型的空 content**：`max_completion_tokens` 给小（如 32）时 tokens 全被 `reasoning_content` 吃掉，
   `content` 为空字符串。网关默认给 2048，并对空 content 抛结构化 502 而非静默返回。
3. **旧 dev server 不感知新路由**：新增 route 文件后需重启 dev server，否则 404 "Not Found"。
4. **mermaid 重页面的浏览器自动化**：`click`/`take_screenshot` 易超时，改用 `evaluate_script` 直接触发按钮并轮询 DOM 结果。
5. **凭据安全**：key 只进 `.env`（gitignored），测试用 `tp-test` 假 key + mock fetch；
   key 曾以明文出现在聊天记录中，如需可去 Token Plan 页面重置。

## 五、文件清单

**新增**：
- `apps/web/lib/services/llm-service.ts`（网关）
- `apps/web/app/api/maas/probe/route.ts`
- `apps/web/app/api/feedback/[id]/insight/route.ts`
- `apps/web/app/api/releases/[id]/summary/route.ts`
- `apps/web/app/api/agents/[id]/chat/route.ts`
- `apps/web/app/(dashboard)/maas/connectivity-probe.tsx`
- `apps/web/lib/__tests__/llm-service.test.ts`
- `apps/web/app/api/__tests__/llm-integrations.test.ts`
- `apps/web/.env`（凭据，不进 git）
- `docs/superpowers/specs/2026-08-25-mimo-llm-integration-design.md`

**修改**：
- `apps/web/lib/schemas.ts`（+`agentChatSchema`）
- `apps/web/app/(dashboard)/maas/page.tsx`（LIVE 区块 + 副标题口径）
- `apps/web/app/(dashboard)/feedback/page.tsx`（AI 归因按钮与结果区）
- `apps/web/app/(dashboard)/releases/page.tsx`（DiffViewer 内 AI 摘要）
- `apps/web/app/(dashboard)/agents/[id]/page.tsx`（试聊 Playground）
- `.env` / `.env.example`（根目录，占位与说明）
- `README.md` / `apps/web/README.md`（技术栈、MOCK/LIVE 边界、API 表、环境变量、里程碑）

## 六、下一里程碑

1. 多 Provider：接入真实 DashScope / 百炼（Qwen 系列），`llm-service` 抽象成 provider 可切换——对齐 `/maas` 页「模型可换，改进闭环不变」的叙事
2. 试聊支持流式输出（SSE）
3. LLM 调用写审计日志 + tokens 用量看板（挂到 `/maas` ② 用量表，从 mock 变真实）
4. 把 AI 归因结果回写为反馈的 `resolution` 草稿（需 schema 演进）
