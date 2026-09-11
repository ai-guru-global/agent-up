import { seedData } from "@agent-up/db/prisma/seed-data.mjs";

export type AnyRec = Record<string, unknown>;

/**
 * 演示数据集单一事实源在 packages/db/prisma/seed-data.mjs（批5 起 data/ 目录已删除）：
 * db:seed 写 PostgreSQL，演示模式用同一份数据初始化内存态。
 */
const ds = seedData as {
  agents: AnyRec[];
  feedback: AnyRec[];
  releases: AnyRec[];
  versions: AnyRec[];
  skills: AnyRec[];
  productGroups: AnyRec[];
  roles: AnyRec[];
  permissions: AnyRec[];
  auditLogs: AnyRec[];
  wikiVaults: AnyRec[];
  wikiPages: AnyRec[];
  evalCases: AnyRec[];
};

/**
 * 新建 Agent 时从预留 id 池分配：这些 id 的详情页已在构建期预渲染，
 * 静态导出下新建的 Agent 才有详情页可跳转。
 */
export const RESERVED_AGENT_IDS = [
  "agent-demo-1",
  "agent-demo-2",
  "agent-demo-3",
  "agent-demo-4",
  "agent-demo-5",
  "agent-demo-6",
  "agent-demo-7",
  "agent-demo-8",
];

export interface DemoState {
  agents: AnyRec[];
  feedback: AnyRec[];
  releases: AnyRec[];
  versions: AnyRec[];
  skills: AnyRec[];
  productGroups: AnyRec[];
  roles: AnyRec[];
  permissions: AnyRec[];
  auditLogs: AnyRec[];
  wikiVaults: AnyRec[];
  wikiPages: Record<string, AnyRec[]>;
  /** 试聊 trace（运行时由 mock chat 端点产生） */
  traces: AnyRec[];
  /** 评测用例库（种子 + 运行时从 trace 沉淀） */
  evalCases: AnyRec[];
  reservedAgentPool: string[];
}

/** 深拷贝种子数据，得到一份全新可变状态（刷新页面即重置）。 */
export function createInitialState(): DemoState {
  const wikiPagesByVault: Record<string, AnyRec[]> = {};
  for (const page of ds.wikiPages) {
    const vaultId = page.vaultId as string;
    (wikiPagesByVault[vaultId] ??= []).push(page);
  }

  const seed = {
    agents: ds.agents,
    feedback: ds.feedback,
    releases: ds.releases,
    versions: ds.versions,
    skills: ds.skills,
    productGroups: ds.productGroups,
    roles: ds.roles,
    permissions: ds.permissions,
    auditLogs: ds.auditLogs,
    wikiVaults: ds.wikiVaults,
    wikiPages: wikiPagesByVault,
    traces: [],
    evalCases: ds.evalCases,
  };
  const clone = JSON.parse(JSON.stringify(seed)) as Omit<
    DemoState,
    "reservedAgentPool"
  >;
  return { ...clone, reservedAgentPool: [...RESERVED_AGENT_IDS] };
}
