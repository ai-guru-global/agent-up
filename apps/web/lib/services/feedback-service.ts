/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "@agent-up/db";
import type { CreateFeedbackInput, UpdateFeedbackInput } from "../schemas";

interface ListFeedbackParams {
  skip: number;
  take: number;
  agentId?: string;
  status?: string;
  severity?: string;
  rating?: string;
  tag?: string;
}

/** 获取 Feedback 列表 */
export async function listFeedback(params: ListFeedbackParams) {
  const where: Record<string, unknown> = {};
  if (params.agentId) where.agentId = params.agentId;
  if (params.status && params.status !== "ALL") where.status = params.status;
  if (params.severity && params.severity !== "ALL") where.severity = params.severity;
  if (params.rating && params.rating !== "ALL") where.rating = params.rating;
  if (params.tag) where.tags = { has: params.tag };

  const [items, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { submittedAt: "desc" },
      include: {
        agent: { select: { id: true, name: true } },
      },
    }),
    prisma.feedback.count({ where }),
  ]);

  return { items, total };
}

/** 获取单个 Feedback */
export async function getFeedback(id: string) {
  return prisma.feedback.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, name: true } },
    },
  });
}

/** 创建 Feedback */
export async function createFeedback(input: CreateFeedbackInput) {
  const agent = await prisma.agent.findUnique({ where: { id: input.agentId } });
  if (!agent) throw new Error("Agent 不存在");

  return prisma.feedback.create({
    data: {
      agentId: input.agentId,
      source: "MANUAL",
      title: input.title,
      content: input.content,
      rating: input.rating as any,
      tags: (input.tags ?? []) as any,
      severity: (input.severity ?? "MINOR") as any,
      status: "NEW",
      sessionData: input.sessionData ?? undefined,
      targetPartition: (input.targetPartition ?? undefined) as any,
      submittedBy: "system",
    },
    include: {
      agent: { select: { id: true, name: true } },
    },
  });
}

/** 更新 Feedback */
export async function updateFeedback(id: string, input: UpdateFeedbackInput) {
  const fb = await prisma.feedback.findUnique({ where: { id } });
  if (!fb) throw new Error("Feedback 不存在");

  const data: Record<string, unknown> = {};
  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === "RESOLVED") data.resolvedAt = new Date();
    if (input.status === "ASSIGNED" && input.assignedTo) {
      data.assignedTo = input.assignedTo;
      data.assignedAt = new Date();
    }
    if (input.status === "VERIFIED") {
      data.verifiedAt = new Date();
      if (input.verificationNote) data.verificationNote = input.verificationNote;
    }
  }
  if (input.severity !== undefined) data.severity = input.severity;
  if (input.resolution !== undefined) data.resolution = input.resolution;
  if (input.targetPartition !== undefined) data.targetPartition = input.targetPartition;

  return prisma.feedback.update({
    where: { id },
    data,
    include: {
      agent: { select: { id: true, name: true } },
    },
  });
}
