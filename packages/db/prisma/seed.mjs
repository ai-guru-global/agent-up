/**
 * 全局种子脚本（批5）：把 seed-data.mjs 的演示数据写入 PostgreSQL。
 *
 * - 幂等：先按逆 FK 序清空全部业务表，再插入（可重复执行）
 * - 零依赖：内联读取 packages/db/.env，无需 dotenv
 * - 运行：pnpm --filter @agent-up/db exec prisma db seed（或 node prisma/seed.mjs）
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { seedData } from "./seed-data.mjs";

// —— 内联 .env 加载（prisma db seed 也会加载，直接 node 运行时兜底） ——
const here = dirname(fileURLToPath(import.meta.url));
try {
  for (const line of readFileSync(join(here, "../.env"), "utf-8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  // .env 不存在时依赖外部环境变量
}
if (!process.env.DATABASE_URL) {
  console.error("[seed] 缺少 DATABASE_URL（检查 packages/db/.env 或环境变量）");
  process.exit(1);
}

const prisma = new PrismaClient();
const T = (s) => new Date(s);

/** JSON 时代 routingConfig.defaultAction 已在批2 演进为 escalationPolicy（响应层契约） */
function routingRows(agent) {
  const rc = agent.routingConfig;
  return {
    agentId: agent.id,
    rules: rc.rules,
    humanThreshold: rc.humanThreshold,
    maxConversationTurns: rc.maxConversationTurns,
    idleTimeoutMinutes: rc.idleTimeoutMinutes,
    lastModifiedBy: agent.createdBy,
  };
}

async function clearAll() {
  // 子表在前：AgentVersion.releaseId 是 Release 的必填 FK
  await prisma.agentVersion.deleteMany();
  await prisma.release.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.evalCase.deleteMany();
  await prisma.trace.deleteMany();
  await prisma.configChange.deleteMany();
  await prisma.agentDraftConfig.deleteMany();
  await prisma.promptConfig.deleteMany();
  await prisma.toolsConfig.deleteMany();
  await prisma.routingConfig.deleteMany();
  await prisma.knowledgeConfig.deleteMany();
  await prisma.agentSkillBinding.deleteMany();
  await prisma.skillVersion.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.wikiPage.deleteMany();
  await prisma.wikiIngestJob.deleteMany();
  await prisma.wikiVault.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.productGroupMember.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.productGroup.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.user.deleteMany();
}

async function seed() {
  const d = seedData;

  for (const u of d.users) {
    await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name } });
  }
  for (const g of d.productGroups) {
    await prisma.productGroup.create({
      data: {
        id: g.id, name: g.name, displayName: g.displayName, description: g.description,
        createdAt: T(g.createdAt), updatedAt: T(g.updatedAt),
      },
    });
  }
  for (const m of d.productGroupMembers) {
    await prisma.productGroupMember.create({
      data: { id: m.id, productGroupId: m.productGroupId, userId: m.userId, role: m.role },
    });
  }
  await prisma.permission.createMany({
    data: d.permissions.map(({ id, resource, action, description }) => ({ id, resource, action, description })),
  });
  for (const r of d.roles) {
    await prisma.role.create({
      data: { id: r.id, name: r.name, displayName: r.displayName, isSystem: r.isSystem, description: r.description },
    });
  }
  await prisma.rolePermission.createMany({
    data: d.roles.flatMap((r) => r.permissions.map((p) => ({ roleId: r.id, permissionId: p.permission.id }))),
  });
  await prisma.userRole.createMany({
    data: d.userRoles.map(({ id, userId, roleId, assignedBy }) => ({ id, userId, roleId, assignedBy })),
  });

  for (const a of d.agents) {
    await prisma.agent.create({
      data: {
        id: a.id, name: a.name, description: a.description,
        productGroupId: a.productGroupId, status: a.status,
        createdAt: T(a.createdAt), updatedAt: T(a.updatedAt), createdBy: a.createdBy,
      },
    });
  }

  for (const v of d.wikiVaults) {
    await prisma.wikiVault.create({
      data: {
        id: v.id, name: v.name, description: v.description, agentId: v.agentId,
        isShared: v.isShared, gitBranch: v.gitBranch,
        pageCount: v.pageCount, avgConfidence: v.avgConfidence, orphanCount: v.orphanCount,
        createdAt: T(v.createdAt), updatedAt: T(v.updatedAt),
      },
    });
  }
  for (const p of d.wikiPages) {
    await prisma.wikiPage.create({
      data: {
        id: p.id, vaultId: p.vaultId, title: p.title, slug: p.slug,
        content: p.summary, summary: p.summary,
        provenance: p.provenance, lifecycle: p.lifecycle, tier: p.tier,
        baseConfidence: p.baseConfidence, sourceRefs: [],
        wikilinks: p.wikilinks, categories: p.categories, tags: p.tags,
        filePath: p.filePath, updatedAt: T(p.updatedAt),
      },
    });
  }

  for (const a of d.agents) {
    const pc = a.promptConfig;
    await prisma.promptConfig.create({
      data: {
        agentId: a.id, systemPrompt: pc.systemPrompt, roleDefinition: pc.roleDefinition,
        constraints: pc.constraints, outputFormat: pc.outputFormat, lastModifiedBy: a.createdBy,
      },
    });
    const kc = a.knowledgeConfig;
    await prisma.knowledgeConfig.create({
      data: {
        agentId: a.id, wikiVaultId: kc.wikiVaultId, searchStrategy: kc.searchStrategy,
        fallbackToMcp: kc.fallbackToMcp, maxWikiResults: kc.maxWikiResults,
        confidenceThreshold: kc.confidenceThreshold, syncStatus: "SYNCED", lastModifiedBy: a.createdBy,
      },
    });
    const tc = a.toolsConfig;
    await prisma.toolsConfig.create({
      data: {
        agentId: a.id, mcpTools: tc.mcpTools, wikiQueryTools: tc.wikiQueryTools,
        maxConcurrentCalls: tc.maxConcurrentCalls, timeoutMs: tc.timeoutMs, retryCount: tc.retryCount,
        lastModifiedBy: a.createdBy,
      },
    });
    await prisma.routingConfig.create({ data: routingRows(a) });
  }

  for (const s of d.skills) {
    const { _count, ...row } = s;
    await prisma.skill.create({
      data: { ...row, dependencies: [], permissions: [], createdAt: T(s.createdAt), updatedAt: T(s.updatedAt) },
    });
  }
  for (const sv of d.skillVersions) {
    const skill = d.skills.find((s) => s.id === sv.skillId);
    const { _count, ...snapshot } = skill;
    await prisma.skillVersion.create({
      data: { skillId: sv.skillId, version: sv.version, changelog: sv.changelog, snapshot, publishedAt: T(sv.publishedAt) },
    });
  }
  for (const b of d.skillBindings) {
    await prisma.agentSkillBinding.create({
      data: { id: b.id, agentId: b.agentId, skillId: b.skillId, boundBy: b.boundBy, boundAt: T(b.boundAt) },
    });
  }

  for (const r of d.releases) {
    await prisma.release.create({
      data: {
        id: r.id, agentId: r.agentId, changeNote: r.changeNote, changedPartitions: r.changedPartitions,
        status: r.status, submittedBy: r.submittedBy, submittedAt: T(r.submittedAt),
        approvedBy: r.approvedBy, approvedAt: r.approvedAt ? T(r.approvedAt) : null,
        reviewComment: r.reviewComment, configSnapshot: r.configSnapshot ?? undefined,
      },
    });
  }
  for (const v of d.versions) {
    await prisma.agentVersion.create({
      data: {
        id: v.id, agentId: v.agentId, version: v.version, major: v.major, minor: v.minor, patch: v.patch,
        promptSnapshot: v.promptSnapshot, knowledgeSnapshot: v.knowledgeSnapshot,
        toolsSnapshot: v.toolsSnapshot, routingSnapshot: v.routingSnapshot,
        releaseId: v.releaseId, publishedBy: v.publishedBy, publishedAt: T(v.publishedAt),
        changeNote: v.changeNote, effectivenessReport: v.effectivenessReport ?? undefined,
      },
    });
  }

  await prisma.feedback.createMany({
    data: d.feedback.map((f) => ({
      id: f.id, agentId: f.agentId, source: f.source, title: f.title, content: f.content,
      rating: f.rating, tags: f.tags, severity: f.severity, status: f.status,
      targetPartition: f.targetPartition ?? null, submittedBy: f.submittedBy, submittedAt: T(f.submittedAt),
    })),
  });

  for (const e of d.evalCases) {
    await prisma.evalCase.create({
      data: {
        id: e.id, agentId: e.agentId, sourceTraceId: e.sourceTraceId, title: e.title,
        expectation: e.expectation, assertions: e.assertions, systemPrompt: e.systemPrompt,
        history: e.history, message: e.message, referenceReply: e.referenceReply,
        status: e.status, createdAt: T(e.createdAt), createdBy: e.createdBy,
      },
    });
  }

  await prisma.auditLog.createMany({
    data: d.auditLogs.map((l) => ({
      id: l.id, action: l.action, resource: l.resource, resourceId: l.resourceId,
      userName: l.userName, userRole: l.userRole, createdAt: T(l.createdAt), details: l.details,
    })),
  });
}

try {
  await clearAll();
  await seed();
  const [users, groups, agents, releases, versions, feedback, evalCases, auditLogs, wikiPages, skills, skillVersions] =
    await Promise.all([
      prisma.user.count(), prisma.productGroup.count(), prisma.agent.count(),
      prisma.release.count(), prisma.agentVersion.count(), prisma.feedback.count(),
      prisma.evalCase.count(), prisma.auditLog.count(), prisma.wikiPage.count(),
      prisma.skill.count(), prisma.skillVersion.count(),
    ]);
  console.log(
    `[seed] done: users=${users} groups=${groups} agents=${agents} releases=${releases} ` +
      `versions=${versions} feedback=${feedback} evalCases=${evalCases} auditLogs=${auditLogs} ` +
      `wikiPages=${wikiPages} skills=${skills} skillVersions=${skillVersions}`
  );
} catch (err) {
  console.error("[seed] failed:", err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
