/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "@agent-up/db";

/** 提交发布 */
export async function submitRelease(agentId: string, changeNote: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      promptConfig: true,
      knowledgeConfig: true,
      toolsConfig: true,
      routingConfig: true,
    },
  });
  if (!agent) throw new Error("Agent 不存在");

  // 确定变更了哪些分区
  const changedPartitions: string[] = [];
  if (agent.promptConfig) changedPartitions.push("PROMPT");
  if (agent.knowledgeConfig) changedPartitions.push("KNOWLEDGE");
  if (agent.toolsConfig) changedPartitions.push("TOOLS");
  if (agent.routingConfig) changedPartitions.push("ROUTING");

  // 创建配置快照
  const configSnapshot = {
    prompt: agent.promptConfig,
    knowledge: agent.knowledgeConfig,
    tools: agent.toolsConfig,
    routing: agent.routingConfig,
    snapshotAt: new Date().toISOString(),
  };

  return prisma.release.create({
    data: {
      agentId,
      changeNote,
      changedPartitions: changedPartitions as any,
      status: "PENDING",
      submittedBy: "system", // TODO: 从 auth 获取
      configSnapshot: configSnapshot as any,
    },
    include: {
      agent: { select: { id: true, name: true } },
    },
  });
}

/** 审批发布 */
export async function reviewRelease(
  releaseId: string,
  action: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED",
  reviewComment?: string
) {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { agent: true },
  });
  if (!release) throw new Error("Release 不存在");
  if (release.status !== "PENDING") throw new Error("该 Release 已处理");

  const updated = await prisma.release.update({
    where: { id: releaseId },
    data: {
      status: action,
      approvedBy: "system", // TODO: 从 auth 获取
      approvedAt: action === "APPROVED" ? new Date() : null,
      reviewComment: reviewComment ?? null,
    },
  });

  // 审批通过 → 自动生成版本快照
  if (action === "APPROVED") {
    await createVersionFromRelease(release);
  }

  return updated;
}

/** 从审批通过的 Release 创建版本快照 */
async function createVersionFromRelease(release: {
  id: string;
  agentId: string;
  changeNote: string;
  configSnapshot: any;
}) {
  // 计算下一个版本号
  const lastVersion = await prisma.agentVersion.findFirst({
    where: { agentId: release.agentId },
    orderBy: { publishedAt: "desc" },
  });

  const nextMinor = (lastVersion?.minor ?? 0) + 1;
  const version = `0.${nextMinor}.0`;

  const snapshot = release.configSnapshot ?? {};

  return prisma.agentVersion.create({
    data: {
      agentId: release.agentId,
      version,
      major: 0,
      minor: nextMinor,
      patch: 0,
      promptSnapshot: snapshot.prompt ?? {} as any,
      knowledgeSnapshot: snapshot.knowledge ?? {} as any,
      toolsSnapshot: snapshot.tools ?? {} as any,
      routingSnapshot: snapshot.routing ?? {} as any,
      releaseId: release.id,
      publishedBy: "system",
      changeNote: release.changeNote,
    },
  });
}

/** 获取 Agent 的 Release 列表 */
export async function listReleases(agentId: string, status?: string) {
  const where: Record<string, unknown> = { agentId };
  if (status && status !== "ALL") where.status = status;

  return prisma.release.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    include: {
      agent: { select: { id: true, name: true } },
      version: { select: { id: true, version: true, publishedAt: true } },
    },
  });
}
