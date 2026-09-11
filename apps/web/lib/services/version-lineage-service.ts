/**
 * Harness 资产版本化（R5a）：把每版本的 configSnapshot 升级为带跨版本
 * 变更历史的资产演进线（只读聚合，无新存储）。
 *
 * 口径（spec 决策 D5）：
 * - 按 publishedAt 升序组成演进线，相邻两版本做 4 分区结构化 diff
 *   （复用 computeJsonDiff；快照剥离 version/lastModifiedAt 元数据键，
 *   与 createRollbackRelease 的剥离规则一致）
 * - 每版本给出 vs 上一版本的 added/removed/changed 键计数；
 *   首版本是基线（changedPartitions / diffSummary 为 null）
 * - 快照缺失按空对象参与 diff（配置首次出现记 added）
 *
 * 不动现有 GET /api/agents/[id]/versions 的响应形状（向后兼容，决策 D6）。
 */
import { NotFoundError } from "@/lib/errors";
import { store } from "@/lib/data/store";
import { computeJsonDiff } from "@/lib/diff";

const PARTITIONS = ["PROMPT", "KNOWLEDGE", "TOOLS", "ROUTING"] as const;
const SNAPSHOT_KEY: Record<(typeof PARTITIONS)[number], string> = {
  PROMPT: "promptSnapshot",
  KNOWLEDGE: "knowledgeSnapshot",
  TOOLS: "toolsSnapshot",
  ROUTING: "routingSnapshot",
};

export interface PartitionDiffCount {
  added: number;
  removed: number;
  changed: number;
}

export interface VersionLineageEntry {
  versionId: string;
  version: string;
  publishedAt: string;
  changeNote: string | null;
  /** vs 上一版本有变更的分区；基线版本为 null，无变更为空数组 */
  changedPartitions: string[] | null;
  /** 4 分区键计数；基线版本为 null */
  diffSummary: Record<string, PartitionDiffCount> | null;
}

export interface VersionLineage {
  agentId: string;
  agentName: string | null;
  computedAt: string;
  /** 按 publishedAt 升序（资产演进方向） */
  lineage: VersionLineageEntry[];
}

interface VersionSnapshotLike {
  id: string;
  agentId: string;
  version?: string;
  publishedAt?: string;
  changeNote?: string | null;
  promptSnapshot?: Record<string, unknown> | null;
  knowledgeSnapshot?: Record<string, unknown> | null;
  toolsSnapshot?: Record<string, unknown> | null;
  routingSnapshot?: Record<string, unknown> | null;
}

/** 剥离快照里的元数据键，只比较真实配置内容 */
function payloadOf(snapshot: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!snapshot || typeof snapshot !== "object") return {};
  const { version: _v, lastModifiedAt: _l, ...payload } = snapshot;
  void _v;
  void _l;
  return payload;
}

function countDiff(before: Record<string, unknown>, after: Record<string, unknown>): PartitionDiffCount {
  const diff = computeJsonDiff(before, after);
  return {
    added: Object.keys(diff.added).length,
    removed: Object.keys(diff.removed).length,
    changed: Object.keys(diff.changed).length,
  };
}

export function getVersionLineage(agentId: string): VersionLineage {
  const agent = store.read<Record<string, unknown>>("agents", `${agentId}.json`);
  if (!agent) throw new NotFoundError("Agent 不存在");

  const versions = store
    .list<VersionSnapshotLike>("versions")
    .filter((v) => v?.agentId === agentId)
    .sort(
      (a, b) =>
        String(a.publishedAt ?? "").localeCompare(String(b.publishedAt ?? "")) ||
        a.id.localeCompare(b.id),
    );

  const lineage: VersionLineageEntry[] = [];
  let previous: VersionSnapshotLike | null = null;
  for (const v of versions) {
    if (!previous) {
      lineage.push({
        versionId: v.id,
        version: String(v.version ?? "?"),
        publishedAt: String(v.publishedAt ?? ""),
        changeNote: v.changeNote ?? null,
        changedPartitions: null,
        diffSummary: null,
      });
    } else {
      const diffSummary: Record<string, PartitionDiffCount> = {};
      const changedPartitions: string[] = [];
      for (const p of PARTITIONS) {
        const key = SNAPSHOT_KEY[p];
        const count = countDiff(payloadOf(previous[key]), payloadOf(v[key]));
        diffSummary[p] = count;
        if (count.added + count.removed + count.changed > 0) changedPartitions.push(p);
      }
      lineage.push({
        versionId: v.id,
        version: String(v.version ?? "?"),
        publishedAt: String(v.publishedAt ?? ""),
        changeNote: v.changeNote ?? null,
        changedPartitions,
        diffSummary,
      });
    }
    previous = v;
  }

  return {
    agentId,
    agentName: typeof agent.name === "string" ? agent.name : null,
    computedAt: store.now(),
    lineage,
  };
}
