# MiMo 真实 LLM 接入设计（替换 mock 口径）

> **状态**：Approved → Implemented（实施结果见本文第六节与交付报告）
> **版本**：v1.1（2026-08-25 定稿并交付；2026-08-25 补充实施结果）
> 日期：2026-08-25
> 背景：用户提供小米 MiMo Token Plan 凭据（`tp-` 前缀，OpenAI 兼容协议，
> 中国集群 `https://token-plan-cn.xiaomimimo.com/v1`，模型 `mimo-v2.5-pro`）。
> 决策（用户批准）：项目里所有可用上 LLM 的位置全部接入，共 5 项。
> 凭据已通过 curl 真实验证连通（2026-08-25）。

## 一、① LLM 网关（地基）

- `.env` 新增（不进 git）：`MIMO_API_KEY` / `MIMO_BASE_URL`（默认 token-plan-cn 中国集群）/ `MIMO_MODEL`（默认 `mimo-v2.5-pro`）；`.env.example` 同步占位。
- 新建 `lib/services/llm-service.ts`：原生 fetch 调 OpenAI 兼容 `/chat/completions`（不引 SDK），请求头 `api-key`；统一超时、结构化错误（`LlmError extends AppError`，上游 4xx/5xx/超时分别映射）；返回 `{ content, model, usage, latencyMs }`。
- 注意 MiMo 为推理模型：`reasoning_content` 消耗 completion tokens，`max_completion_tokens` 默认给足（2048+）。

## 二、②-⑤ 四个接入点

| 端点 | 前端 | 行为 |
|------|------|------|
| `POST /api/maas/probe` | `/maas` 页「真实连通性」区块 | 小 prompt 调模型，返回 model/时延/tokens；区块替代纯 mock 口径，带 LIVE 徽标 |
| `POST /api/feedback/[id]/insight` | 反馈页 NEGATIVE 条目「AI 归因」按钮 | 读反馈详情 → LLM 生成归因 + 改进建议，无状态返回展示（不落库，避免 schema 变更） |
| `POST /api/releases/[id]/summary` | 发布审批详情「AI 变更摘要」按钮 | 读 Release diff → LLM 总结影响面与风险，无状态返回 |
| `POST /api/agents/[id]/chat` | `agents/[id]` 详情试聊 Playground | 加载 Agent systemPrompt + 用户消息 → 真实试聊 |

③④ 无状态（不持久化生成结果），⑤ 会话仅存前端内存。全部走 AppError 体系；写操作类审计沿用现有口径（②③④为读增强，不写审计）。

## 三、工程约束

- 测试：llm-service 单测 + 4 个 API 集成测试，统一 mock `global.fetch`，**测试绝不发真实请求**。
- 页面标注：`/maas` 产品矩阵仍为 MOCK；连通性区块为 LIVE（真实调用）。
- README 同步：环境变量章节 + 下一步里程碑划掉「真实接入」一项。

## 四、不做（YAGNI）

不引 OpenAI SDK；不做流式输出（试聊等完整响应）；不做 embedding/多模态；不动 Prisma/认证。

## 五、验收

`pnpm lint` 0 errors、`pnpm test` 全过（含新增）、`pnpm build` 通过；
浏览器验证 `/maas` 连通性区块真实返回模型信息。

## 六、实施结果（2026-08-25 交付闭环）

✅ 5 项全部按设计交付，验收全过：lint 0 errors、测试 232/232（新增 18）、build 产出 4 个新路由；
四个集成点均完成真实调用验证（探针 2557ms 返回 MiMo 身份确认；AI 归因正确定位 Knowledge 分区；
AI 摘要识破 rel-001 空操作；试聊以真实 systemPrompt 应答）。

实施中一处补充：凭据除根 `.env` 外另写入 `apps/web/.env`——Next.js 只加载应用目录下的 .env，
根目录不生效（已在 README / .env.example 标注）。

完整交付沉淀见：`docs/reports/2026-08-25-mimo-llm-integration-delivery.md`。
