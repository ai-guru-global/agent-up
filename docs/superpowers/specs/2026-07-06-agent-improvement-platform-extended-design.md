# Agent 持续改进平台 — 扩展设计文档

- **状态**: Draft
- **日期**: 2026-07-06
- **基于**: [MVP 设计文档](./2026-07-06-agent-improvement-platform-mvp-design.md)
- **技术栈**: Next.js 15 + Prisma + PostgreSQL + Turborepo
- **范围**: 在 MVP 基础上扩展为完整的 Agent / Skills / Wiki 持续改进管理平台

---

## 1. 三层 Loop 设计理念深度分析

### 1.1 总览：三层循环的协同模型

本平台以三个不同时间尺度的产品改进循环为骨架，形成一个从即时响应到长期进化的完整闭环。三层 Loop 不是孤立运转的——它们通过**数据管道**和**事件触发**相互耦合：

```
L1 即时交互环 (分钟级)
  │  产出：会话日志、评分信号、失败标记
  ▼
L2 产品改进环 (小时~天级)
  │  产出：配置变更、版本发布、改进效果数据
  ▼
L3 智能进化环 (天~周级)
  │  产出：跨 agent 洞察、共性缺口、自动蒸馏建议
  └──→ 反哺 L2（推荐改进方向）+ L1（实时更新知识库）
```

### 1.2 L1 即时交互环（Runtime Loop）— 数据采集与实时反馈

#### 1.2.1 运行时交互链路

Agent 在岗解决工单的完整链路：

```
用户（CRE/客户）
  │  通过群聊/Web 提交工单问题
  ▼
Routing 层（routing 分区配置）
  │  分类工单 → 路由到对应 Agent / 子流程
  ▼
Agent 推理层（prompt + knowledge + tools）
  │  ① 检索 Wiki 知识（优先）
  │  ② 未命中 → 调用 MCP 工具查底表/传统 KB
  │  ③ 综合生成回答
  ▼
用户接收回答
  │  评分 / 追问 / 转人工
  ▼
会话结束 → 生成 Session 记录
```

#### 1.2.2 反馈数据采集点

| 采集点 | 数据内容 | 采集方式 | 用途 |
|--------|---------|---------|------|
| 会话结束 | 完整会话日志（消息序列、工具调用链、耗时） | 自动 | 回溯分析、知识蒸馏 |
| 用户评分 | 好/差/中性 + 可选文字反馈 | 用户主动 | 改进效果度量 |
| 转人工 | 转人工触发原因、转接前最后 N 轮对话 | 自动 | 识别 Agent 能力边界 |
| 工具调用失败 | 失败的工具名、参数、错误信息 | 自动 | 工具配置优化 |
| 知识未命中 | Wiki 检索无结果的 query | 自动 | 知识缺口发现 |
| 回答拒绝 | Agent 因安全策略拒绝回答的场景 | 自动 | 策略阈值调整 |

#### 1.2.3 L1 -> L2 数据管道

**MVP 阶段（手动）**：CRE / 产品组手动粘贴会话片段到 Feedback 表单。

**后续自动化阶段**：

```
Session 日志（S3/数据库）
  │
  ▼
采集 Pipeline（定时 / 事件驱动）
  │  - 会话解析与结构化
  │  - 自动提取评分信号
  │  - 异常会话标记（转人工、工具失败、超时）
  ▼
Feedback 暂存队列
  │  - 去重
  │  - 自动标签分类（NLP）
  ▼
Feedback 审核工作台
  │  - 产品组确认/补充
  ▼
正式 Feedback 记录
```

### 1.3 L2 产品改进环（Developer Feedback Loop）— 核心改进流程

#### 1.3.1 改进闭环流程（扩展版）

在 MVP 基础上新增改进效果度量、灰度发布、自动分类：

```
① Feedback 收集（手动 + 自动）
   │
   ▼
② 自动分类与优先级排序
   │  - NLP 标签分类（answer_quality / knowledge_gap / tool_failure / routing_error / hallucination）
   │  - 严重度评估（critical / major / minor / suggestion）
   │  - 影响面评估（同类 Feedback 聚合计数）
   ▼
③ 分配给对应产品组
   │  - 按 Agent 归属自动路由
   ▼
④ 根因分析
   │  - 产品组分析 Feedback，定位问题分区
   │  - 关联历史相似 Feedback（相似度匹配）
   ▼
⑤ 制定改进方案 + 编辑配置
   │  - 改 prompt / 补知识 / 改工具 / 调路由
   │  - Draft 环境自测
   ▼
⑥ 提交 Release（含改进说明 + 关联证据）
   │
   ▼
⑦ 审批（工单团队）
   │  - 看 diff + 证据 + 说明
   ▼
⑧ 灰度发布
   │  - 10% 流量 → 观察 → 50% → 观察 → 100%
   │  - 异常自动回滚
   ▼
⑨ 效果验证
   │  - 改进前后 N 天 Feedback 好评率/差评率对比
   │  - 改进效果评分
   ▼
⑩ 关闭 / 回滚 / 继续迭代
```

#### 1.3.2 改进效果度量

**核心指标**：

| 指标 | 计算方式 | 目标 |
|------|---------|------|
| 好评率变化 | 改进后 7 天好评率 - 改进前 7 天好评率 | 正向提升 |
| 差评率变化 | 改进后 7 天差评率 - 改进前 7 天差评率 | 正向降低 |
| 同类 Feedback 复发率 | 同一标签 Feedback 在改进后的出现频率 | 降低 |
| 转人工率变化 | 改进前后转人工比例对比 | 降低 |
| 平均响应时间 | 改进前后 Agent 平均响应耗时 | 无退化 |

**效果报告自动生成**：每次 Version 发布后第 7 天，系统自动生成改进效果报告，推送给产品组。

#### 1.3.3 A/B 测试框架（灰度发布）

**灰度策略模型**：

```
CanaryRelease:
  versionId:       -> Version（新版本）
  baselineId:      -> Version（基线版本，即当前生产版本）
  trafficSplit:    Float (0.0 ~ 1.0，新版本流量占比)
  stages:          CanaryStage[]
  autoPromoteRule: { minDuration: Duration, maxErrorRate: Float, minSampleSize: Int }
  autoRollbackRule: { maxErrorRate: Float, minRegressionScore: Float }

CanaryStage:
  trafficRatio:    Float
  duration:        Duration
  observeMetrics:  MetricSnapshot
```

灰度阶段：10% → 观察 24h → 50% → 观察 24h → 100% 全量。异常（错误率突增、差评率飙升）自动回滚。

### 1.4 L3 智能进化环（Evolution Loop）— 跨 Agent 智能洞察

#### 1.4.1 跨 Agent 知识发现机制

```
所有 Agent 的 Feedback + Version 历史
  │
  ▼
聚合分析引擎（定时任务，天~周级）
  │
  ├─ 共性缺口发现
  │    多个 Agent 出现相同标签 Feedback → 识别为共性缺口
  │    例：ECS/RDS/OSS 都出现 "ECS 实例限制" 相关知识缺失
  │
  ├─ 改进模式挖掘
  │    分析高效果改进（好评率提升 > 20%）的共性特征
  │    例：发现 "增加具体配额数字到 prompt" 是高频有效模式
  │
  ├─ 知识复用推荐
  │    某 Agent 的 Wiki 页面被多次引用 → 推荐为共享概念页
  │    例：[[concepts/aliyun-quota-system]] 被 3 个 Agent 引用
  │
  └─ 进化趋势报告
       各 Agent 的改进频率、效果趋势、知识增长曲线
```

#### 1.4.2 自动蒸馏 Pipeline

当 L3 发现共性知识缺口时，自动触发蒸馏：

```
共性缺口报告（L3 产出）
  │
  ▼
自动收集相关原始数据
  │  - 相关 Feedback 会话
  │  - 相关工单记录
  │  - 相关外部文档
  ▼
调用 wiki-ingest 蒸馏
  │  - 生成 Draft 页面
  │  - 标记 provenance=inferred
  ▼
推送到相关 Agent 的 Wiki Vault
  │  - 产品组审阅
  │  - 标记 lifecycle=reviewed/verified
  ▼
随下次 Release 生效
```

#### 1.4.3 进化洞察仪表板

| 视图 | 内容 | 更新频率 |
|------|------|---------|
| 全局健康度 | 各 Agent 好评率/差评率趋势、版本发布频率 | 日更新 |
| 知识缺口热力图 | 按标签/Agent 维度的 Feedback 密度热力图 | 日更新 |
| 改进效果排行 | 近期最高效果/最低效果的改进记录 | 周更新 |
| 进化时间线 | 各 Agent 的版本演进对比，标注关键改进节点 | 实时更新 |
| 知识增长曲线 | 各 Wiki Vault 的页面数、连接度、平均 confidence 趋势 | 周更新 |

---

## 2. Agent 配置管理系统

### 2.1 数据模型

Agent 配置采用四分区模型，每个分区独立版本化：

```prisma
model Agent {
  id            String   @id @default(cuid())
  name          String
  description   String?
  productGroupId String
  productGroup  ProductGroup @relation(fields: [productGroupId], references: [id])
  
  // 四分区配置（当前活跃配置）
  promptConfig  PromptConfig?
  knowledgeConfig KnowledgeConfig?
  toolsConfig   ToolsConfig?
  routingConfig RoutingConfig?
  
  // 环境管理
  draftConfig   AgentDraftConfig?
  
  // 关联实体
  feedbacks     Feedback[]
  releases      Release[]
  versions      AgentVersion[]
  skillBindings AgentSkillBinding[]
  wikiVault     WikiVault?
  
  // 元数据
  status        AgentStatus @default(DRAFT)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  createdBy     String
  
  @@index([productGroupId])
  @@index([status])
}

enum AgentStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}
```

#### 2.1.1 Prompt 分区

```prisma
model PromptConfig {
  id              String   @id @default(cuid())
  agentId         String   @unique
  agent           Agent    @relation(fields: [agentId], references: [id])
  
  systemPrompt    String   // 系统提示词（Markdown）
  roleDefinition  String?  // 角色设定
  constraints     String[] // 约束条件列表
  outputFormat    String?  // 输出格式规范
  
  // 版本追踪
  version         Int      @default(1)
  lastModifiedBy  String?
  lastModifiedAt  DateTime @default(now())
  
  @@index([agentId])
}
```

#### 2.1.2 Knowledge 分区

```prisma
model KnowledgeConfig {
  id              String   @id @default(cuid())
  agentId         String   @unique
  agent           Agent    @relation(fields: [agentId], references: [id])
  
  wikiVaultId     String?  @unique
  wikiVault       WikiVault? @relation(fields: [wikiVaultId], references: [id])
  
  // 知识检索策略
  searchStrategy  SearchStrategy @default(WIKI_FIRST)
  fallbackToMcp   Boolean  @default(true)
  maxWikiResults  Int      @default(5)
  confidenceThreshold Float @default(0.6)
  
  lastSyncAt      DateTime?
  syncStatus      SyncStatus @default(SYNCED)
  
  version         Int      @default(1)
  lastModifiedBy  String?
  lastModifiedAt  DateTime @default(now())
  
  @@index([agentId])
}

enum SearchStrategy {
  WIKI_FIRST      // Wiki 优先，未命中走 MCP
  WIKI_ONLY       // 仅 Wiki
  MCP_FIRST       // MCP 优先（特殊场景）
  HYBRID          // 混合检索
}

enum SyncStatus {
  SYNCED
  SYNCING
  OUT_OF_SYNC
  ERROR
}
```

#### 2.1.3 Tools 分区

```prisma
model ToolsConfig {
  id              String   @id @default(cuid())
  agentId         String   @unique
  agent           Agent    @relation(fields: [agentId], references: [id])
  
  mcpTools        Json     // McpToolConfig[] 序列化存储
  wikiQueryTools  Json     // WikiQueryToolConfig[] 序列化存储
  
  // 工具执行策略
  maxConcurrentCalls Int   @default(3)
  timeoutMs          Int   @default(30000)
  retryCount         Int   @default(2)
  
  version         Int      @default(1)
  lastModifiedBy  String?
  lastModifiedAt  DateTime @default(now())
  
  @@index([agentId])
}
```

**MCP Tool 配置结构**（JSON Schema）：

```json
{
  "name": "query_ecs_quota",
  "displayName": "查询 ECS 配额",
  "description": "查询指定地域的 ECS 实例配额信息",
  "endpoint": "https://api.internal/ecs/quota",
  "method": "POST",
  "inputSchema": {
    "type": "object",
    "properties": {
      "regionId": { "type": "string", "description": "地域 ID" },
      "instanceType": { "type": "string", "description": "实例类型" }
    },
    "required": ["regionId"]
  },
  "outputSchema": { "type": "object" },
  "authType": "bearer",
  "permissionScope": "read_only",
  "enabled": true
}
```

#### 2.1.4 Routing 分区

```prisma
model RoutingConfig {
  id                  String   @id @default(cuid())
  agentId             String   @unique
  agent               Agent    @relation(fields: [agentId], references: [id])
  
  rules               Json     // RoutingRule[] 序列化存储
  escalationPolicy    Json?    // EscalationPolicy 序列化存储
  
  // 全局策略
  humanThreshold      Float    @default(0.3)  // 转人工置信度阈值
  maxConversationTurns Int     @default(10)   // 最大对话轮次
  idleTimeoutMinutes  Int      @default(5)    // 空闲超时
  
  version             Int      @default(1)
  lastModifiedBy      String?
  lastModifiedAt      DateTime @default(now())
  
  @@index([agentId])
}
```

**路由规则结构**（JSON Schema）：

```json
{
  "rules": [
    {
      "id": "rule_001",
      "name": "ECS 实例创建问题",
      "matchCondition": {
        "keywords": ["创建实例", "购买", "开通"],
        "category": "ecs_instance"
      },
      "action": {
        "type": "route_to_agent",
        "targetAgentId": "agent_ecs_main",
        "priority": 10
      }
    }
  ],
  "defaultAction": {
    "type": "route_to_human",
    "reason": "no_matching_rule"
  }
}
```

### 2.2 配置变更与 Diff 机制

每次配置修改自动记录变更：

```prisma
model ConfigChange {
  id          String   @id @default(cuid())
  agentId     String
  partition   ConfigPartition  // PROMPT / KNOWLEDGE / TOOLS / ROUTING
  
  before      Json?    // 修改前快照
  after       Json     // 修改后快照
  diff        Json     // 结构化 diff
  
  changedBy   String
  changedAt   DateTime @default(now())
  changeNote  String?
  
  // 关联
  releaseId   String?  // 如果随 Release 提交
  
  @@index([agentId, partition])
  @@index([changedAt])
}

enum ConfigPartition {
  PROMPT
  KNOWLEDGE
  TOOLS
  ROUTING
}
```

### 2.3 Draft / Staging / Production 三环境

```prisma
model AgentDraftConfig {
  id          String   @id @default(cuid())
  agentId     String   @unique
  agent       Agent    @relation(fields: [agentId], references: [id])
  
  // Draft 环境的四分区配置（覆盖生产配置）
  promptConfig    Json?
  knowledgeConfig Json?
  toolsConfig     Json?
  routingConfig   Json?
  
  // Draft 状态
  isDirty     Boolean  @default(false)  // 是否有未提交的修改
  lastSavedBy String?
  lastSavedAt DateTime?
  
  @@index([agentId])
}
```

环境流转：`Draft (编辑中) → 提交 Release → 审批通过 → Production (生效)`。Staging 为可选的灰度中间态。

### 2.4 API 设计

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/agents` | 列表（支持分页、筛选） |
| POST | `/api/agents` | 创建 Agent |
| GET | `/api/agents/:id` | 获取 Agent 详情 + 当前配置 |
| PUT | `/api/agents/:id` | 更新 Agent 基本信息 |
| GET | `/api/agents/:id/config/:partition` | 获取指定分区配置 |
| PUT | `/api/agents/:id/config/:partition` | 更新指定分区配置（保存到 Draft） |
| POST | `/api/agents/:id/config/:partition/diff` | 获取分区 Diff |
| POST | `/api/agents/:id/submit-release` | 提交发布 |
| POST | `/api/agents/:id/rollback/:versionId` | 回滚到指定版本 |

---

## 3. Skills 插件化管理

### 3.1 Skill 数据模型

```prisma
model Skill {
  id              String   @id @default(cuid())
  name            String   @unique  // 全局唯一标识
  displayName     String            // 显示名称
  description     String            // 功能描述
  category        SkillCategory @default(GENERAL)
  
  // 触发与匹配
  triggerPatterns String[]          // 触发关键词/模式
  inputSchema     Json              // 输入参数 JSON Schema
  outputSchema    Json              // 输出结果 JSON Schema
  
  // 实现
  runtime         SkillRuntime @default(HTTP) // 运行时类型
  endpoint        String?           // HTTP 端点
  codeRef         String?           // 代码引用（内部 Skill）
  
  // 版本与依赖
  version         String   @default("1.0.0")  // 语义化版本
  dependencies    String[]          // 依赖的其他 Skill
  permissions     String[]          // 所需权限声明
  
  // 状态
  status          SkillStatus @default(DRAFT)
  publishedAt     DateTime?
  downloadCount   Int      @default(0)
  
  // 作者
  authorId        String
  authorName      String
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // 关联
  bindings        AgentSkillBinding[]
  versions        SkillVersion[]
  
  @@index([category, status])
  @@index([name])
}

enum SkillCategory {
  KNOWLEDGE_QUERY  // 知识检索类
  DATA_FETCH       // 数据获取类
  ACTION           // 动作执行类
  TRANSFORM        // 数据转换类
  GENERAL          // 通用
}

enum SkillRuntime {
  HTTP       // HTTP API 调用
  FUNCTION   // 内置函数
  MCP        // MCP 工具
  WORKFLOW   // 工作流
}

enum SkillStatus {
  DRAFT
  PUBLISHED
  DEPRECATED
  ARCHIVED
}

model SkillVersion {
  id          String   @id @default(cuid())
  skillId     String
  skill       Skill    @relation(fields: [skillId], references: [id])
  version     String
  changelog   String?
  snapshot    Json     // 完整 Skill 配置快照
  publishedAt DateTime @default(now())
  
  @@unique([skillId, version])
  @@index([skillId])
}
```

### 3.2 Skill 与 Agent 绑定

```prisma
model AgentSkillBinding {
  id          String   @id @default(cuid())
  agentId     String
  agent       Agent    @relation(fields: [agentId], references: [id])
  skillId     String
  skill       Skill    @relation(fields: [skillId], references: [id])
  
  // 绑定配置
  config      Json?    // Skill 专属配置覆盖
  enabled     Boolean  @default(true)
  priority    Int      @default(0)  // 优先级（冲突时取高优先级）
  
  // 权限约束
  allowedScopes String[] // Agent 授予该 Skill 的权限范围
  
  boundAt     DateTime @default(now())
  boundBy     String
  
  @@unique([agentId, skillId])
  @@index([agentId])
  @@index([skillId])
}
```

### 3.3 Skill 市场设计

**内置 Skill 模板分类**：

| 分类 | 示例 Skill | 描述 |
|------|-----------|------|
| 知识检索 | `wiki-search`, `wiki-deep-read` | Wiki 知识检索原语 |
| 数据查询 | `quota-check`, `instance-info` | 云产品数据查询 |
| 工单处理 | `ticket-classify`, `ticket-escalate` | 工单分类与升级 |
| 沟通辅助 | `response-format`, `tone-adjust` | 回答格式化与语气调整 |
| 诊断分析 | `log-analyze`, `error-diagnose` | 日志分析与错误诊断 |

**安装流程**：Skill 市场浏览 → 查看详情（输入/输出 Schema、权限要求）→ 一键安装到指定 Agent → 配置绑定参数 → 启用。

### 3.4 Skill 沙箱执行

```
Agent 推理层
  │  决定调用 Skill
  ▼
Skill Router
  │  检查 Skill 是否 enabled + 权限是否满足
  ▼
Skill Sandbox
  │  - 隔离的执行环境
  │  - 超时控制（继承 Agent toolsConfig.timeoutMs）
  │  - 资源限制（内存、CPU 时间）
  │  - 网络隔离（仅允许声明的端点）
  ▼
Skill 执行
  │  - 输入校验（对照 inputSchema）
  │  - 执行逻辑
  │  - 输出校验（对照 outputSchema）
  ▼
结果返回 Agent
```

---

## 4. Wiki 知识库管理系统

### 4.1 核心模型：基于 llm-wiki 的蒸馏态知识网

```prisma
model WikiVault {
  id          String   @id @default(cuid())
  name        String
  description String?
  
  // 关联
  agentId     String?  @unique
  agent       Agent?   @relation(fields: [agentId], references: [id])
  
  // Git 存储
  gitRepoUrl  String?  // Git 仓库地址
  gitBranch   String   @default("main")
  lastCommitSha String? // 最新 commit SHA
  
  // 统计
  pageCount   Int      @default(0)
  avgConfidence Float  @default(0.0)
  orphanCount Int      @default(0)
  
  // 共享
  isShared    Boolean  @default(false) // 是否为共享概念 Vault
  sharedBy    String?
  
  pages       WikiPage[]
  ingestJobs  WikiIngestJob[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([agentId])
  @@index([isShared])
}

model WikiPage {
  id          String   @id @default(cuid())
  vaultId     String
  vault       WikiVault @relation(fields: [vaultId], references: [id])
  
  // 内容
  title       String
  slug        String   // URL-safe 路径
  content     String   // Markdown 正文
  summary     String?  // 摘要（用于快速检索）
  
  // llm-wiki 质量元数据
  provenance  Provenance @default(EXTRACTED)
  lifecycle   PageLifecycle @default(DRAFT)
  tier        PageTier @default(SUPPORTING)
  baseConfidence Float @default(0.5)
  
  // 关联
  sourceRefs  Json     // 来源引用列表 [{type, id, description}]
  wikilinks   String[] // [[页面链接]] 列表
  categories  String[] // 分类标签
  tags        String[] // 自由标签
  
  // Git 追踪
  filePath    String   // 在 vault 中的文件路径
  lastCommitSha String?
  
  // 质量指标
  inboundLinks Int     @default(0) // 被引用次数
  outboundLinks Int    @default(0) // 引用其他页面次数
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  reviewedAt  DateTime?
  reviewedBy  String?
  
  @@unique([vaultId, slug])
  @@index([vaultId, lifecycle])
  @@index([vaultId, tier])
  @@index([vaultId, provenance])
}

enum Provenance {
  EXTRACTED   // 直接转述自源文档
  INFERRED    // LLM 推断
  AMBIGUOUS   // 来源存疑
  SYNTHESIZED // 跨页综合产出
}

enum PageLifecycle {
  DRAFT
  REVIEWED
  VERIFIED
  DISPUTED
  ARCHIVED
}

enum PageTier {
  CORE        // 承重页，高频更新
  SUPPORTING  // 默认
  PERIPHERAL  // 低连接，按需更新
}
```

### 4.2 Wiki 工作流引擎

将 wiki 操作封装为平台内可调用的标准工作流：

```prisma
model WikiIngestJob {
  id          String   @id @default(cuid())
  vaultId     String
  vault       WikiVault @relation(fields: [vaultId], references: [id])
  
  // 任务类型
  jobType     WikiJobType
  
  // 输入
  sourceType  String   // feedback / document / url / session
  sourceId    String?  // 关联的 Feedback ID 等
  sourceContent String? // 原始内容
  sourceUrl   String?  // URL 来源
  
  // 输出
  generatedPageIds String[] // 生成的页面 ID
  status      JobStatus @default(PENDING)
  result      Json?    // 执行结果详情
  error       String?
  
  // 执行
  startedAt   DateTime?
  completedAt DateTime?
  triggeredBy String
  
  createdAt   DateTime @default(now())
  
  @@index([vaultId, status])
  @@index([jobType, status])
}

enum WikiJobType {
  INGEST       // 蒸馏新源
  UPDATE       // 更新现有页面
  SYNTHESIZE   // 跨页综合
  LINT         // 健康检查
  DEDUP        // 去重
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}
```

**工作流调用方式**：

| 操作 | 触发方式 | 输入 | 输出 |
|------|---------|------|------|
| INGEST | 知识库 Tab "蒸馏新源" 按钮 / Feedback "蒸馏进知识库" | 原始文本/URL/Feedback ID | Draft 页面（1~N 个） |
| UPDATE | 页面编辑器内 "保存" | 页面 ID + 修改内容 | 更新后的页面 |
| SYNTHESIZE | 知识库 Tab "综合分析" 按钮 | 可选主题/页面范围 | Synthesis 页面 |
| LINT | 知识库 Tab "健康检查" 按钮 | Vault ID | Lint 报告（孤立页、断链、矛盾） |
| DEDUP | 知识库 Tab "去重" 按钮 | Vault ID | 重复页面列表 + 合并建议 |

### 4.3 跨 Vault 知识共享

**SharedConceptPool 设计**：

```
Agent-A WikiVault          SharedConceptPool         Agent-B WikiVault
┌─────────────┐          ┌──────────────────┐       ┌─────────────┐
│ page-1      │─────────→│ [[quota-system]] │←──────│ page-x      │
│ page-2      │          │ [[aliyun-auth]]  │       │ page-y      │
│ page-3      │─────────→│ [[error-codes]]  │←──────│ page-z      │
└─────────────┘          └──────────────────┘       └─────────────┘
```

共享概念页标记为 `isShared=true` 的独立 WikiVault，各 Agent 的页面通过 `[[wikilinks]]` 引用。修改共享页需经过审批（防止一个产品组的修改影响其他产品组）。

### 4.4 Wiki 质量仪表板

| 指标 | 说明 | 健康阈值 |
|------|------|---------|
| 页面总数 | Vault 中活跃页面数量 | - |
| 平均 Confidence | 所有页面 baseConfidence 均值 | > 0.7 |
| 孤立页比例 | inboundLinks=0 的页面占比 | < 10% |
| Draft 页占比 | lifecycle=DRAFT 的页面占比 | < 20% |
| 断链数量 | 引用不存在的 [[wikilinks]] | 0 |
| 知识覆盖率 | Feedback 中"知识缺失"标签占比的倒数 | > 80% |
| 平均来源数 | 每页 sourceRefs 数量均值 | > 1.5 |

### 4.5 知识蒸馏 Pipeline（Feedback -> Wiki）

```
Feedback 记录（tag=knowledge_gap）
  │
  ▼
[产品组点击 "蒸馏进知识库"]
  │
  ▼
创建 WikiIngestJob (jobType=INGEST, sourceType=feedback)
  │
  ▼
蒸馏引擎处理
  │  1. 提取 Feedback 中的关键知识点
  │  2. 与现有 Wiki 页面做相似度匹配
  │  3. 决定：创建新页 or 更新现有页
  │  4. 生成 Markdown 内容 + 元数据
  ▼
产出 Draft 页面
  │  provenance=extracted, lifecycle=draft, tier=supporting
  ▼
产品组审阅
  │  - 编辑内容
  │  - 补充 [[wikilinks]]
  │  - 标记 lifecycle=reviewed
  ▼
随下次 Release 纳入 Version 快照
```

---

## 5. 反馈收集与处理机制

### 5.1 Feedback 扩展模型

```prisma
model Feedback {
  id          String   @id @default(cuid())
  agentId     String
  agent       Agent    @relation(fields: [agentId], references: [id])
  
  // 来源
  source      FeedbackSource @default(MANUAL)
  
  // 内容
  title       String              // 简短标题
  content     String              // 详细描述/会话片段
  sessionData Json?               // 完整会话数据（可选）
  rating      FeedbackRating      // 好/差/中性
  tags        FeedbackTag[]       // 标签（多选）
  severity    FeedbackSeverity @default(MINOR)
  
  // 处理状态
  status      FeedbackStatus @default(NEW)
  assignedTo  String?             // 分配给谁
  assignedAt  DateTime?
  resolvedAt  DateTime?
  resolvedBy  String?
  resolution  String?             // 解决方案描述
  
  // 关联
  releaseId   String?             // 关联的 Release（该反馈触发的改进）
  ingestJobId String?             // 关联的 Wiki 蒸馏任务
  
  // 分区归属（该反馈指向哪个配置分区）
  targetPartition ConfigPartition?
  
  // 提交人
  submittedBy String
  submittedAt DateTime @default(now())
  
  // 效果验证
  verifiedAt  DateTime?
  verifiedBy  String?
  verificationNote String?
  
  @@index([agentId, status])
  @@index([agentId, tags])
  @@index([submittedAt])
  @@index([severity, status])
}

enum FeedbackSource {
  MANUAL          // 手动录入
  API             // 自动采集
  SESSION_IMPORT  // 会话导入
  SYSTEM          // 系统自动生成（如工具调用失败）
}

enum FeedbackRating {
  POSITIVE
  NEGATIVE
  NEUTRAL
}

enum FeedbackTag {
  ANSWER_QUALITY    // 回答质量
  KNOWLEDGE_GAP     // 知识缺失
  TOOL_FAILURE      // 工具调用失败
  ROUTING_ERROR     // 路由错误
  HALLUCINATION     // 幻觉
  OUTDATED_INFO     // 信息过时
  TONE_ISSUE        // 语气问题
  INCOMPLETE        // 回答不完整
  OFF_TOPIC         // 答非所问
}

enum FeedbackSeverity {
  CRITICAL   // 严重错误，影响业务
  MAJOR      // 明显问题，影响体验
  MINOR      // 小问题
  SUGGESTION // 改进建议
}

enum FeedbackStatus {
  NEW        // 新提交
  TRIAGED    // 已分类
  ASSIGNED   // 已分配
  IN_PROGRESS // 处理中
  RESOLVED   // 已解决
  VERIFIED   // 已验证效果
  CLOSED     // 已关闭
  WONTFIX    // 不修复
}
```

### 5.2 Feedback 处理工作流

```
新 Feedback 进入
  │
  ▼
[自动处理层]
  │  1. NLP 自动标签分类（基于历史 Feedback 训练）
  │  2. 严重度评估（基于标签 + 关键词 + 历史模式）
  │  3. 相似 Feedback 聚合（检测同类问题）
  │  4. 自动分配（按 Agent 归属产品组）
  ▼
[产品组工作台]
  │  - 确认/修正自动分类
  │  - 设置优先级
  │  - 分析根因 → 关联到配置分区
  │  - 决定处理方式：
  │     ├─ 改 prompt → 标记 targetPartition=PROMPT
  │     ├─ 补知识 → 触发 Wiki INGEST + 标记 targetPartition=KNOWLEDGE
  │     ├─ 修工具 → 标记 targetPartition=TOOLS
  │     └─ 调路由 → 标记 targetPartition=ROUTING
  ▼
[改进执行]
  │  产品组编辑对应分区 → 提交 Release
  │  Feedback 关联到 Release
  ▼
[效果验证]（Release 审批通过后 7 天）
  │  - 系统自动对比改进前后指标
  │  - 推送效果报告给产品组
  │  - 产品组标记 verified / 需继续改进
  ▼
[关闭]
```

### 5.3 Feedback 聚合分析

**分析维度**：

```sql
-- 按 Agent + 标签 维度的趋势分析
SELECT
  agent_id,
  tag,
  DATE_TRUNC('week', submitted_at) AS week,
  COUNT(*) AS feedback_count,
  AVG(CASE WHEN rating = 'NEGATIVE' THEN 1.0 ELSE 0.0 END) AS negative_rate
FROM feedback
GROUP BY agent_id, tag, DATE_TRUNC('week', submitted_at)
ORDER BY week DESC;

-- 高复发问题识别（同一标签在同一 Agent 上反复出现）
SELECT
  agent_id,
  tag,
  COUNT(*) AS occurrence_count,
  COUNT(DISTINCT DATE_TRUNC('day', submitted_at)) AS active_days
FROM feedback
WHERE submitted_at > NOW() - INTERVAL '30 days'
GROUP BY agent_id, tag
HAVING COUNT(*) > 5
ORDER BY occurrence_count DESC;
```

---

## 6. 版本控制与回滚系统

### 6.1 Version 快照模型

```prisma
model AgentVersion {
  id          String   @id @default(cuid())
  agentId     String
  agent       Agent    @relation(fields: [agentId], references: [id])
  
  // 语义化版本
  version     String   // e.g. "1.4.0"
  major       Int
  minor       Int
  patch       Int
  
  // 完整配置快照
  promptSnapshot    Json
  knowledgeSnapshot Json    // { vaultCommitSha, pageCount, avgConfidence }
  toolsSnapshot     Json
  routingSnapshot   Json
  
  // 关联
  releaseId   String   @unique
  release     Release  @relation(fields: [releaseId], references: [id])
  
  // Wiki Vault 状态指针
  wikiCommitSha String?  // Git commit SHA
  
  // 元数据
  publishedAt DateTime @default(now())
  publishedBy String
  changeNote  String   // 改进说明
  
  // 效果数据（发布后填充）
  effectivenessReport Json?
  
  @@unique([agentId, version])
  @@index([agentId, publishedAt])
}
```

### 6.2 快照策略

**MVP（全量快照）**：每次发布完整存储四分区配置。简单可靠，适合初期。

**后续优化（增量快照）**：

```
Version v1.0.0 → 完整快照（base）
Version v1.0.1 → { baseVersion: "v1.0.0", diff: { prompt: "...changed..." } }
Version v1.1.0 → { baseVersion: "v1.0.1", diff: { tools: "...changed..." } }
```

按需重建：从最近的 base version 开始，逐层应用 diff。

### 6.3 Wiki Vault 版本化

基于 Git 的版本追踪：

```
每次 Release 审批通过：
  1. 将 Wiki Vault 当前状态 commit 到 Git
  2. 打 tag：agent-{agentId}/v{version}
  3. 记录 commit SHA 到 AgentVersion.wikiCommitSha

回滚时：
  1. git checkout {wikiCommitSha}
  2. 恢复 Vault 到该 commit 状态
  3. 创建新的 commit（标记为 rollback）
```

### 6.4 回滚机制

**三级回滚**：

| 级别 | 操作 | 实现 |
|------|------|------|
| Agent 级 | 一键回退到任意历史 Version | 恢复四分区完整快照 + Wiki vault checkout |
| 分区级 | 仅回滚 prompt / knowledge / tools / routing 之一 | 恢复该分区快照，创建新的 Release |
| Wiki 页面级 | 回滚单个 Wiki 页面 | `git checkout {sha} -- {filePath}` |

**回滚安全机制**：
- 回滚前自动生成当前配置的快照（防止回滚后丢失当前状态）
- 回滚操作本身生成一条 Release 记录（需审批或直接执行，可配置）
- 回滚后通知所有相关人员

### 6.5 版本对比（Diff View）

```
选择两个 Version (vA, vB)
  │
  ▼
逐分区 Diff 展示
  ├─ Prompt: 文本 diff（左右对比，高亮变更行）
  ├─ Knowledge: 页面增删改统计 + 逐页 diff
  ├─ Tools: 工具配置 JSON diff
  └─ Routing: 路由规则 JSON diff
  
附加信息：
  - 两个版本间的 Feedback 数量与分布
  - 两个版本间的 Release 记录
  - 改进效果指标对比
```

---

## 7. 多角色权限管理体系

### 7.1 角色定义（6 角色模型）

| 角色 | 英文标识 | 描述 |
|------|---------|------|
| 平台管理员 | `PLATFORM_ADMIN` | 工单团队，最高权限 |
| 产品组负责人 | `PRODUCT_LEAD` | 产品组管理者，可审批本组 Release |
| 产品组成员 | `PRODUCT_MEMBER` | 产品组普通成员，编辑配置 |
| Skill 开发者 | `SKILL_DEVELOPER` | 上传/管理 Skill |
| 知识编辑者 | `KNOWLEDGE_EDITOR` | 仅编辑 Wiki 知识 |
| 审计员 | `AUDITOR` | 只读 + 审计日志 |
| CRE（只读） | `CRE_VIEWER` | 查看反馈，提交 Feedback |

### 7.2 权限模型：RBAC + 资源级 ACL

```prisma
model Role {
  id          String   @id @default(cuid())
  name        String   @unique
  displayName String
  description String?
  isSystem    Boolean  @default(false) // 系统内置角色不可删除
  
  permissions RolePermission[]
  members     UserRole[]
}

model Permission {
  id          String   @id @default(cuid())
  resource    String   // agent / wiki_vault / skill / feedback / release / audit_log
  action      String   // read / write / publish / approve / rollback / delete / admin
  description String?
  
  roles       RolePermission[]
}

model RolePermission {
  roleId       String
  role         Role       @relation(fields: [roleId], references: [id])
  permissionId String
  permission   Permission @relation(fields: [permissionId], references: [id])
  
  @@id([roleId, permissionId])
}

model UserRole {
  userId         String
  roleId         String
  role           Role    @relation(fields: [roleId], references: [id])
  productGroupId String? // 限定在哪个产品组（null = 全局）
  
  assignedAt     DateTime @default(now())
  assignedBy     String
  
  @@id([userId, roleId, productGroupId])
}
```

### 7.3 权限矩阵

| 资源 | 操作 | PLATFORM_ADMIN | PRODUCT_LEAD | PRODUCT_MEMBER | SKILL_DEV | KNOWLEDGE_EDITOR | AUDITOR | CRE_VIEWER |
|------|------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Agent | read | global | own_group | own_group | - | - | global | - |
| Agent | write | global | own_group | own_group | - | - | - | - |
| Agent | publish | global | own_group | - | - | - | - | - |
| Agent | approve | global | - | - | - | - | - | - |
| Agent | rollback | global | own_group | - | - | - | - | - |
| Wiki | read | global | own_group | own_group | - | own_group | global | - |
| Wiki | write | global | own_group | own_group | - | own_group | - | - |
| Skill | read | global | global | global | global | - | global | - |
| Skill | write | global | - | - | global | - | - | - |
| Feedback | read | global | own_group | own_group | - | - | global | own_group |
| Feedback | write | global | own_group | own_group | - | - | - | global |
| Release | approve | global | - | - | - | - | - | - |
| AuditLog | read | global | - | - | - | - | global | - |

### 7.4 审计日志

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  
  // 操作信息
  action      String   // e.g. "agent.config.update", "release.approve", "version.rollback"
  resource    String   // 资源类型
  resourceId  String   // 资源 ID
  details     Json?    // 操作详情
  
  // 操作人
  userId      String
  userName    String
  userRole    String
  
  // 上下文
  ipAddress   String?
  userAgent   String?
  
  createdAt   DateTime @default(now())
  
  // 不可篡改：无 update/delete 操作
  
  @@index([resource, resourceId])
  @@index([userId, createdAt])
  @@index([action, createdAt])
  @@index([createdAt])
}
```

---

## 8. 持续改进工作流程

### 8.1 完整工作流总览

```
┌────────────────────────────────────────────────────────────────┐
│                    Agent 持续改进工作流                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    │
│  │  收集   │───→│  分析   │───→│  改进   │───→│  发布   │    │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘    │
│       │              │              │              │           │
│  Feedback 录入   自动分类       编辑配置       提交 Release     │
│  会话日志导入    优先级排序     Draft 自测     审批流程         │
│  系统异常捕获    根因分析       分区修改       灰度发布         │
│                   关联聚合                    效果验证          │
│                                                                │
│  ┌─────────┐                                                   │
│  │  沉淀   │←──── 改进效果报告 + 知识蒸馏                       │
│  └─────────┘                                                   │
│  改进经验入库                                                    │
│  L3 跨 Agent 洞察                                               │
│  进化趋势分析                                                    │
└────────────────────────────────────────────────────────────────┘
```

### 8.2 改进看板（Kanban）

```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│  待处理   │  分析中   │  改进中   │  审批中   │  已验证   │
│  (New)   │(Triaged) │(Assigned)│(Release) │(Verified)│
├──────────┼──────────┼──────────┼──────────┼──────────┤
│ F-001    │ F-003    │ F-005    │ R-012    │ R-011    │
│ F-002    │ F-004    │ F-006    │          │ R-010    │
│          │          │          │          │          │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

每个卡片展示：Feedback 标题、标签、严重度、关联 Agent、负责人、处理时长。

### 8.3 改进效果度量

**自动效果报告**（发布后第 7 天生成）：

```json
{
  "versionId": "v1.4.0",
  "baselineVersionId": "v1.3.0",
  "reportGeneratedAt": "2026-07-13T10:00:00Z",
  "observationWindow": "7d",
  "metrics": {
    "positiveRate": {
      "before": 0.72,
      "after": 0.85,
      "delta": +0.13,
      "trend": "improved"
    },
    "negativeRate": {
      "before": 0.18,
      "after": 0.08,
      "delta": -0.10,
      "trend": "improved"
    },
    "targetTagRecurrence": {
      "tag": "KNOWLEDGE_GAP",
      "before": 12,
      "after": 3,
      "delta": -9,
      "trend": "improved"
    },
    "escalationRate": {
      "before": 0.15,
      "after": 0.10,
      "delta": -0.05,
      "trend": "improved"
    }
  },
  "overallVerdict": "POSITIVE",
  "recommendation": "改进效果显著，建议保持当前版本"
}
```

### 8.4 改进报告与知识沉淀

每次成功改进自动生成总结：

- **改进摘要**：改了什么、为什么改、效果如何
- **经验标签**：改进类型（prompt 优化/知识补充/工具修复/路由调整）
- **可复用模式**：抽象出可复用的改进模式（如"增加具体数字到 prompt 减少幻觉"）

这些总结可被 `wiki-ingest` 蒸馏为组织知识页面，供所有产品组参考。

---

## 9. 技术架构

### 9.1 系统分层架构

```
┌─────────────────────────────────────────────────────────┐
│                    表现层 (Presentation)                   │
│  Next.js App Router + React Server Components             │
│  Tailwind CSS + shadcn/ui                                 │
│  响应式设计，角色自适应 UI                                  │
├─────────────────────────────────────────────────────────┤
│                    应用层 (Application)                    │
│  Server Actions + Route Handlers                          │
│  - Agent 配置管理                                          │
│  - Feedback 处理工作流                                     │
│  - Release 审批流                                          │
│  - Wiki 工作流引擎                                         │
│  - Skill 注册中心                                          │
│  - 改进看板与效果度量                                       │
├─────────────────────────────────────────────────────────┤
│                    领域层 (Domain)                          │
│  - Agent Config Service (配置 CRUD + Diff)                │
│  - Version Service (快照 + 回滚)                           │
│  - Feedback Service (收集 + 分类 + 分析)                   │
│  - Release Service (审批 + 发布)                           │
│  - Wiki Service (Vault 管理 + 蒸馏 Pipeline)              │
│  - Skill Service (注册 + 绑定 + 沙箱)                      │
│  - Auth Service (认证 + RBAC + 审计)                       │
├─────────────────────────────────────────────────────────┤
│                    基础设施层 (Infrastructure)              │
│  PostgreSQL (Prisma ORM)    Git (Wiki Vault 存储)          │
│  NextAuth.js (认证)         S3 (快照 + 附件)               │
│  PostgreSQL FTS (搜索)      Docker + K8s (部署)            │
└─────────────────────────────────────────────────────────┘
```

### 9.2 数据流图

```
[用户/CRE]
    │ 工单互动
    ▼
[L1 Agent 运行时] ──── 会话日志 ──→ [S3 存储]
    │                                    │
    │ 评分/转人工                           │ 采集 Pipeline
    ▼                                    ▼
[Feedback 手动录入] ──────────→ [Feedback Service]
                                    │
                          ┌─────────┼─────────┐
                          ▼         ▼         ▼
                    [自动分类]  [聚合分析]  [L3 洞察]
                          │         │         │
                          ▼         ▼         ▼
                   [产品组工作台]  [趋势报告]  [进化建议]
                          │
                          ▼
                   [配置编辑 (Draft)]
                          │
                          ▼
                   [提交 Release]
                          │
                          ▼
                   [工单团队审批]
                          │
                    ┌─────┴─────┐
                    ▼           ▼
                [通过]       [驳回]
                    │           │
                    ▼           ▼
             [Version 快照]  [打回修改]
                    │
                    ▼
             [灰度发布]
                    │
                    ▼
             [效果验证] ──→ [改进报告] ──→ [知识沉淀]
```

### 9.3 技术选型清单

| 层次 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 框架 | Next.js | 15.x | 全栈框架，App Router |
| 语言 | TypeScript | 5.x | 类型安全 |
| UI | Tailwind CSS + shadcn/ui | 4.x / latest | 组件库 |
| ORM | Prisma | 6.x | 数据库 ORM + 迁移 |
| 数据库 | PostgreSQL | 16 | 主数据存储 |
| 认证 | NextAuth.js | 5.x | OAuth / 凭证认证 |
| 校验 | Zod | 3.x | 输入输出校验 |
| Git 操作 | simple-git | 3.x | Wiki Vault 版本管理 |
| 搜索 | PostgreSQL FTS | built-in | 全文搜索（MVP） |
| Monorepo | Turborepo + pnpm | latest | 多包管理 |
| 容器 | Docker + Docker Compose | latest | 开发环境 |
| 部署 | K8s / Docker | - | 生产部署 |

### 9.4 部署架构

```
┌─────────────────────────────────────────────┐
│              Load Balancer                    │
│         (Nginx / Cloud LB)                   │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────┐    ┌─────────────┐        │
│  │  Next.js    │    │  Next.js    │        │
│  │  Instance 1 │    │  Instance 2 │        │
│  └──────┬──────┘    └──────┬──────┘        │
│         │                  │                │
├─────────┴──────────────────┴────────────────┤
│                                             │
│  ┌───────────┐  ┌────────┐  ┌───────────┐ │
│  │PostgreSQL │  │  Redis  │  │    S3     │ │
│  │  (主从)   │  │ (缓存)  │  │ (文件存储) │ │
│  └───────────┘  └────────┘  └───────────┘ │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │        Git Repos (Wiki Vaults)         │  │
│  │   (Gitea / Gogs / 文件系统 bare repo)  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## 10. 项目目录结构

```
agent-up/
├── docs/superpowers/specs/
│   ├── 2026-07-06-agent-improvement-platform-mvp-design.md
│   └── 2026-07-06-agent-improvement-platform-extended-design.md
│
├── apps/
│   └── web/                              # Next.js 全栈应用
│       ├── app/
│       │   ├── layout.tsx                # 根布局
│       │   ├── page.tsx                  # 首页/登录
│       │   ├── (auth)/
│       │   │   ├── login/page.tsx
│       │   │   └── register/page.tsx
│       │   ├── (dashboard)/
│       │   │   ├── layout.tsx            # 仪表板布局（侧边栏）
│       │   │   ├── page.tsx              # 仪表板首页
│       │   │   ├── agents/
│       │   │   │   ├── page.tsx          # Agent 列表
│       │   │   │   └── [id]/
│       │   │   │       ├── page.tsx      # Agent 配置中心
│       │   │   │       ├── prompt/       # Prompt Tab
│       │   │   │       ├── knowledge/    # 知识库 Tab
│       │   │   │       ├── tools/        # 工具 Tab
│       │   │   │       └── routing/      # 路由 Tab
│       │   │   ├── feedback/
│       │   │   │   ├── page.tsx          # 反馈中心
│       │   │   │   └── [id]/page.tsx     # 反馈详情
│       │   │   ├── releases/
│       │   │   │   ├── page.tsx          # 发布审批列表
│       │   │   │   └── [id]/page.tsx     # Release 详情
│       │   │   ├── versions/
│       │   │   │   └── [agentId]/page.tsx # 版本历史
│       │   │   ├── skills/
│       │   │   │   ├── page.tsx          # Skill 市场
│       │   │   │   └── [id]/page.tsx     # Skill 详情
│       │   │   └── settings/
│       │   │       ├── page.tsx          # 设置首页
│       │   │       ├── groups/           # 产品组管理
│       │   │       ├── roles/            # 角色管理
│       │   │       └── audit/            # 审计日志
│       │   └── api/
│       │       ├── agents/route.ts
│       │       ├── agents/[id]/route.ts
│       │       ├── agents/[id]/config/[partition]/route.ts
│       │       ├── agents/[id]/submit-release/route.ts
│       │       ├── agents/[id]/rollback/[versionId]/route.ts
│       │       ├── feedback/route.ts
│       │       ├── feedback/[id]/route.ts
│       │       ├── releases/route.ts
│       │       ├── releases/[id]/approve/route.ts
│       │       ├── skills/route.ts
│       │       ├── wiki/vaults/route.ts
│       │       ├── wiki/vaults/[id]/pages/route.ts
│       │       ├── wiki/vaults/[id]/ingest/route.ts
│       │       └── auth/[...nextauth]/route.ts
│       ├── components/
│       │   ├── ui/                       # shadcn/ui 组件
│       │   ├── agent/                    # Agent 相关组件
│       │   │   ├── config-tabs.tsx
│       │   │   ├── prompt-editor.tsx
│       │   │   ├── knowledge-browser.tsx
│       │   │   ├── tools-table.tsx
│       │   │   └── routing-rules.tsx
│       │   ├── feedback/
│       │   │   ├── feedback-form.tsx
│       │   │   ├── feedback-list.tsx
│       │   │   └── feedback-detail.tsx
│       │   ├── release/
│       │   │   ├── release-form.tsx
│       │   │   ├── release-review.tsx
│       │   │   └── diff-viewer.tsx
│       │   ├── version/
│       │   │   ├── version-timeline.tsx
│       │   │   └── version-diff.tsx
│       │   ├── wiki/
│       │   │   ├── vault-browser.tsx
│       │   │   ├── page-editor.tsx
│       │   │   └── quality-dashboard.tsx
│       │   ├── skills/
│       │   │   ├── skill-card.tsx
│       │   │   └── skill-marketplace.tsx
│       │   └── layout/
│       │       ├── sidebar.tsx
│       │       ├── header.tsx
│       │       └── breadcrumb.tsx
│       ├── lib/
│       │   ├── auth.ts                   # NextAuth 配置
│       │   ├── prisma.ts                 # Prisma 客户端
│       │   ├── validators/               # Zod schemas
│       │   └── utils.ts
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── public/
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── ui/                               # 共享 UI 组件
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── db/                               # 数据库客户端 + 类型
│   │   ├── src/
│   │   │   ├── client.ts                 # Prisma 客户端单例
│   │   │   └── types.ts                  # 导出类型
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/                           # 共享类型 + 常量
│       ├── src/
│       │   ├── types/
│       │   │   ├── agent.ts
│       │   │   ├── feedback.ts
│       │   │   ├── release.ts
│       │   │   ├── skill.ts
│       │   │   └── wiki.ts
│       │   ├── constants.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── package.json                          # Monorepo root
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.json                         # Root tsconfig
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## 11. 实施路线图

### Phase 1: MVP 核心（4~6 周）

| 周次 | 目标 | 交付物 |
|------|------|--------|
| W1 | 项目初始化 + 认证 + 基础布局 | 可登录的空壳应用 |
| W2 | Agent CRUD + 四分区配置编辑 | Agent 配置中心页面 |
| W3 | Feedback 录入 + 列表 + Wiki 基础浏览 | 反馈中心 + 知识库 Tab |
| W4 | Release 提交 + 审批 + Version 快照 | 完整发布流程 |
| W5 | 版本历史 + 回滚 + 权限隔离 | 版本管理 + 三角色权限 |
| W6 | 联调 + Bug 修复 + 内部试用 | MVP 上线 |

### Phase 2: 增强（4 周）

- Skills 插件化管理
- Wiki 工作流引擎（ingest/update/synthesize/lint）
- 改进看板 + 效果度量
- 灰度发布

### Phase 3: 智能化（4 周）

- L1 自动数据采集管道
- L3 跨 Agent 洞察
- 自动蒸馏 Pipeline
- NLP 辅助 Feedback 分类

### Phase 4: 规模化（持续）

- 多租户支持
- 开放 API
- Skill 生态市场
- 进化趋势预测
