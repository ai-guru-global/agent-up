import ecsAssistant from "../data/agents/ecs-assistant.json";
import rdsAssistant from "../data/agents/rds-assistant.json";
import fb001 from "../data/feedback/fb-001.json";
import fb002 from "../data/feedback/fb-002.json";
import fb003 from "../data/feedback/fb-003.json";
import rel001 from "../data/releases/rel-001.json";
import rel002 from "../data/releases/rel-002.json";
import ver001 from "../data/versions/ver-001.json";
import ver002 from "../data/versions/ver-002.json";
import verRds001 from "../data/versions/ver-rds-001.json";
import skillTicketLookup from "../data/skills/skill-ticket-lookup.json";
import skillWikiSearch from "../data/skills/skill-wiki-search.json";
import auditLogs from "../data/settings/audit-logs.json";
import permissions from "../data/settings/permissions.json";
import productGroups from "../data/settings/product-groups.json";
import roles from "../data/settings/roles.json";
import wikiVaultEcs from "../data/wiki-vaults/ecs-wiki.json";
import wikiVaultRds from "../data/wiki-vaults/rds-wiki.json";
import pageEcsDisk from "../data/wiki-vaults/ecs-wiki/pages/page-ecs-disk.json";
import pageEcsSg from "../data/wiki-vaults/ecs-wiki/pages/page-ecs-sg.json";
import pageEcsSsh from "../data/wiki-vaults/ecs-wiki/pages/page-ecs-ssh.json";
import pageRdsConn from "../data/wiki-vaults/rds-wiki/pages/page-rds-conn.json";

export type AnyRec = Record<string, unknown>;

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
  reservedAgentPool: string[];
}

/** 深拷贝种子数据，得到一份全新可变状态（刷新页面即重置）。 */
export function createInitialState(): DemoState {
  const seed = {
    agents: [ecsAssistant, rdsAssistant],
    feedback: [fb001, fb002, fb003],
    releases: [rel001, rel002],
    versions: [ver001, ver002, verRds001],
    skills: [skillTicketLookup, skillWikiSearch],
    productGroups,
    roles,
    permissions,
    auditLogs,
    wikiVaults: [wikiVaultEcs, wikiVaultRds],
    wikiPages: {
      "ecs-wiki": [pageEcsDisk, pageEcsSg, pageEcsSsh],
      "rds-wiki": [pageRdsConn],
    },
  };
  const clone = JSON.parse(JSON.stringify(seed)) as Omit<
    DemoState,
    "reservedAgentPool"
  >;
  return { ...clone, reservedAgentPool: [...RESERVED_AGENT_IDS] };
}
