import { createInitialState, type AnyRec, type DemoState } from "./seed";

/**
 * 内存态 mock API router。
 * 完整镜像服务端 route handler 的请求/响应形状（lib/utils 的 success/error 封装、
 * 分页元数据、service 层的 join 字段），LLM 类端点返回预置回复。
 * 所有变更只落在内存，刷新页面（重新加载 bundle）即重置。
 */

export interface MockResult {
  status: number;
  body: unknown;
  delayMs?: number;
}

let state: DemoState = createInitialState();

export function resetDemoState(): void {
  state = createInitialState();
}

const now = () => new Date().toISOString();
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const ok = (data: unknown, status = 200): MockResult => ({
  status,
  body: { success: true, data },
});
const fail = (error: string, status = 400): MockResult => ({
  status,
  body: { success: false, error },
});

const SYSTEM_ACTOR = { id: "system", name: "系统", role: "platform_admin" };

function recordAudit(
  action: string,
  resource: string,
  resourceId: string,
  details?: AnyRec,
): void {
  state.auditLogs.push({
    id: newId(),
    action,
    resource,
    resourceId,
    userName: SYSTEM_ACTOR.name,
    userRole: SYSTEM_ACTOR.role,
    createdAt: now(),
    ...(details ? { details } : {}),
  });
}

// ---------- 分页（镜像 lib/utils.parsePagination/paginationMeta） ----------

function paginate(items: AnyRec[], search: URLSearchParams) {
  const page = Math.max(1, parseInt(search.get("page") || "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(search.get("pageSize") || "20", 10) || 20),
  );
  const total = items.length;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    },
  };
}

// ---------- join 辅助（镜像 service 层 withProductGroup / withAgentName） ----------

function productGroupOf(id: unknown): AnyRec | null {
  const group = state.productGroups.find((g) => g.id === id);
  return group
    ? {
        id: group.id as string,
        name: group.name as string,
        displayName: group.displayName as string,
      }
    : null;
}

function withProductGroup(agent: AnyRec): AnyRec {
  return { ...agent, productGroup: productGroupOf(agent.productGroupId) };
}

function agentBrief(id: unknown): AnyRec | null {
  const agent = state.agents.find((a) => a.id === id);
  return agent ? { id: agent.id as string, name: agent.name as string } : null;
}

function withAgentName(item: AnyRec): AnyRec {
  return { ...item, agent: agentBrief(item.agentId) };
}

// ---------- 版本与效果报告（镜像 effectiveness-service 语义） ----------

const WINDOW_DAYS = 7;

function computeEffectivenessReport(version: AnyRec): AnyRec {
  const publishedAt = String(version.publishedAt);
  const start = Date.parse(publishedAt);
  const end = start + WINDOW_DAYS * 24 * 3600 * 1000;
  const inWindow = state.feedback.filter((f) => {
    if (f.agentId !== version.agentId) return false;
    const t = Date.parse(String(f.submittedAt));
    return t >= start && t <= end;
  });
  const tally = (key: string, values: string[]) => {
    const out: AnyRec = {};
    for (const v of values) out[v] = inWindow.filter((f) => f[key] === v).length;
    return out;
  };
  return {
    totalFeedbacks: inWindow.length,
    byRating: tally("rating", ["POSITIVE", "NEGATIVE", "NEUTRAL"]),
    bySeverity: tally("severity", ["CRITICAL", "MAJOR", "MINOR", "SUGGESTION"]),
    byPartition: tally("targetPartition", [
      "PROMPT",
      "KNOWLEDGE",
      "TOOLS",
      "ROUTING",
    ]),
    computedAt: now(),
    versionPublishedAt: publishedAt,
    windowDays: WINDOW_DAYS,
  };
}

/** 镜像 getOrComputeEffectivenessReport：≥7 天且缺失才补算，否则原样返回。 */
function withEffectiveness(version: AnyRec): AnyRec {
  if (version.effectivenessReport) return version;
  const age = Date.now() - Date.parse(String(version.publishedAt));
  if (age < WINDOW_DAYS * 24 * 3600 * 1000) return version;
  return { ...version, effectivenessReport: computeEffectivenessReport(version) };
}

// ----- maas usage（镜像 maas-usage-service：聚合试聊 trace 的每 Agent 真实用量） -----

function maasUsageReport(): AnyRec {
  const nameOf = new Map(
    state.agents
      .filter((a) => typeof a.id === "string")
      .map((a) => [
        String(a.id),
        typeof a.name === "string" ? (a.name as string) : null,
      ]),
  );
  const groups = new Map<string, AnyRec[]>();
  for (const t of state.traces) {
    const agentId = String(t.agentId ?? "");
    if (!agentId) continue;
    const list = groups.get(agentId) ?? [];
    list.push(t);
    groups.set(agentId, list);
  }
  const agents: AnyRec[] = [];
  for (const [agentId, list] of groups) {
    const sorted = [...list].sort((a, b) =>
      String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
    );
    const last = sorted[sorted.length - 1];
    const usageOf = (t: AnyRec) => (t.usage ?? {}) as AnyRec;
    const sum = (pick: (t: AnyRec) => unknown) =>
      list.reduce((acc, t) => acc + (Number(pick(t)) || 0), 0);
    agents.push({
      agentId,
      agentName: nameOf.get(agentId) ?? null,
      model: typeof last?.model === "string" ? last.model : null,
      calls: list.length,
      promptTokens: sum((t) => usageOf(t).promptTokens),
      completionTokens: sum((t) => usageOf(t).completionTokens),
      totalTokens: sum((t) => usageOf(t).totalTokens),
      avgLatencyMs: Math.round(sum((t) => t.latencyMs) / list.length),
      ratingsUp: list.filter((t) => t.rating === "UP").length,
      ratingsDown: list.filter((t) => t.rating === "DOWN").length,
      unrated: list.filter((t) => t.rating !== "UP" && t.rating !== "DOWN").length,
      lastCallAt: typeof last?.createdAt === "string" ? last.createdAt : null,
    });
  }
  agents.sort(
    (a, b) =>
      (b.calls as number) - (a.calls as number) ||
      String(a.agentId).localeCompare(String(b.agentId)),
  );
  return { hasData: agents.length > 0, computedAt: now(), agents };
}

// ----- 证据链（镜像 evidence-chain-service：只读聚合，无新存储） -----

function evidenceChain(agentId: string): AnyRec {
  const a = state.agents.find((x) => x.id === agentId);
  if (!a) throw new MockError(404, "Agent 不存在");

  const nodes: AnyRec[] = [];

  for (const fb of state.feedback) {
    if (fb.agentId !== agentId) continue;
    nodes.push({
      type: "FEEDBACK",
      id: fb.id,
      at: String(fb.submittedAt ?? ""),
      title: String(fb.title ?? "（无标题反馈）"),
      status: (fb.status as string) ?? null,
      detail: {
        severity: fb.severity ?? null,
        rating: fb.rating ?? null,
        targetPartition: fb.targetPartition ?? null,
      },
    });
  }

  const evalCaseByTrace = new Map<string, string>();
  for (const ec of state.evalCases) {
    if (typeof ec.sourceTraceId === "string" && typeof ec.id === "string")
      evalCaseByTrace.set(ec.sourceTraceId, ec.id);
  }
  for (const tr of state.traces) {
    if (tr.agentId !== agentId) continue;
    nodes.push({
      type: "TRACE",
      id: tr.id,
      at: String(tr.createdAt ?? ""),
      title: String(tr.message ?? ""),
      status: (tr.rating as string) ?? null,
      detail: {
        ratedAt: tr.ratedAt ?? null,
        note: tr.note ?? null,
        evalCaseId: evalCaseByTrace.get(String(tr.id)) ?? null,
      },
    });
  }

  for (const rel of state.releases) {
    if (rel.agentId !== agentId) continue;
    // 回滚单由 ROLLBACK 审计节点表达，避免重复计节点
    if (rel.isRollback === true) continue;
    const aiReview = rel.aiReview as AnyRec | null | undefined;
    nodes.push({
      type: "RELEASE",
      id: rel.id,
      at: String(rel.submittedAt ?? ""),
      title: String(rel.changeNote ?? "（无变更说明）"),
      status: (rel.status as string) ?? null,
      detail: {
        changedPartitions: rel.changedPartitions ?? null,
        aiReviewStatus: (aiReview?.status as string) ?? null,
      },
    });
  }

  for (const ver of state.versions) {
    if (ver.agentId !== agentId) continue;
    nodes.push({
      type: "VERSION",
      id: ver.id,
      at: String(ver.publishedAt ?? ""),
      title: `Version ${String(ver.version ?? "?")}`,
      status: null,
      detail: {
        version: ver.version ?? null,
        hasEffectivenessReport: ver.effectivenessReport != null,
        releaseId: ver.releaseId ?? null,
      },
    });
  }

  for (const log of state.auditLogs) {
    if (log.resourceId !== agentId) continue;
    if (log.action === "agent.rollback") {
      nodes.push({
        type: "ROLLBACK",
        id: log.id,
        at: String(log.createdAt ?? ""),
        title: "整版本回滚",
        status: null,
        detail: {
          scope: "VERSION",
          rollbackFromVersion: (log.details as AnyRec | null)?.rollbackFromVersion ?? null,
          newVersion: (log.details as AnyRec | null)?.newVersion ?? null,
        },
      });
    } else if (log.action === "agent.config.update") {
      const d = (log.details ?? {}) as AnyRec;
      const partition = typeof d.partition === "string" ? d.partition : null;
      const restored =
        typeof d.changeNote === "string"
          ? /回滚到 Version\s+(\S+)/.exec(d.changeNote)
          : null;
      if (partition && restored) {
        nodes.push({
          type: "ROLLBACK",
          id: log.id,
          at: String(log.createdAt ?? ""),
          title: "分区回滚",
          status: null,
          detail: { scope: "PARTITION", partition, restoredFromVersion: restored[1] },
        });
      }
    }
  }

  nodes.sort(
    (x, y) =>
      String(y.at).localeCompare(String(x.at)) ||
      String(x.id).localeCompare(String(y.id)),
  );

  return {
    agentId,
    agentName: (a.name as string) ?? null,
    nodes,
    computedAt: now(),
    declaration: "证据链呈现记录到的关联，非因果改进证明",
  };
}

// ---------- SemVer（镜像 lib/versioning.bumpVersion） ----------

function compareSemVer(a: string, b: string): number {
  const pa = /^(\d+)\.(\d+)\.(\d+)/.exec(a)?.slice(1).map(Number) ?? [0, 0, 0];
  const pb = /^(\d+)\.(\d+)\.(\d+)/.exec(b)?.slice(1).map(Number) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

function bumpVersion(current: string | null, changed: string[]) {
  const m = current ? /^(\d+)\.(\d+)\.(\d+)$/.exec(current.trim()) : null;
  if (!m) return { major: 0, minor: 1, patch: 0 };
  const cur = { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
  const unique = Array.from(new Set(changed));
  if (unique.length === 0)
    return { ...cur, patch: cur.patch + 1 };
  if (unique.length >= 2 || unique.includes("ROUTING"))
    return { major: cur.major, minor: cur.minor + 1, patch: 0 };
  return { ...cur, patch: cur.patch + 1 };
}

/** 从 release 派生不可变 Version 快照（镜像 release-service.createVersionFromRelease）。 */
function createVersionFromRelease(release: AnyRec) {
  const agentId = release.agentId as string;
  const changed = (release.changedPartitions as string[]) ?? [];
  const currentTop = state.versions
    .filter((v) => v.agentId === agentId)
    .map((v) => String(v.version))
    .sort((a, b) => compareSemVer(b, a))[0] ?? null;
  const next = bumpVersion(currentTop, changed);
  const versionStr = `${next.major}.${next.minor}.${next.patch}`;
  const snapshot = (release.configSnapshot ?? {}) as AnyRec;
  const version: AnyRec = {
    id: newId(),
    agentId,
    version: versionStr,
    major: next.major,
    minor: next.minor,
    patch: next.patch,
    promptSnapshot: snapshot.prompt ?? {},
    knowledgeSnapshot: snapshot.knowledge ?? {},
    toolsSnapshot: snapshot.tools ?? {},
    routingSnapshot: snapshot.routing ?? {},
    releaseId: release.id,
    publishedBy: SYSTEM_ACTOR.id,
    publishedAt: now(),
    changeNote: release.changeNote,
  };
  state.versions.push(version);
  return version;
}

/** 取某 agent 最近一次已发布 Version 的四分区快照（diff 基线）。 */
function latestVersionSnapshots(agentId: string) {
  const latest = state.versions
    .filter((v) => v.agentId === agentId)
    .sort((a, b) =>
      String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")),
    )[0];
  if (!latest)
    return { prompt: null, knowledge: null, tools: null, routing: null, version: null };
  return {
    prompt: latest.promptSnapshot ?? null,
    knowledge: latest.knowledgeSnapshot ?? null,
    tools: latest.toolsSnapshot ?? null,
    routing: latest.routingSnapshot ?? null,
    version: String(latest.version),
  };
}

const canon = (v: unknown) => JSON.stringify(v ?? null);
function partitionChanged(before: unknown, after: unknown): boolean {
  if (!before && !after) return false;
  return canon(before) !== canon(after);
}

// ---------- 配置分区更新（镜像 agent-service.updateConfigPartition） ----------

function updateConfigPartition(agentId: string, partition: string, data: AnyRec) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) throw new MockError(404, `Agent ${agentId} 不存在`);
  const key = `${partition}Config`;
  const existing = (agent[key] as AnyRec) ?? {};
  const updated: AnyRec = {
    ...existing,
    ...data,
    version: (Number(existing.version) || 0) + 1,
    lastModifiedAt: now(),
  };
  agent[key] = updated;
  agent.updatedAt = now();
  return updated;
}

/** 简化的 diff 摘要（仅用于审计日志 details 展示）。 */
function diffSummary(before: unknown, after: unknown) {
  const b = (before ?? {}) as AnyRec;
  const a = (after ?? {}) as AnyRec;
  const added = Object.keys(a).filter((k) => !(k in b));
  const removed = Object.keys(b).filter((k) => !(k in a));
  const changed = Object.keys(a).filter(
    (k) => k in b && k in a && canon(a[k]) !== canon(b[k]),
  );
  return { added, removed, changed };
}

class MockError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- 反馈状态机（镜像 feedback-service.ALLOWED_TRANSITIONS） ----------

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  NEW: ["TRIAGED", "WONTFIX", "CLOSED"],
  TRIAGED: ["ASSIGNED", "IN_PROGRESS", "WONTFIX", "CLOSED"],
  ASSIGNED: ["IN_PROGRESS", "WONTFIX", "CLOSED"],
  IN_PROGRESS: ["RESOLVED", "WONTFIX", "CLOSED"],
  RESOLVED: ["VERIFIED", "IN_PROGRESS", "CLOSED"],
  VERIFIED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
  WONTFIX: [],
};

// ---------- LLM 预置回复 ----------

const LLM_MODEL = "qwen-max";

function llmUsage(message: string) {
  const promptTokens = 180 + message.length;
  const completionTokens = 260;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function cannedChatReply(agent: AnyRec | undefined, message: string): string {
  const role = (agent?.promptConfig as AnyRec | null)?.roleDefinition;
  return [
    `**问题收到**：「${message}」`,
    "",
    "根据知识库检索与历史工单匹配，建议按以下步骤排查：",
    "",
    "1. **确认现象与环境**：记录实例 ID、地域、错误码与首次发生时间；",
    "2. **基础连通性检查**：确认安全组规则、弹性 IP 绑定与系统内防火墙状态；",
    "3. **日志与监控定位**：查看系统日志与云监控指标，锁定异常时间点；",
    "4. **风险提示**：涉及高危操作（磁盘扩容、实例重启等）前，请先创建快照备份。",
    "",
    `> 演示环境预置回复${role ? `（角色：${role}）` : ""}，用于展示 Agent 对话闭环，不代表线上模型输出。`,
  ].join("\n");
}

const PARTITION_LABELS: Record<string, string> = {
  PROMPT: "Prompt（提示词）",
  KNOWLEDGE: "Knowledge（知识库）",
  TOOLS: "Tools（工具）",
  ROUTING: "Routing（路由）",
};

function cannedInsight(fb: AnyRec): string {
  const target = (fb.targetPartition as string) ?? "KNOWLEDGE";
  const label = PARTITION_LABELS[target] ?? target;
  const rating = fb.rating as string;
  if (rating === "POSITIVE") {
    return [
      "## 归因分析",
      "",
      `该反馈为正面评价，说明「${label}」分区当前的配置表现良好，回答路径符合 CRE 预期。`,
      "",
      "## 改进建议",
      "",
      "1. 将本次会话沉淀为知识库正面样例，供后续 Prompt 优化参考；",
      "2. 继续跟踪同类问题的解决率，确认表现稳定；",
      "",
      "> 演示环境预置分析，非线上模型输出。",
    ].join("\n");
  }
  return [
    "## 归因分析",
    "",
    `该反馈最可能源自 **${label}** 分区：`,
    "",
    `- 反馈聚焦于「${fb.title}」，结合严重程度（${fb.severity}），符合 ${label} 层面的典型症状；`,
    "- 建议 Cross-check 该分区当前 active 配置与最近已发布版本的快照差异。",
    "",
    "## 改进建议",
    "",
    `1. 针对「${fb.title}」修订 ${label} 分区配置；`,
    "2. 在 Playground 验证修改后的回答质量；",
    "3. 提交发布并跟踪后续同类反馈占比。",
    "",
    "> 演示环境预置分析，非线上模型输出。",
  ].join("\n");
}

function cannedSummary(release: AnyRec, agentName: string): string {
  const changed = (release.changedPartitions as string[]) ?? [];
  const labels = changed.map((p) => PARTITION_LABELS[p] ?? p).join("、");
  const routing = changed.includes("ROUTING");
  return [
    "## 变更摘要",
    "",
    `本次发布针对 ${agentName} 的 ${labels || "配置"} 分区进行优化：${release.changeNote ?? "（无变更说明）"}。变更意图与近期反馈治理方向一致，影响面可控。`,
    "",
    "## 风险提示",
    "",
    `1. 建议发布后观察 48 小时内同类工单的回答质量；`,
    routing
      ? "2. 路由阈值变更会影响转人工比例，需关注人工队列水位；"
      : "2. 变更已在 diff 视图核对，无破坏性删除；",
    "3. 如需回退，可通过版本历史一键回滚到任一历史版本。",
    "",
    "> 演示环境预置分析，非线上模型输出。",
  ].join("\n");
}

// ---------- 确定性断言（镜像 schemas.evalAssertionSchema + ai-review-service.runAssertions） ----------

const ASSERTION_TYPES = ["contains", "not_contains", "regex"];

function parseAssertions(raw: unknown): Array<{ type: string; value: string }> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new MockError(422, "断言格式错误");
  if (raw.length > 5) throw new MockError(422, "断言最多 5 条");
  return raw.map((item) => {
    const a = (item ?? {}) as AnyRec;
    const type = String(a.type ?? "");
    const value = String(a.value ?? "").trim();
    if (!ASSERTION_TYPES.includes(type)) throw new MockError(422, "断言类型无效");
    if (!value) throw new MockError(422, "断言内容不能为空");
    if (value.length > 200) throw new MockError(422, "断言内容过长");
    if (type === "regex") {
      try {
        new RegExp(value);
      } catch {
        throw new MockError(422, "正则表达式无效");
      }
    }
    return { type, value };
  });
}

/** 演示环境没有真实的配置重放，用例的候选回复以参考回复代替 */
function runDemoAssertions(
  candidate: string,
  assertions: Array<{ type: string; value: string }>,
): Array<{ type: string; value: string; passed: boolean; detail: string }> {
  return assertions.map((a) => {
    if (a.type === "contains") {
      const passed = candidate.includes(a.value);
      return { ...a, passed, detail: passed ? `包含「${a.value}」` : `未包含「${a.value}」` };
    }
    if (a.type === "not_contains") {
      const passed = !candidate.includes(a.value);
      return {
        ...a,
        passed,
        detail: passed ? `未出现「${a.value}」` : `出现了不应出现的内容「${a.value}」`,
      };
    }
    try {
      const passed = new RegExp(a.value).test(candidate);
      return { ...a, passed, detail: passed ? `匹配正则 /${a.value}/` : `未匹配正则 /${a.value}/` };
    } catch {
      return { ...a, passed: false, detail: `断言正则无效：/${a.value}/` };
    }
  });
}

// ---------- 主路由 ----------

const VALID_PARTITIONS = ["prompt", "knowledge", "tools", "routing"];

export function handleMockRequest(
  method: string,
  pathname: string,
  search: URLSearchParams,
  body: unknown,
): MockResult {
  const seg = pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  const M = method.toUpperCase();
  const payload = (body ?? {}) as AnyRec;

  try {
    return route(M, seg, search, payload);
  } catch (err) {
    if (err instanceof MockError) return fail(err.message, err.status);
    return fail(err instanceof Error ? err.message : "服务器内部错误", 500);
  }
}

function route(
  M: string,
  seg: string[],
  search: URLSearchParams,
  payload: AnyRec,
): MockResult {
  const [head, second, third, fourth] = seg;

  // ----- auth -----
  if (head === "auth" && second === "login" && M === "POST") {
    if (!payload.username || !payload.password) return fail("请填写用户名和密码");
    if (payload.username !== "allengaller" || payload.password !== "123")
      return fail("用户名或密码错误", 401);
    return ok({ userId: "user-001", username: "allengaller", name: "Allen Galler" });
  }

  // ----- dashboard -----
  if (head === "dashboard" && M === "GET") {
    const pendingFeedbackStatuses = ["NEW", "TRIAGED", "ASSIGNED", "IN_PROGRESS"];
    const bySubmitted = (a: AnyRec, b: AnyRec) =>
      String(b.submittedAt).localeCompare(String(a.submittedAt));
    return ok({
      agents: {
        total: state.agents.length,
        active: state.agents.filter((a) => a.status === "ACTIVE").length,
      },
      feedback: {
        total: state.feedback.length,
        pending: state.feedback.filter((f) =>
          pendingFeedbackStatuses.includes(String(f.status)),
        ).length,
      },
      releases: {
        pending: state.releases.filter((r) => r.status === "PENDING").length,
      },
      recentFeedback: [...state.feedback]
        .sort(bySubmitted)
        .slice(0, 5)
        .map(withAgentName),
      recentReleases: [...state.releases]
        .sort(bySubmitted)
        .slice(0, 5)
        .map(withAgentName),
    });
  }

  // ----- maas -----
  if (head === "maas" && second === "usage") {
    if (M === "GET") return ok(maasUsageReport());
  }

  // ----- maas probe -----
  if (head === "maas" && second === "probe") {
    if (M === "GET")
      return ok({
        configured: true,
        model: LLM_MODEL,
        baseUrl: "mock://dashscope-compatible-endpoint",
      });
    if (M === "POST") {
      const msg = "连接确认";
      return {
        status: 200,
        body: {
          success: true,
          data: {
            connected: true,
            model: LLM_MODEL,
            reply: `连接正常。我是 ${LLM_MODEL} 模型（演示环境 Mock 端点），随时可以为您服务。`,
            usage: llmUsage(msg),
            latencyMs: 420,
          },
        },
        delayMs: 600,
      };
    }
  }

  // ----- agents -----
  if (head === "agents") {
    // /api/agents
    if (!second) {
      if (M === "GET") {
        let items = [...state.agents];
        const status = search.get("status");
        if (status && status !== "ALL")
          items = items.filter((a) => a.status === status);
        const productGroupId = search.get("productGroupId");
        if (productGroupId)
          items = items.filter((a) => a.productGroupId === productGroupId);
        const q = search.get("search")?.toLowerCase();
        if (q)
          items = items.filter(
            (a) =>
              String(a.name ?? "").toLowerCase().includes(q) ||
              String(a.description ?? "").toLowerCase().includes(q),
          );
        items.sort((a, b) =>
          String(b.updatedAt).localeCompare(String(a.updatedAt)),
        );
        const { items: pageItems, pagination } = paginate(items, search);
        return ok({ items: pageItems.map(withProductGroup), pagination });
      }
      if (M === "POST") {
        const group = state.productGroups.find(
          (g) => g.id === payload.productGroupId,
        );
        if (!group)
          return fail(`产品组 ${payload.productGroupId} 不存在`, 404);
        if (state.reservedAgentPool.length === 0)
          return fail("演示环境的 Agent 创建额度已用完，请重置演示数据");
        const id = state.reservedAgentPool.shift()!;
        const ts = now();
        const agent: AnyRec = {
          id,
          name: payload.name,
          description: payload.description ?? null,
          productGroupId: payload.productGroupId,
          status: "DRAFT",
          createdBy: SYSTEM_ACTOR.id,
          createdAt: ts,
          updatedAt: ts,
          promptConfig: null,
          knowledgeConfig: null,
          toolsConfig: null,
          routingConfig: null,
          skillBindings: [],
          productGroup: {
            id: group.id as string,
            name: group.name as string,
            displayName: group.displayName as string,
          },
          _count: { feedbacks: 0, releases: 0, versions: 0, skillBindings: 0 },
        };
        state.agents.push(agent);
        recordAudit("agent.create", "agent", id, { name: payload.name });
        return ok(agent, 201);
      }
    }

    const agent = () => state.agents.find((a) => a.id === second);
    const agentOr404 = () => {
      const a = agent();
      if (!a) throw new MockError(404, "Agent 不存在");
      return a;
    };

    // /api/agents/:id
    if (!third) {
      if (M === "GET") {
        const a = agent();
        if (!a) return fail("Agent 不存在", 404);
        const releases = state.releases
          .filter((r) => r.agentId === second && r.status === "PENDING")
          .sort((x, y) =>
            String(y.submittedAt).localeCompare(String(x.submittedAt)),
          );
        const versions = state.versions
          .filter((v) => v.agentId === second)
          .sort((x, y) =>
            String(y.publishedAt).localeCompare(String(x.publishedAt)),
          )
          .slice(0, 5);
        return ok({ ...withProductGroup(a), releases, versions });
      }
      if (M === "PUT") {
        const a = agentOr404();
        if (payload.name !== undefined) a.name = payload.name;
        if (payload.description !== undefined) a.description = payload.description;
        if (payload.status !== undefined) a.status = payload.status;
        a.updatedAt = now();
        const refreshed = { ...a, productGroup: productGroupOf(a.productGroupId) };
        recordAudit("agent.update", "agent", String(second), payload);
        return ok(refreshed);
      }
      if (M === "DELETE") {
        const a = agentOr404();
        a.status = "ARCHIVED";
        a.updatedAt = now();
        recordAudit("agent.archive", "agent", String(second));
        return ok(a);
      }
    }

    // /api/agents/:id/chat（镜像真实端点：成功调用后落盘一条 trace，响应带 traceId）
    if (third === "chat" && M === "POST") {
      const a = agentOr404();
      const message = String(payload.message ?? "");
      const history = Array.isArray(payload.history)
        ? (payload.history as AnyRec[])
        : [];
      const reply = cannedChatReply(a, message);
      const usage = llmUsage(message);
      const traceId = newId();
      state.traces.push({
        id: traceId,
        agentId: second,
        systemPrompt: String((a.promptConfig as AnyRec | null)?.systemPrompt ?? ""),
        history: history.map((m) => ({ role: m.role, content: m.content })),
        message,
        reply,
        model: LLM_MODEL,
        usage,
        latencyMs: 480,
        createdAt: now(),
        rating: null,
        ratedAt: null,
        note: null,
      });
      return {
        status: 200,
        body: {
          success: true,
          data: {
            reply,
            model: LLM_MODEL,
            usage,
            latencyMs: 480,
            traceId,
          },
        },
        delayMs: 700,
      };
    }

    // /api/agents/:id/evidence-chain（只读聚合，镜像 evidence-chain-service）
    if (third === "evidence-chain" && M === "GET") {
      return ok(evidenceChain(String(second)));
    }

    // /api/agents/:id/eval-cases（列表 + 从 trace 沉淀）
    if (third === "eval-cases") {
      if (M === "GET") {
        const items = state.evalCases
          .filter((c) => c.agentId === second)
          .sort((a, b) =>
            String(b.createdAt).localeCompare(String(a.createdAt)),
          );
        return ok({ items });
      }
      if (M === "POST") {
        const traceId = String(payload.traceId ?? "");
        const trace = state.traces.find((t) => t.id === traceId);
        if (!trace) return fail("Trace 不存在，无法沉淀", 404);
        if (trace.agentId !== second)
          return fail("该 Trace 不属于此 Agent，无法沉淀为它的评测用例", 422);
        const message = String(trace.message ?? "");
        const firstLine = message.split("\n")[0] ?? "";
        const title =
          firstLine.length > 32 ? `${firstLine.slice(0, 32)}…` : firstLine;
        const assertions = parseAssertions(payload.assertions);
        const evalCase: AnyRec = {
          id: newId(),
          agentId: second,
          sourceTraceId: traceId,
          title,
          expectation:
            String(payload.expectation ?? "").trim() ||
            "回复应正确、完整地解决用户问题，并遵守该 Agent 的约束",
          systemPrompt: trace.systemPrompt,
          history: trace.history,
          message,
          referenceReply: trace.reply,
          ...(assertions.length > 0 ? { assertions } : {}),
          status: "ACTIVE",
          createdAt: now(),
          createdBy: SYSTEM_ACTOR.id,
        };
        state.evalCases.push(evalCase);
        recordAudit("eval_case.create", "eval_case", String(evalCase.id), {
          agentId: second,
          sourceTraceId: traceId,
          title,
        });
        return ok(evalCase, 201);
      }
    }

    // /api/agents/:id/versions
    if (third === "versions") {
      if (M === "GET") {
        const items = state.versions
          .filter((v) => v.agentId === second)
          .sort((x, y) =>
            String(y.publishedAt ?? "").localeCompare(String(x.publishedAt ?? "")),
          )
          .map(withEffectiveness);
        return ok({ items, total: items.length });
      }
      if (fourth && M === "GET") {
        const v = state.versions.find((x) => x.id === fourth);
        if (!v) return fail("Version 不存在", 404);
        if (v.agentId !== second) return fail("该 Version 不属于此 Agent", 422);
        return ok(withEffectiveness(v));
      }
    }

    // /api/agents/:id/release（提交发布）
    if (third === "release" && M === "POST") {
      const a = agentOr404();
      const baseline = latestVersionSnapshots(String(second));
      const candidates: [string, unknown, unknown][] = [
        ["PROMPT", baseline.prompt, a.promptConfig ?? null],
        ["KNOWLEDGE", baseline.knowledge, a.knowledgeConfig ?? null],
        ["TOOLS", baseline.tools, a.toolsConfig ?? null],
        ["ROUTING", baseline.routing, a.routingConfig ?? null],
      ];
      const changedPartitions = candidates
        .filter(([, before, after]) => partitionChanged(before, after))
        .map(([key]) => key);
      if (changedPartitions.length === 0)
        return fail("没有任何配置变更，无法提交发布", 422);
      const ts = now();
      const release: AnyRec = {
        id: newId(),
        agentId: second,
        changeNote: payload.changeNote,
        changedPartitions,
        status: "PENDING",
        submittedBy: SYSTEM_ACTOR.id,
        submittedAt: ts,
        approvedBy: null,
        approvedAt: null,
        reviewComment: null,
        configSnapshot: {
          prompt: a.promptConfig ?? null,
          knowledge: a.knowledgeConfig ?? null,
          tools: a.toolsConfig ?? null,
          routing: a.routingConfig ?? null,
          snapshotAt: ts,
        },
        version: null,
      };
      state.releases.push(release);
      recordAudit("release.submit", "release", String(release.id), {
        agentId: second,
        changedPartitions,
      });
      return ok(withAgentName(release), 201);
    }

    // /api/agents/:id/rollback/:versionId（整版本回滚）
    if (third === "rollback" && fourth && M === "POST") {
      const a = agentOr404();
      const target = state.versions.find((v) => v.id === fourth);
      if (!target) return fail("Version 不存在", 404);
      if (target.agentId !== second) return fail("该 Version 不属于此 Agent", 422);
      const partitions = ["PROMPT", "KNOWLEDGE", "TOOLS", "ROUTING"] as const;
      const snapshotKey: Record<string, string> = {
        PROMPT: "promptSnapshot",
        KNOWLEDGE: "knowledgeSnapshot",
        TOOLS: "toolsSnapshot",
        ROUTING: "routingSnapshot",
      };
      const activeKey: Record<string, string> = {
        PROMPT: "promptConfig",
        KNOWLEDGE: "knowledgeConfig",
        TOOLS: "toolsConfig",
        ROUTING: "routingConfig",
      };
      const ts = now();
      const configSnapshot: AnyRec = {};
      for (const p of partitions) {
        const raw = (target[snapshotKey[p]] as AnyRec | null) ?? {};
        const { version: _v, lastModifiedAt: _l, ...rest } = raw;
        void _v;
        void _l;
        configSnapshot[p.toLowerCase()] = rest;
        a[activeKey[p]] = rest;
      }
      a.updatedAt = ts;
      const release: AnyRec = {
        id: newId(),
        agentId: second,
        changeNote: `回滚到 Version ${String(target.version)}`,
        changedPartitions: [...partitions],
        status: "APPROVED",
        submittedBy: SYSTEM_ACTOR.id,
        submittedAt: ts,
        approvedBy: SYSTEM_ACTOR.id,
        approvedAt: ts,
        reviewComment: "回滚操作（紧急恢复，无需审批）",
        configSnapshot: { ...configSnapshot, snapshotAt: ts },
        isRollback: true,
        rollbackFromVersion: String(target.version),
        rollbackToVersionId: target.id,
        version: null,
      };
      const newVersion = createVersionFromRelease({
        ...release,
        changeNote: `回滚到 v${String(target.version)}`,
      });
      release.version = {
        id: newVersion.id as string,
        version: newVersion.version as string,
        publishedAt: newVersion.publishedAt as string,
      };
      state.releases.push(release);
      recordAudit("agent.rollback", "agent", String(second), {
        rollbackFromVersion: String(target.version),
        rollbackToVersionId: target.id,
        newVersionId: newVersion.id,
        newVersion: newVersion.version,
        partitions: [...partitions],
      });
      return ok({
        release: withAgentName(release),
        version: newVersion,
        restoredFrom: { id: target.id, version: target.version },
      });
    }

    // /api/agents/:id/config/:partition[/rollback]
    if (third === "config") {
      const partition = fourth ?? "";
      const [partitionName, action] = partition.split("/");
      if (!VALID_PARTITIONS.includes(partitionName))
        return fail(
          `无效的分区: ${partitionName}，可选: ${VALID_PARTITIONS.join(", ")}`,
          400,
        );
      const ENUM: Record<string, string> = {
        prompt: "PROMPT",
        knowledge: "KNOWLEDGE",
        tools: "TOOLS",
        routing: "ROUTING",
      };

      if (action === "rollback" && M === "POST") {
        agentOr404();
        const versionId = String(payload.versionId ?? "");
        const version = state.versions.find((v) => v.id === versionId);
        if (!version) return fail("Version 不存在", 404);
        if (version.agentId !== second)
          return fail("该 Version 不属于此 Agent", 422);
        const snapshot = version[`${partitionName}Snapshot`] as AnyRec | null;
        if (!snapshot)
          return fail(
            `Version ${String(version.version)} 的 ${partitionName} 分区无快照`,
            422,
          );
        const { version: _v, lastModifiedAt: _l, ...restorePayload } = snapshot;
        void _v;
        void _l;
        const config = updateConfigPartition(
          String(second),
          partitionName,
          restorePayload,
        );
        recordAudit("agent.config.update", "agent", String(second), {
          partition: `${ENUM[partitionName]}_ROLLBACK`,
          changeNote: `回滚到 Version ${String(version.version)}`,
        });
        return ok({
          partition: partitionName,
          restoredFromVersion: version.version,
          config,
        });
      }

      if (!action && M === "GET") {
        const config = agentOr404()[`${partitionName}Config`] ?? null;
        return ok(config);
      }
      if (!action && M === "PUT") {
        const before = agentOr404()[`${partitionName}Config`] ?? null;
        const config = updateConfigPartition(String(second), partitionName, payload);
        recordAudit("agent.config.update", "agent", String(second), {
          partition: ENUM[partitionName],
          diffSummary: diffSummary(before, config),
        });
        return ok(config);
      }
    }
  }

  // ----- feedback -----
  if (head === "feedback") {
    if (!second) {
      if (M === "GET") {
        let items = [...state.feedback];
        const agentId = search.get("agentId");
        if (agentId) items = items.filter((f) => f.agentId === agentId);
        for (const key of ["status", "severity", "rating"] as const) {
          const v = search.get(key);
          if (v && v !== "ALL") items = items.filter((f) => f[key] === v);
        }
        const tag = search.get("tag");
        if (tag)
          items = items.filter(
            (f) => Array.isArray(f.tags) && (f.tags as string[]).includes(tag),
          );
        items.sort((a, b) =>
          String(b.submittedAt).localeCompare(String(a.submittedAt)),
        );
        const { items: pageItems, pagination } = paginate(items, search);
        return ok({ items: pageItems.map(withAgentName), pagination });
      }
      if (M === "POST") {
        if (!state.agents.find((a) => a.id === payload.agentId))
          return fail("Agent 不存在", 404);
        const ts = now();
        const feedback: AnyRec = {
          id: newId(),
          agentId: payload.agentId,
          source: "MANUAL",
          title: payload.title,
          content: payload.content,
          rating: payload.rating,
          tags: payload.tags ?? [],
          severity: payload.severity ?? "MINOR",
          status: "NEW",
          targetPartition: payload.targetPartition ?? null,
          sessionData: payload.sessionData ?? null,
          submittedBy: SYSTEM_ACTOR.id,
          submittedAt: ts,
        };
        state.feedback.push(feedback);
        recordAudit("feedback.create", "feedback", String(feedback.id), {
          agentId: payload.agentId,
          rating: payload.rating,
          severity: feedback.severity,
        });
        return ok(withAgentName(feedback), 201);
      }
      if (M === "PUT") {
        const { id, ...rest } = payload;
        if (!id) return fail("id 必填");
        const fb = state.feedback.find((f) => f.id === id);
        if (!fb) return fail("Feedback 不存在", 404);
        const currentStatus = String(fb.status);
        if (rest.status !== undefined && rest.status !== currentStatus) {
          const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
          if (!allowed.includes(String(rest.status)))
            return fail(
              `非法状态转移：${currentStatus} → ${String(rest.status)}`,
              422,
            );
        }
        const ts = now();
        const updated: AnyRec = { ...fb };
        if (rest.status !== undefined) {
          updated.status = rest.status;
          if (rest.status === "RESOLVED") updated.resolvedAt = ts;
          if (rest.status === "ASSIGNED" && rest.assignedTo) {
            updated.assignedTo = rest.assignedTo;
            updated.assignedAt = ts;
          }
          if (rest.status === "VERIFIED") {
            updated.verifiedAt = ts;
            if (rest.verificationNote) updated.verificationNote = rest.verificationNote;
          }
        }
        if (rest.severity !== undefined) updated.severity = rest.severity;
        if (rest.resolution !== undefined) updated.resolution = rest.resolution;
        if (rest.targetPartition !== undefined)
          updated.targetPartition = rest.targetPartition;
        const idx = state.feedback.indexOf(fb);
        state.feedback[idx] = updated;
        recordAudit("feedback.update", "feedback", String(id), {
          from: currentStatus,
          to: String(rest.status ?? currentStatus),
        });
        return ok(withAgentName(updated));
      }
    }
    if (third === "insight" && M === "POST") {
      const fb = state.feedback.find((f) => f.id === second);
      if (!fb) return fail("Feedback 不存在", 404);
      return {
        status: 200,
        body: {
          success: true,
          data: {
            feedbackId: second,
            insight: cannedInsight(fb),
            model: LLM_MODEL,
            latencyMs: 520,
          },
        },
        delayMs: 600,
      };
    }
  }

  // ----- traces & eval-cases（试聊打分与评测用例库，镜像服务端端点） -----
  if (head === "traces" && second && third === "rate" && M === "POST") {
    const trace = state.traces.find((t) => t.id === second);
    if (!trace) return fail("Trace 不存在", 404);
    const rating = String(payload.rating ?? "");
    if (rating !== "UP" && rating !== "DOWN")
      return fail("rating 只能是 UP 或 DOWN", 422);
    trace.rating = rating;
    trace.ratedAt = now();
    trace.note = String(payload.note ?? "").trim() || null;
    recordAudit("trace.rate", "trace", String(second), {
      agentId: trace.agentId,
      rating,
    });
    return ok({
      id: trace.id,
      agentId: trace.agentId,
      rating: trace.rating,
      ratedAt: trace.ratedAt,
      note: trace.note,
    });
  }

  if (head === "eval-cases" && second && M === "DELETE") {
    const idx = state.evalCases.findIndex((c) => c.id === second);
    if (idx === -1) return fail("评测用例不存在", 404);
    state.evalCases.splice(idx, 1);
    recordAudit("eval_case.delete", "eval_case", String(second), {});
    return ok({ deleted: true });
  }

  // ----- releases -----
  if (head === "releases") {
    if (!second && M === "GET") {
      let items = [...state.releases];
      const status = search.get("status");
      if (status && status !== "ALL")
        items = items.filter((r) => r.status === status);
      const agentId = search.get("agentId");
      if (agentId) items = items.filter((r) => r.agentId === agentId);
      items.sort((a, b) =>
        String(b.submittedAt).localeCompare(String(a.submittedAt)),
      );
      const { items: pageItems, pagination } = paginate(items, search);
      return ok({ items: pageItems.map(withAgentName), pagination });
    }

    const release = () => state.releases.find((r) => r.id === second);

    if (second && third === "review" && M === "PUT") {
      const rel = release();
      if (!rel) return fail("Release 不存在", 404);
      if (rel.status !== "PENDING")
        return fail(`该 Release 已处理（当前状态：${String(rel.status)}）`, 409);
      if (!String(payload.releaseId ?? "").trim())
        return fail("releaseId 不能为空", 422);
      const action = payload.action as string;
      if (
        action === "CHANGES_REQUESTED" &&
        !String(payload.reviewComment ?? "").trim()
      )
        return fail("CHANGES_REQUESTED 必须填写审批意见", 422);
      // 镜像软门禁：AI 评测 FAILED 后批准必须留下审批意见
      const aiReviewStatus =
        ((rel.aiReview as AnyRec | null | undefined)?.status as string) ?? null;
      if (
        action === "APPROVED" &&
        aiReviewStatus === "FAILED" &&
        !String(payload.reviewComment ?? "").trim()
      )
        return fail(
          "AI 评测未通过：批准前必须填写审批意见，说明采纳理由或人工复核结论",
          422,
        );
      const ts = now();
      const updated: AnyRec = {
        ...rel,
        status: action,
        approvedBy: SYSTEM_ACTOR.id,
        approvedAt: action === "APPROVED" ? ts : null,
        reviewComment: payload.reviewComment ?? null,
      };
      if (action === "APPROVED") {
        const version = createVersionFromRelease(rel);
        updated.version = {
          id: version.id as string,
          version: version.version as string,
          publishedAt: version.publishedAt as string,
        };
      }
      const idx = state.releases.indexOf(rel);
      state.releases[idx] = updated;
      const auditAction =
        action === "APPROVED"
          ? "release.approve"
          : action === "REJECTED"
            ? "release.reject"
            : "release.changes_requested";
      recordAudit(auditAction, "release", String(second), {
        agentId: rel.agentId,
        reviewComment: payload.reviewComment ?? null,
        ...(action === "APPROVED" ? { aiReviewStatus } : {}),
      });
      return ok(updated);
    }

    if (second && third === "ai-review" && M === "POST") {
      const rel = release();
      if (!rel) return fail("Release 不存在", 404);
      if (rel.status !== "PENDING")
        return fail(
          `只有待审批的 Release 可以运行 AI 评测（当前状态：${String(rel.status)}）`,
          409,
        );
      const cases = state.evalCases.filter(
        (c) => c.agentId === rel.agentId && c.status === "ACTIVE",
      );
      const ts = now();
      let aiReview: AnyRec;
      if (cases.length === 0) {
        aiReview = {
          status: "SKIPPED",
          runAt: ts,
          model: LLM_MODEL,
          totalCases: 0,
          passed: 0,
          failed: 0,
          errorCases: 0,
          summary:
            "该 Agent 还没有评测用例（先在 Playground 打分并沉淀），跳过 AI 评测",
          results: [],
        };
      } else {
        const results = cases.map((c) => {
          const assertions = (c.assertions ?? []) as Array<{
            type: string;
            value: string;
          }>;
          if (assertions.length > 0) {
            const assertionResults = runDemoAssertions(
              String(c.referenceReply ?? ""),
              assertions,
            );
            const failedOnes = assertionResults.filter((r) => !r.passed);
            if (failedOnes.length > 0) {
              return {
                caseId: c.id,
                title: c.title,
                verdict: "FAIL",
                score: null,
                reason: `未通过确定性断言（${failedOnes.length}/${assertionResults.length}）：${failedOnes
                  .map((f) => f.detail)
                  .join("；")}`,
                assertions: assertionResults,
              };
            }
            return {
              caseId: c.id,
              title: c.title,
              verdict: "PASS",
              score: 5,
              reason: `确定性断言全部通过（${assertionResults.length}/${assertionResults.length}），判官复核无异议（演示环境固定判定）`,
              assertions: assertionResults,
            };
          }
          return {
            caseId: c.id,
            title: c.title,
            verdict: "PASS",
            score: 5,
            reason: "候选回复覆盖参考回复要点，且符合该 Agent 的角色约束（演示环境固定判定）",
          };
        });
        const failedCount = results.filter((r) => r.verdict === "FAIL").length;
        aiReview = {
          status: failedCount === 0 ? "PASSED" : "FAILED",
          runAt: ts,
          model: LLM_MODEL,
          totalCases: cases.length,
          passed: results.length - failedCount,
          failed: failedCount,
          errorCases: 0,
          summary:
            failedCount === 0
              ? `全部 ${cases.length} 个用例通过，建议批准发布（演示环境固定判定）`
              : `${failedCount}/${cases.length} 个用例未通过确定性断言；如需批准，请在审批时填写意见说明理由（演示环境固定判定）`,
          results,
        };
      }
      const updated = { ...rel, aiReview };
      const idx = state.releases.indexOf(rel);
      state.releases[idx] = updated;
      recordAudit("release.ai_review", "release", String(second), {
        agentId: rel.agentId,
        status: aiReview.status,
        passed: aiReview.passed as number,
        failed: aiReview.failed as number,
        errorCases: aiReview.errorCases as number,
      });
      return ok(updated);
    }

    if (second && third === "summary" && M === "POST") {
      const rel = release();
      if (!rel) return fail("Release 不存在", 404);
      const agentName = String(agentBrief(rel.agentId)?.name ?? rel.agentId);
      return {
        status: 200,
        body: {
          success: true,
          data: {
            releaseId: second,
            summary: cannedSummary(rel, agentName),
            model: LLM_MODEL,
            latencyMs: 610,
          },
        },
        delayMs: 700,
      };
    }

    if (second && !third && M === "GET") {
      const rel = release();
      if (!rel) return fail("Release 不存在", 404);
      const versions = state.versions
        .filter((v) => v.agentId === rel.agentId)
        .sort((a, b) =>
          String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")),
        );
      const releaseVersionId = rel.version
        ? (rel.version as AnyRec).id
        : null;
      const baselineIdx = versions.findIndex((v) => v.id === releaseVersionId);
      const baseline =
        baselineIdx >= 0 && baselineIdx + 1 < versions.length
          ? versions[baselineIdx + 1]
          : (versions[0] ?? null);
      const baselineSnapshots = baseline
        ? {
            prompt: baseline.promptSnapshot ?? null,
            knowledge: baseline.knowledgeSnapshot ?? null,
            tools: baseline.toolsSnapshot ?? null,
            routing: baseline.routingSnapshot ?? null,
            version: baseline.version ?? null,
          }
        : { prompt: null, knowledge: null, tools: null, routing: null, version: null };
      return ok({ ...withAgentName(rel), baseline: baselineSnapshots });
    }
  }

  // ----- skills -----
  if (head === "skills") {
    if (!second && M === "GET") {
      let items = [...state.skills];
      const category = search.get("category");
      if (category && category !== "ALL")
        items = items.filter((s) => s.category === category);
      const status = search.get("status");
      if (status && status !== "ALL")
        items = items.filter((s) => s.status === status);
      const q = search.get("search")?.toLowerCase();
      if (q)
        items = items.filter(
          (s) =>
            String(s.name ?? "").toLowerCase().includes(q) ||
            String(s.displayName ?? "").toLowerCase().includes(q) ||
            String(s.description ?? "").toLowerCase().includes(q),
        );
      items.sort((a, b) =>
        String(b.updatedAt).localeCompare(String(a.updatedAt)),
      );
      const { items: pageItems, pagination } = paginate(items, search);
      return ok({ items: pageItems, pagination });
    }
    if (!second && M === "POST") {
      const ts = now();
      const skill: AnyRec = {
        id: newId(),
        name: payload.name,
        displayName: payload.displayName,
        description: payload.description,
        category: payload.category ?? "GENERAL",
        triggerPatterns: payload.triggerPatterns ?? [],
        inputSchema: payload.inputSchema ?? {},
        outputSchema: payload.outputSchema ?? {},
        runtime: payload.runtime ?? "HTTP",
        endpoint: payload.endpoint ?? null,
        version: "1.0.0",
        status: "DRAFT",
        publishedAt: null,
        downloadCount: 0,
        authorId: SYSTEM_ACTOR.id,
        authorName: SYSTEM_ACTOR.name,
        createdAt: ts,
        updatedAt: ts,
        _count: { bindings: 0, versions: 0 },
      };
      state.skills.push(skill);
      recordAudit("skill.create", "skill", String(skill.id), {
        name: payload.name,
      });
      return ok(skill, 201);
    }
  }

  // ----- settings -----
  if (head === "settings") {
    if (second === "product-groups") {
      if (M === "GET") return ok(state.productGroups);
      if (M === "POST") {
        const ts = now();
        const group: AnyRec = {
          id: newId(),
          name: payload.name,
          displayName: payload.displayName,
          description: payload.description ?? null,
          createdAt: ts,
          updatedAt: ts,
          _count: { agents: 0, members: 0 },
        };
        state.productGroups.push(group);
        recordAudit("product_group.create", "product-group", String(group.id), {
          name: payload.name,
        });
        return ok(group, 201);
      }
    }
    if (second === "roles") {
      if (M === "GET") return ok(state.roles);
      if (M === "POST") {
        const role: AnyRec = {
          id: newId(),
          name: payload.name,
          displayName: payload.displayName,
          isSystem: false,
          description: payload.description ?? null,
          _count: { members: 0 },
          permissions: [],
        };
        state.roles.push(role);
        recordAudit("role.create", "role", String(role.id), {
          name: payload.name,
        });
        return ok(role, 201);
      }
    }
    if (second === "permissions" && M === "GET") return ok(state.permissions);
    if (second === "audit-logs" && M === "GET") {
      let items = [...state.auditLogs];
      const action = search.get("action");
      if (action) items = items.filter((l) => l.action === action);
      const resource = search.get("resource");
      if (resource) items = items.filter((l) => l.resource === resource);
      const resourceId = search.get("resourceId");
      if (resourceId)
        items = items.filter((l) => l.resourceId === resourceId);
      const user = search.get("userName") || search.get("userId");
      if (user)
        items = items.filter(
          (l) => l.userName === user || l.userId === user,
        );
      items.sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      );
      const { items: pageItems, pagination } = paginate(items, search);
      return ok({ items: pageItems, pagination });
    }
  }

  // ----- wiki -----
  if (head === "wiki") {
    if (second === "vaults") {
      if (!third) {
        if (M === "GET") {
          let items = [...state.wikiVaults];
          const agentId = search.get("agentId");
          if (agentId) items = items.filter((v) => v.agentId === agentId);
          if (search.get("shared") === "true")
            items = items.filter((v) => v.isShared === true);
          items.sort((a, b) =>
            String(b.updatedAt).localeCompare(String(a.updatedAt)),
          );
          const { items: pageItems, pagination } = paginate(items, search);
          return ok({ items: pageItems, pagination });
        }
        if (M === "POST") {
          const id = newId();
          const ts = now();
          const vault: AnyRec = {
            id,
            name: payload.name,
            description: payload.description ?? null,
            agentId: payload.agentId ?? null,
            isShared: payload.isShared ?? false,
            gitRepoUrl: payload.gitRepoUrl || null,
            gitBranch: payload.gitBranch ?? "main",
            pageCount: 0,
            avgConfidence: 0,
            orphanCount: 0,
            createdAt: ts,
            updatedAt: ts,
            _count: { pages: 0, ingestJobs: 0 },
            agent: null,
          };
          state.wikiVaults.push(vault);
          state.wikiPages[id] = [];
          recordAudit("wiki.vault.create", "wiki-vault", id, {
            name: payload.name,
          });
          return ok(vault, 201);
        }
      }
      if (third) {
        const vault = state.wikiVaults.find((v) => v.id === third);
        if (fourth === "pages" && M === "GET") {
          let items = [...(state.wikiPages[third] ?? [])];
          const lifecycle = search.get("lifecycle");
          if (lifecycle && lifecycle !== "ALL")
            items = items.filter((p) => p.lifecycle === lifecycle);
          const tier = search.get("tier");
          if (tier && tier !== "ALL")
            items = items.filter((p) => p.tier === tier);
          const q = search.get("search")?.toLowerCase();
          if (q)
            items = items.filter(
              (p) =>
                String(p.title ?? "").toLowerCase().includes(q) ||
                String(p.content ?? "").toLowerCase().includes(q),
            );
          items.sort((a, b) =>
            String(b.updatedAt).localeCompare(String(a.updatedAt)),
          );
          const { items: pageItems, pagination } = paginate(items, search);
          return ok({ items: pageItems, pagination });
        }
        if (!fourth && M === "GET") {
          if (!vault) return fail("Vault 不存在", 404);
          return ok(vault);
        }
      }
    }
  }

  return fail(`接口不存在：${M} /api/${seg.join("/")}`, 404);
}
