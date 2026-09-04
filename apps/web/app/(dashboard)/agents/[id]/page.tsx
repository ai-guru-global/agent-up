import { RESERVED_AGENT_IDS } from "@/demo/seed";
import AgentDetailPage from "./agent-detail";

/**
 * 静态导出（output: export）要求动态路由在构建期枚举所有参数。
 * 预渲染 2 个种子 Agent + 8 个预留池 id（演示模式新建 Agent 会从池中分配），
 * 使新建 Agent 的详情页可直接导航。页面本身仍是全客户端渲染。
 */
export function generateStaticParams() {
  return ["ecs-assistant", "rds-assistant", ...RESERVED_AGENT_IDS].map(
    (id) => ({ id }),
  );
}

export default function Page() {
  return <AgentDetailPage />;
}
