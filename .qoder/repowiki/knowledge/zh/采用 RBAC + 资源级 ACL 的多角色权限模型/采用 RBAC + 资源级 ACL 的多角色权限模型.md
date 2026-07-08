---
kind: design
name: 采用 RBAC + 资源级 ACL 的多角色权限模型
source: session
category: adr
---

# 采用 RBAC + 资源级 ACL 的多角色权限模型

_来源：71d783f → 14c2c2e 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
平台涉及多类用户（管理员、产品组、Skill 开发者、知识编辑者、审计员），不同角色对 Agent 配置、Wiki 内容、Skill 注册表等资源的访问粒度差异很大，简单的角色划分无法满足细粒度控制需求。

## 决策驱动
- 细粒度权限控制
- 可扩展的角色体系
- 审计合规要求

## 备选方案
- **RBAC + 资源级 ACL** — 优点：角色定义清晰、资源级权限灵活、易于扩展新角色和新资源类型；缺点：权限判断逻辑较复杂、需要统一的中间件拦截
- **纯 ABAC（属性基访问控制）** _（已否决）_ — 优点：最灵活的动态授权；缺点：策略编写和维护成本高、调试困难，MVP 阶段过度设计
- **简单角色列表** _（已否决）_ — 优点：实现最简单；缺点：无法支持同角色不同资源的差异化权限，如知识编辑者只能改 Wiki 不能改 prompt

## 决策
采用 RBAC 定义基础角色（admin/product_group/skill_developer/knowledge_editor/auditor），在此基础上叠加资源级 ACL：Resource = Agent/WikiVault/Skill/Feedback/Release，Action = read/write/publish/approve/rollback/delete，Scope = own_group/cross_group/global，所有写操作记录不可篡改的审计日志。

## 影响
权限模型足够支撑 MVP 及中期演进，但需要在每个 API 入口统一鉴权中间件；审计日志的不可篡改性需要额外的存储保障。