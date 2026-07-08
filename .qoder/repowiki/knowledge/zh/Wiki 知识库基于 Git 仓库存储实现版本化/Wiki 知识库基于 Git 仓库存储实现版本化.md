---
kind: design
name: Wiki 知识库基于 Git 仓库存储实现版本化
source: session
category: adr
---

# Wiki 知识库基于 Git 仓库存储实现版本化

_来源：71d783f → 14c2c2e 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
Agent 的知识库需要支持页面级回滚、diff 对比、多人协作编辑以及基于分支的 Draft/Staging/Production 三环境发布流程，传统数据库难以原生满足这些需求。

## 决策驱动
- 天然版本控制能力
- 支持 diff 与回滚
- 与现有 llm-wiki 生态兼容

## 备选方案
- **Git 仓库存储（isomorphic-git / simple-git）** — 优点：原生 diff/merge/tag/branch 能力、每个 WikiVault 一个 repo 天然隔离、与 Git 工具链集成；缺点：并发写入需加锁、大仓库性能问题、需要维护 Git 服务器或对象存储
- **数据库+自定义版本表** _（已否决）_ — 优点：事务一致性好、查询灵活；缺点：需自行实现 diff/merge/回滚等复杂逻辑、无法复用 Git 生态工具

## 决策
为每个 Agent 的 WikiVault 创建一个独立 Git 仓库，使用 isomorphic-git 在 Node.js 中直接操作 Git，Release 时打 tag 冻结状态，页面级回滚基于 Git history 实现。

## 影响
获得了开箱即用的版本管理能力，但需要处理 Git 并发冲突和仓库膨胀问题；未来可按需迁移到专用文档存储方案。