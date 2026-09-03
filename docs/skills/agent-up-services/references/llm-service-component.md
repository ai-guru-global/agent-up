---
title: llm-service 组件蒸馏
source: docs/distilled/llm-service.md
source_commit: 7524808330e38b5510c65b690348f59c127559c2
---

# llm-service 组件

> 蒸馏自 `docs/distilled/llm-service.md`。故障排查读 `references/llm-service-troubleshooting.md`。

## 何时读

需要调用或改动 agent-up 的 LLM 网关（MiMo 接入、三档错误、token 预算、超时语义），或新增 LLM 调用方时读本篇。

## 职责

`apps/web/lib/services/llm-service.ts` 是全平台唯一的 LLM 网关，接入小米 MiMo（OpenAI 兼容协议）。核心是一个函数 chatCompletion（`apps/web/lib/services/llm-service.ts:67`），外加配置读取（getLlmConfig / isLlmConfigured，`apps/web/lib/services/llm-service.ts:55-65`）与三档错误类。它是无状态模块：不读 store、不记审计，纯「请求进、结果出」。

生产调用方共四个路由：Agent 试聊（`apps/web/app/api/agents/[id]/chat/route.ts:43`）、反馈洞察（`apps/web/app/api/feedback/[id]/insight/route.ts:25`）、发布摘要（`apps/web/app/api/releases/[id]/summary/route.ts:62`）、连通性探测（`apps/web/app/api/maas/probe/route.ts:16`、`:24`）。

## 设计原理

- **凭据走 env，代码零硬编码。** 头注释开宗明义（`apps/web/lib/services/llm-service.ts:4`）：MIMO_API_KEY / MIMO_BASE_URL / MIMO_MODEL 三个环境变量（`:57-59`），未配置时 getLlmConfig 返回空 apiKey、isLlmConfigured 返回 false（`:63-65`）。baseUrl 会去掉尾部斜杠（`:58`），防止拼接出双斜杠 URL。
- **原生 fetch 直连，不引 SDK。** 头注释的取舍声明（`:5`）落地为单个 fetch 调用（`:79-89`），超时用 AbortSignal.timeout 而非手工 timer（`:88`），默认 120 秒——注释写明「推理模型响应偏慢，给足时间」（`:52`）。
- **三档结构化错误，全部继承 AppError。** 503 = 本侧未配置（LlmNotConfiguredError，`:30-34`）；502 = 上游故障，涵盖鉴权失败/限流/服务异常/空响应/网络不可达（LlmUpstreamError，`:37-41`）；504 = 超时（LlmTimeoutError，`:44-48`）。fetch 层的 TimeoutError 单独识别转 504（`:91-92`），其余网络错误归 502 并把原始错误消息放进 details.cause（`:94-96`）。
- **对推理模型的 token 余量有显式意识。** 头注释警告：MiMo 的 reasoning_content 会消耗 completion tokens，max_completion_tokens 需给足余量，否则 content 为空（`:6-7`）。体现在两处：默认预算 2048（`:53`、`:85-86`）；空 content 时抛出的错误消息直接点名该成因（`:119-121`）。

## 关键决策

| # | 决策 | 动因与证据 |
|---|------|-----------|
| 1 | 错误按运维语义分三档 503/502/504 | 客户端可区分「改配置」「等服务恢复」「调超时」三种应对（`apps/web/lib/services/llm-service.ts:29-48`） |
| 2 | 上游错误响应体截断 300 字符进 details | 防止巨型错误页撑爆响应与日志（`:100-104`） |
| 3 | 响应解析失败降级为 null，统一走空内容分支 | 不单独区分「响应非 JSON」与「choices 为空」（`:107-118`）；代价见已知坑 1 |
| 4 | usage 缺字段兜底 0、model 三级 fallback | 上游不回 usage 时返回值仍完整（`:126-130`） |
| 5 | 鉴权用 `api-key` 头 | MiMo 的约定（`:81`），与 OpenAI 官方的 Authorization Bearer 不同，属 Azure 风格 |

## 暴露接口

| 函数/类型 | 签名要点 | 行为摘要 |
|------|---------|---------|
| `getLlmConfig()` | 无参 | 读三个 env，返回 apiKey/baseUrl/model；baseUrl 去尾斜杠（`apps/web/lib/services/llm-service.ts:55-61`） |
| `isLlmConfigured()` | 无参 | 仅检查 MIMO_API_KEY 是否非空（`:63-65`） |
| `chatCompletion(opts)` | messages 必填；model/maxCompletionTokens/timeoutMs 可选 | 未配置抛 503（`:74`）；返回 content/model/usage/latencyMs（`:124-133`）；错误三档见设计原理 |
| `LlmNotConfiguredError` | 503 | 未设置 MIMO_API_KEY（`:30-34`） |
| `LlmUpstreamError` | 502，可带 details | 连接失败、非 2xx（附上游状态码与截断 body，`:101-104`）、空内容 |
| `LlmTimeoutError` | 504 | AbortSignal 超时（`:91-92`） |

## 数据流

四个业务路由各自组装 messages 调 chatCompletion：未配置直接抛 503；请求发出后按结果分派——超时转 504、网络错误与非 2xx 归 502（details 带原始成因）、2xx 但 content 为空也是 502、正常返回 content 加 usage 加 latencyMs。全链路无落盘：请求体直接来自调用方组装的 messages，响应体消费完即弃，token 用量与延迟随返回值交给调用方自行处理。

## 依赖与调用方

- import 全集仅一项：AppError（`apps/web/lib/services/llm-service.ts:9`）。零 store、零 audit、零 context——全仓库 service 中依赖最少的一个。
- 反向依赖（全部调用点）：试聊路由（chatCompletion）、反馈洞察路由（chatCompletion）、发布摘要路由（chatCompletion）、探测路由（isLlmConfigured + chatCompletion）、单测（全部导出）。
- 外部依赖：MiMo 的 /chat/completions 端点，默认地址与默认模型 mimo-v2.5-pro 见 `apps/web/lib/services/llm-service.ts:50-51`。

## 已知坑

1. **空 content 与响应解析失败被压成同一个 502，且不带 details。** 一个条件覆盖两种成因（`apps/web/lib/services/llm-service.ts:118`）：json 为 null（上游返回非 JSON，`:107-115`）与 choices 空是两种完全不同的故障，但抛出的 LlmUpstreamError 不传 details（`:119-121`），客户端无法从错误体区分，排障必须看服务端日志。
2. **默认 max_completion_tokens=2048 对推理模型偏紧。** 预算由 content 与 reasoning 共享（`:6-7`），调用方不传时（`:85-86`）长输出请求会先被推理耗尽预算、content 为空——错误消息虽点名成因，默认值本身没为推理模型预留余量。
3. **三档错误类的 code 都是 INTERNAL。** 区分全靠 HTTP status（`:32`、`:39`、`:46`）——按 code 做监控聚合或前端分支处理时 502/503/504 会混在一起。
4. **无重试、无熔断，上游抖动直接透传。** fetch 单次直连（`:79-97`），502/504 原样抛给四个业务路由；限流（429）这类短暂故障也没有退避重试——每个调用方各自决定兜底方式。
5. **latencyMs 从 fetch 发起前计时，含请求体序列化。** 返回的延迟是端到端墙钟时间而非纯上游耗时（`:76`、`:132`），用它做上游性能监控会把网络与本侧开销一并计入。

## 排查路由

出现 LLM 未配置 503、上游错误 502、超时 504、模型返回空内容等故障时读 `references/llm-service-troubleshooting.md`。
