# 故障排查手册

> 维护日期：2026-08-26 · 收录已实际遇到并解决的问题，按「症状 → 原因 → 修复」组织。
> 新增问题时请同步补充本手册与 [MiMo 交付报告](../reports/2026-08-25-mimo-llm-integration-delivery.md) 的踩坑记录。

## 一、LLM 相关

### 1. LLM 端点返回 503「LLM 未配置」

- **原因**：`MIMO_API_KEY` 未配置，或配置在了**根目录** `.env`。Next.js 只加载 `apps/web/` 目录下的 `.env`，不向上遍历 monorepo 根。
- **修复**：把 `MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_MODEL` 写入 `apps/web/.env`，重启 dev server；确认启动日志出现 `Environments: .env`。

### 2. LLM 端点返回 502「模型返回空内容」

- **原因**：MiMo 是推理模型，`reasoning_content` 消耗 completion tokens；`max_completion_tokens` 不足时 `content` 为空。
- **修复**：网关默认已给 2048；自定义调用时不要设得过小（探针类短请求至少 1024）。

### 3. LLM 端点返回 502「上游错误（HTTP 4xx/5xx）」

- **原因**：Key 无效 / 套餐过期 / 触发限流（RPM 100）。`details.status` 携带上游真实状态码。
- **修复**：401 → 检查 Key 与 Base URL 是否同属 Token Plan（`tp-` Key 与按量 `sk-` 不可混用）；429 → 降频或加重试退避；套餐到期 → 控制台续费。

### 4. LLM 调用 504 超时

- **原因**：推理模型长思考超过默认 120s，或现场网络不通 `token-plan-cn.xiaomimimo.com`。
- **修复**：先 `curl` 验证连通；确属慢思考可按调用方传 `timeoutMs` 上调。

## 二、开发与运行

### 5. 新增 API route 后访问 404 "Not Found"

- **原因**：运行中的 dev server 是新增路由文件之前启动的旧进程。
- **修复**：`lsof -ti :3000 | xargs kill` 后重新 `pnpm dev`。

### 6. 环境变量改了但不生效

- **原因**：Next.js 启动时读取 env，热更新不会重载 `.env`。
- **修复**：重启 dev server（同 #5）。

### 7. `pnpm lint --format json` 输出无法解析

- **原因**：pnpm 会在输出前附加自己的 header 行。
- **修复**：使用 `pnpm --silent lint --format json`。

### 8. lint 报 `react/jsx-key`，但 Table 组件内部已统一赋 key

- **原因**：规则无法跨函数边界追踪（`<Table rows={[...]}>` 静态数组里的 JSX 由 Table 内部渲染并赋 key），属误报。
- **修复**：沿用现有惯例——文件级 `/* eslint-disable react/jsx-key */` + 注释说明理由（见架构页与 `/maas` 页）。

### 9. lint 报 `react-hooks/set-state-in-effect`（多行 effect）

- **原因**：`eslint-disable-next-line` 只作用于紧邻一行，effect 体内的 setState 在后续行。
- **修复**：单行 effect 用 next-line 豁免；多行 effect 用块级 `/* eslint-disable */ ... /* eslint-enable */` 或确认无级联风险后按现有注释惯例处理。

## 三、测试

### 10. 测试「曾经通过，某天突然失败」且与日期相关

- **原因**：时间炸弹 fixture——硬编码「近期」日期（如 `publishedAt: "2026-08-04"` 配 7 天窗口），真实时间越过窗口后语义反转。
- **修复**：fixture 改用相对日期 `new Date(Date.now() - n * 86400000).toISOString()`；纯逻辑测试显式注入 `{ now }`。参考 `effectiveness.test.ts`。

### 11. 测试会真实调用 LLM / 烧 tokens 吗？

- **不会**。所有 LLM 测试统一 `vi.stubGlobal("fetch", ...)` mock；vitest 也不加载 `.env`（测试内显式设置 `tp-test` 假 key）。

## 四、浏览器自动化

### 12. mermaid 重页面（`/maas`、架构页）截图 / 点击超时

- **原因**：mermaid SVG 渲染重，`take_screenshot` / `click` 的 15s 上限不够。
- **修复**：用 `take_snapshot` 验证 DOM 内容（证据等效）；交互用 `evaluate_script` 直接触发按钮并轮询结果。

### 13. 杀掉 dev server 后浏览器 tab 变 about:blank

- **原因**：页面进程随 server 断开。
- **修复**：重启 server 后重新 navigate。

## 五、数据

### 14. 数据库连接失败 / 页面报数据不可用

- **原因**：PostgreSQL 未启动，或未执行迁移与种子。
- **修复**：`docker compose up -d postgres` → `pnpm db:migrate` → `pnpm db:seed`；确认 `apps/web/.env` 的 `DATABASE_URL` 指向该实例后重启 dev server。

### 15. 开发数据被误改想还原

- **修复**：`pnpm db:seed` 重建演示数据（种子脚本先清空业务表再灌入，可重复执行）；测试经 `_resetDb` 清库隔离，不会污染开发数据。
