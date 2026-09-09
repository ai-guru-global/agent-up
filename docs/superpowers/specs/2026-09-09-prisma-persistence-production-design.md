# Prisma + PostgreSQL 持久化落地设计（生产化子项目 1/3）

> **状态**：Approved（设计经用户确认，2026-09-09；实施待启动）
> **版本**：v1.0（2026-09-09 定稿）
> 日期：2026-09-09
> 背景：整体评估确认平台当前为「文件即数据库」运行形态（`lib/data/store.ts` JSON 全量覆盖写），
> 存在并发写无保护、不支持多实例、数据量增长不可持续三项生产化硬伤。
> Prisma schema（625 行 / 30 模型）自 MVP 期就绪但未接线，且落后于 2026-09 运行时形状。
> 用户决策：生产化按「持久化 → 认证 → 部署」三子项目推进，本 spec 只覆盖持久化。
> 部署目标未定，方案按部署无关设计（标准 `DATABASE_URL`，本机 docker-compose，CI 服务容器）。

## 一、目标与非目标

**目标**：

1. 运行时存储整体从 JSON 文件切换到 PostgreSQL 16（Prisma 6.10）
2. 读-改-写热点获得事务与并发保护
3. 测试与 CI 跑真实 Postgres
4. 种子数据幂等导入（`pnpm db:seed`）
5. 删除 JSON store 及其全部配套（`store.ts`、`_setDataDir`、`apps/web/data/`）

**非目标（YAGNI / 后续子项目）**：

- 认证与 RBAC（子项目 2）；actor 仍走现有 `lib/context.ts` 请求头装配
- 部署运维基线（子项目 3）：Docker 镜像、备份、监控均不在本 spec
- demo 静态导出：内存 mock 形态不变，与本子项目正交
- API 响应形状任何变更（响应 JSON 逐字段保持现状）
- 多 Provider LLM、检索接线、L1 自动沉淀等功能性演进

## 二、架构与边界

数据流变为：页面 → API 路由 → **服务层 → PrismaClient → PostgreSQL**。

三条不变量：

1. **服务层公开签名不变**，路由层零改动，API 契约不变
2. **四条全层契约不变**（AppError 体系 / actor 从 context 取 / 审计 fire-and-forget / 存储统一收口）
   ——收口点从 `store.ts` 变为 PrismaClient；「新代码不得新增绕过存储的例外」约束继续生效，
   且借迁移消灭 wiki-service 与 retrieval-service 两处既存 fs 直读例外
3. **API 形状兼容**：DB 内用 `DateTime`，服务层在边界转回 ISO 字符串，响应形状不变

基建：`packages/db/src/index.ts` 导出 PrismaClient 单例（dev 热重载以 globalThis 缓存防多实例），
`apps/web` 增加对 `@agent-up/db` 的依赖。

## 三、Schema 对齐决策（先改 schema 再接线）

| 项 | 决策 |
|---|---|
| 新增 `Trace` 模型 | 对齐 2026-09 运行时形状：agentId / systemPrompt / history(Json) / message / reply / model / usage(Json) / latencyMs / rating / ratedAt / note |
| 新增 `EvalCase` 模型 | agentId / sourceTraceId / title / expectation / systemPrompt / history(Json) / message / referenceReply / status |
| `Release` 扩展 | 新增 `aiReview Json?` 存发布前 AI 评测结果块 |
| Skill 绑定漂移 | 运行时「内嵌于 agent 记录」改为采用已有 `AgentSkillBinding` 关系表——绑定成为一等实体，可查询、可审计 |
| Wiki 物理嵌套目录漂移 | 落为 `WikiVault` / `WikiPage` 行 + vaultId 外键；「物理删除」语义保留为级联删除（wiki 全层唯一物理删除操作） |
| settings 漂移 | `settings/` 四 JSON 映射到已有 `AuditLog` / `Permission` / `ProductGroup` / `Role` 模型 |
| ID 策略 | 保持 String 主键、应用侧 `generateId()`（crypto.randomUUID）；种子 slug（`ecs-assistant` 等）原样保留，URL 与 GTM 案例口径不破 |
| 自由形状字段 | `history` / `usage` / `sessionData` 等运行时任意 JSON 用 `Json` 列 |

漂移裁决原则：各批次实施时逐服务核对 schema 字段 vs 运行时形状，**发现漂移以运行时为准修 schema**
（运行时是现行事实标准，schema 是 2026-07 的前瞻设计）。

## 四、迁移批次（每批出口条件：测试全绿 + lint 绿）

| 批 | 内容 | 说明 |
|---|---|---|
| 0 | 基建 | schema 对齐产出首个 migration；docker-compose 起 PG；`_resetDb()`（清库+灌种子）与 `_setDataDir` 并存；CI 增加 postgres:16 service 容器 |
| 1 | settings 四集合 + audit-service | 小而独立，先打通「服务层换 Prisma」的标准模式 |
| 2 | feedback / skills / wiki / retrieval | 顺手消灭两处 fs 直读例外 |
| 3 | agent-service | 最大单批：四分区 1:1 配置表 + 草稿 + config-changes + 绑定写侧迁关系表 |
| 4 | release / versions / effectiveness + trace / eval-case / ai-review | 发布链迁移；后三者为新模型，直接生在 Prisma 上 |
| 5 | 收尾 | `pnpm db:seed` 幂等导入；种子 JSON 迁至 `packages/db/seed/`（数据属于 DB 层）；删除 `store.ts` / `_setDataDir` / `apps/web/data/`；README / GTM / ci.yml 口径同步 |

每迁一个服务，对应测试文件的 setup 从 `_setDataDir` 切到 `_resetDb`。

## 五、并发与事务

- 读-改-写热点（提交发布算 SemVer / 审批生成快照 / 反馈状态机流转 / 草稿保存）包进
  `prisma.$transaction`，优先「条件更新 + 唯一约束」实现，冲突抛 `ConflictError(409)`
  ——与现有「重复审批 409」语义天然一致
- 审计从单文件 append 变为 `AuditLog` 表插入；fire-and-forget 语义保留（契约 3），并发安全随之解决
- Agent name / Skill name 等按运行时现状补 `@unique`（逐批核对）

## 六、错误处理映射

| Prisma 错误 | 映射 | 备注 |
|---|---|---|
| P2025 记录不存在 | `NotFoundError` 404 | 替代现有「查不到返回 null」路径 |
| P2002 唯一冲突 | `ConflictError` 409 | |
| P2003 外键约束 | `ValidationError` 422 | |
| 连接失败 | AppError 503 INTERNAL | 与 LLM 未配置 503 风格一致 |

「数据文件损坏」错误路径随文件消失，对应 store 单测改为连接错误映射断言。

## 七、测试策略

- **行为测试全部保留、断言不变**（251 个中的 250 个：21 个服务/API 测试文件 + 除 store 外的单测文件），仅替换 setup；真库 = 本机 docker-compose（postgres:16 已在 compose 文件中），CI = GitHub Actions services 容器
- **例外**：`store.test.ts` 测的是将被删除的 JSON 实现，批 5 随 `store.ts` 一并移除，替换为 Prisma 错误映射（P2025/P2002/P2003/连接失败）的单测
- 隔离粒度：**每个 vitest worker 独立数据库**（全局 setup 按 worker 建 `test_<n>` 库），库内 truncate + 灌种子，并行不串台
- 新增少量基建测试：seed 脚本幂等性、`_resetDb` 后种子齐全
- 预期套件耗时 26s → 1~2 分钟，可接受；CI timeout 15 分钟够用

## 八、验收标准

1. `pnpm dev` / `pnpm test` / `pnpm build` / CI 全绿（测试跑真实 PG）
2. `pnpm db:seed` 幂等，可随时重置演示数据
3. `store.ts`、`_setDataDir`、`apps/web/data/` 删除；wiki / retrieval fs 例外消灭
4. 文档口径同步：README（技术栈 / 架构图 / FAQ / MOCK 声明数据源条目）、GTM 事实口径表、ci.yml 过期注释
5. 交付报告按仓库规范落 `docs/reports/YYYY-MM-DD-prisma-persistence-delivery.md`

## 九、风险与缓解

| 风险 | 缓解 |
|---|---|
| schema 与运行时存在未知字段级漂移 | 每批「以运行时为准修 schema」；251 个行为测试批内立即暴露不一致 |
| 测试套件变慢影响迭代 | worker 级数据库隔离 + truncate；慢了再谈（不为速度预优化） |
| 迁移中途 JSON / Prisma 双轨并存期行为漂移 | 服务间彼此独立、每批出口全量测试绿；批 5 一次性删除 JSON 路径 |
| demo 静态导出受影响 | demo 走内存 mock + fetch 拦截，与存储层正交；批 5 后跑一次 build:demo 验证 |

## 十、不做（YAGNI）

不引入 Prisma 之外的 ORM/查询构建器；不做读写分离、连接池调优（PgBouncer 等，单实例用不着）；
不做 JSON/Prisma 双轨长期共存开关；不改任何 API 路由与响应形状；不动认证（下一子项目）。
