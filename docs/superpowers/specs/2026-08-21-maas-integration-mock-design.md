# MaaS 集成 Mock 层设计（客户演示 / 面试用途）

> 日期：2026-08-21
> 背景：作者为阿里云企业 SA，面试全栈 SA / MaaS SA。agent-up 作为客户现场演示工具，
> 展示「与客户一起持续迭代 Agent」的能力；本设计为其补一层与阿里云大模型产品（MaaS）
> 深度绑定的 **mock** 内容，公共云 + 专有云双形态。
> 约束：全部为 mock，不接真实 DashScope/百炼；沿用现有 MOCK 标注规范。

## 一、新增 `/maas` 「模型服务」页

静态 TSX 页（沿用 `architecture/_components/ui` 的 PageHeader/Section/Table/Insight 模式，
与架构页同款文件级 `react/jsx-key` 豁免注释），侧边栏 navItems 增加「模型服务」。

四个内容块：

1. **产品矩阵 · 双形态**：公共云（百炼 Model Studio / DashScope API / Qwen-Max·Plus·Turbo /
   text-embedding-v3 / 百炼 RAG 知识库）与专有云（Apsara Stack 模型服务私有化 / PAI-EAS /
   私有向量检索）对照表，列：形态 / 产品·模型 / 角色 / 对应 agent-up 分区。
2. **每 Agent 模型用量（mock）**：主模型 / 兜底 / 调用次数 / tokens / 预估成本 / 时延 / 解决率。
3. **模型路由策略**：mermaid 图 —— qwen-turbo 分类 → 复杂走 qwen-max、常规走 qwen-plus，
   置信度 < 0.3 转人工；检索先百炼 RAG、未命中 MCP 兜底；专有云客户走私有化推理端点。
4. **集成点与演进**：四分区 ↔ MaaS 接入点对照表 + 定位语：
   「MaaS 提供模型引擎，agent-up 管 Agent 的配置·评估·发布·回滚生命周期」。

页头带 MOCK 徽标；页面注释声明 mock 边界与下一里程碑（真实接入）。

## 二、种子数据增强（schema-safe）

仅触碰 Zod `z.any()` 安全区与自由文本，保证 PUT 校验不报错、不丢字段：

- `promptConfig.systemPrompt` 追加「运行环境（MOCK）」段：主/降级/分类模型与双形态端点口径。
- `toolsConfig.mcpTools` 追加 mock 条目：`bailian_kb_retrieval`、`dashscope_text_embedding`。
- `toolsConfig.wikiQueryTools`（ecs）追加 `bailian_rag_fallback`；ecs `searchStrategy` 改 `HYBRID`。
- 不改 knowledge/routing 顶层结构（固定字段，PUT 会剥离未知键）。

## 三、不做（YAGNI）

不新增 API/service/schema/测试；不接真实模型；不动 Prisma/认证。

## 四、验收

`pnpm lint` 0 errors、`pnpm test` 全过、`pnpm build` 通过；浏览器打开 `/maas` 截图确认渲染。
