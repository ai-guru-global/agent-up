# agent-up 反馈收集器（Chrome 插件 · PoC）

> 在 Agent 试聊/客服场景一键沉淀反馈，自动携带会话上下文，直落 agent-up 反馈池。
> 定位：补全「反馈 → AI 归因 → 改配置 → 审批发布 → 效果报告」闭环的 **L1 入口**——
> 客服不需要离开工作页面去后台敲反馈，点一下扩展图标就完成一次带证据的提交。

本插件是**演示 PoC**：纯静态 Manifest V3，零构建、零依赖、**不改 agent-up 主仓库任何代码**
（提交走页面内同源 fetch，无 CORS 问题）。所有对外口径与诚实边界见文末。

---

## 它能演示什么

| 步骤 | 动作 | 结果（真实） |
|------|------|--------------|
| 1 | 客服在 Agent 详情页「试聊 Playground」处理工单（真实 LLM 调用） | 一轮真实对话 |
| 2 | 点扩展图标 → 评级/严重度/类型/正文 → 提交 | 反馈 + 最近 6 轮对话证据写入 `POST /api/feedback` |
| 3 | 到反馈中心查看 | 新条目（NEW）出现在列表：标题 / 正文 / Agent / 严重度齐全，提交身份已写入审计（cre-zhang） |
| 4 | 对这条反馈跑 AI 归因 / 改分区配置 / 提交发布审批 | 走完整个改进闭环 |

关键叙事点：**反馈自带证据**（来源 `via=chrome-extension`、页面 URL、捕获时间、对话原文），
归因与审批不再依赖客服复述——这正是 L1 trace 回流设计的入口形态。

## 目录结构

```
chrome-extension/
├── manifest.json     # MV3：action + content_scripts（仅注入 localhost:3000）
├── popup.html/.css/.js  # 收集表单 UI（弹窗本身是扩展 origin，不做任何网络请求）
├── content.js        # 页面内逻辑：读取对话证据 + 以页面同源身份提交
└── icons/
    ├── icon.svg      # 图标源（可维护）；渲染命令见文件头注释
    └── icon16/32/48/128.png
```

## 架构与安全边界

```
popup（扩展 origin，纯 UI）
  │  chrome.tabs.sendMessage（无任何 host 权限）
  ▼
content.js（运行在 agent-up 页面内）
  │  1. 读 DOM（试聊 Playground 最近 6 轮：剔除按钮与朗读前缀，模型/耗时/tokens 转为结构化 meta）
  │  2. fetch(location.origin + /api/feedback) —— 同源，无 CORS
  ▼
agent-up POST /api/feedback → 反馈池
```

- **零权限**：manifest 未声明任何 `permissions`，也没有远程代码/外部资源；content script 仅注入
  `http://localhost:3000/*` 与 `http://127.0.0.1:3000/*`。
- **agentId 防串台**：提交时以「当前页面 URL 解析的 agentId」为准，popup 传参不含 agentId——
  SPA 切换页面后提交会直接报错而不是写错 Agent。
- **身份声明**：提交走 agent-up 的 MOCK 认证占位协议（`x-actor-*` 请求头，见
  `apps/web/lib/context.ts`），演示口径固定 CRE 角色（`cre-zhang` / `CRE 张一` /
  `cre_viewer`）。接入真实认证后由登录身份替换，本插件无需改动协议。
- **会话证据**：存 `sessionData`（schema 的 `z.any()` 安全区），标记
  `via: "chrome-extension"`，不伪装成人工录入；对话正文按行还原保留步骤/代码块结构，
  每条 Agent 回复附带的模型/耗时/tokens 以结构化 `meta` 字段归档（对 AI 归因有参考价值）

## 安装（加载未打包扩展）

1. 启动 agent-up 本地全栈：仓库根 `pnpm dev`（需 http://localhost:3000 可访问；真实 LLM 可选）。
2. Chrome 打开 `chrome://extensions/` → 打开右上角「开发者模式」。
3. 「加载已解压的扩展程序」→ 选择本目录 `chrome-extension/`。
4. 固定到工具栏（图钉），进入任一 Agent 详情页（如 http://localhost:3000/agents/ecs-assistant/）。

## 演示动线（推荐脚本，全程 <2 分钟）

1. 在 Agent 详情页「试聊 Playground」输入一条工单消息并得到回复
   （例：`用户问：把 ECS 磁盘从 40G 扩容到 100G 会影响现有数据吗？`）。
2. 点击扩展图标 → 表单自动带入 Agent 名与最近对话预览。
3. 评级「不满意」→ 严重度「严重」→ 问题类型「回答质量」→ 正文写
   `只给了操作步骤，没有提示扩容前需要先创建快照/停止实例，存在数据风险`。
4. 点「提交到反馈池」→ 成功视图 → 「去反馈列表查看」。
5. 反馈中心确认新条目：标题、正文、Agent 名与严重度徽章齐全（状态 NEW；提交身份 cre-zhang
   已写入审计日志——反馈列表页不渲染提交人，如需展示请到设置页查审计）。
6. （可选）对这条反馈跑「AI 归因」→ 回 Agent 详情改对应分区 → 提交发布 → 审批通过 → 回滚演示。

## 自测清单（改动后人工回归）

- [ ] `manifest.json` 为合法 JSON（`python3 -m json.tool`）；加载后扩展无报错
- [ ] 非 agent-up 页面打开 popup → 显示引导视图；点「打开演示 Agent 页面」正确跳转
- [ ] agent-up 首页（非 Agent 详情页）打开 popup → 仍为引导视图
- [ ] Agent 详情页无对话时 → 表单可用，证据预览显示 0 轮；提交仍成功（sessionData 无对话）
- [ ] 对话预览与页面一致：按钮与朗读前缀不出现；Agent 回复的模型/耗时以灰色小字独立显示
- [ ] 对话正文含多行/步骤列表时，预览保留换行结构（不压成单行）
- [ ] 评级三段切换、严重度/类型下拉、标题与正文必填校验（提交按钮联动禁用）
- [ ] 提交成功后反馈列表出现新条目，字段齐全（rating/severity/tags/sessionData.via）
- [ ] 关闭 agent-up 服务后再提交 → 报「网络错误」，按钮恢复可点
- [ ] 提交期间切换页面/刷新 → 报连接断开错误而非静默成功
- [ ] 暗色模式下 popup 样式正常（`prefers-color-scheme: dark`）

## 演示后的数据清理

提交的反馈会真实写入本地 PostgreSQL（反馈池，Prisma），属预期行为；
演示结束执行 `pnpm db:seed` 即可重置（与仓库 FAQ 一致）。

## 诚实边界（MOCK 口径）

- 认证：MOCK（`x-actor-*` 请求头占位，真实身份由未来 NextAuth 替换）
- 服务端 `source` 字段仍为 `MANUAL`（未改主仓库）；插件来源体现在 `sessionData.via`，
  界面与审计均不做伪装
- 对话证据来自页面 DOM 提取（读「试聊 Playground」的 `role="log"` 区域），
  依赖现有结构；若 Playground 改版需同步 content.js 的选择器
- 仅在**本地全栈**形态可用：纯静态 Demo（`pnpm build:demo`）无服务端写入，不会注入

## 后续可做（本期不做）

1. 服务端把 `source` 白名单化（`MANUAL | EXTENSION`），让插件提交在数据层可区分
2. 允许「在 agent-up 之外的页面」收集反馈（需 CORS + API 地址配置，叙事：客户自己的工单系统）
3. 选中文本 → 自动带出为反馈正文；截图证据
4. 键盘可访问性：评级分段控件目前用 `hidden` 单选钮（鼠标可用、键盘不可聚焦），
   如需完整可达性改为 `sr-only` 方案
