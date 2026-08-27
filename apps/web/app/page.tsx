import Link from "next/link";

/**
 * 公共落地页（/）。它是 dashboard 之外唯一的对外页面，负责解释
 * 「这是什么平台、它怎么运转、从哪里进」，因此在原有标题与两个入口之上
 * 补了三层 Loop 与四分区的一句话说明，避免第一次进来的人无从下手。
 */

const loops = [
  {
    tag: "L1",
    title: "即时交互环",
    desc: "用户与 Agent 的每一轮对话。回答不满意时，就地记录成一条反馈。",
  },
  {
    tag: "L2",
    title: "产品改进环",
    desc: "反馈归因到四分区，改配置、过审批、发版本，形成可回滚的快照。",
  },
  {
    tag: "L3",
    title: "智能进化环",
    desc: "把沉淀下来的语料与经验回灌知识库与提示词，让下一轮起点更高。",
  },
];

const partitions = [
  { name: "Prompt", role: "性格与纪律", desc: "怎么说话、什么不能做" },
  { name: "知识", role: "长期记忆", desc: "能查到什么料" },
  { name: "工具", role: "手", desc: "能做什么动作" },
  { name: "路由", role: "分诊台", desc: "什么该自己答、什么该转人" },
];

export default function HomePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--background)] px-4 py-16">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Agent 改进平台
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          基于三层 Loop 设计的 Agent 持续改进管理平台
        </p>
        <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-[var(--subtle)]">
          它把「用户反馈」变成「可审批、可回滚的配置变更」：反馈进来后归因到 Agent 的四个分区，
          改动经过发布审批才生效，每次生效都留下一份不可变的版本快照。
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            进入工作台
          </Link>
          <Link
            href="/login"
            className="rounded-md px-5 py-2 text-sm font-medium text-[var(--muted)] ring-1 ring-[var(--border)] transition hover:text-[var(--foreground)] hover:ring-[var(--foreground)]/20 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            登录
          </Link>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--subtle)]">
          演示环境未启用访问拦截，「进入工作台」可以直接使用；「登录」用于体验 mock 认证流程。
        </p>

        <section className="mt-12 text-left" aria-labelledby="loop-heading">
          <h2
            id="loop-heading"
            className="text-xs font-semibold uppercase tracking-wider text-[var(--subtle)]"
          >
            三层 Loop
          </h2>
          <ul className="mt-3 space-y-2">
            {loops.map((l) => (
              <li
                key={l.tag}
                className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <span className="mt-0.5 shrink-0 font-mono text-[11px] font-semibold text-[var(--accent)]">
                  {l.tag}
                </span>
                <div>
                  <p className="text-[13px] font-medium text-[var(--foreground)]">{l.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{l.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 text-left" aria-labelledby="partition-heading">
          <h2
            id="partition-heading"
            className="text-xs font-semibold uppercase tracking-wider text-[var(--subtle)]"
          >
            四分区模型
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--subtle)]">
            既是 Agent 的配置结构，也是反馈归因的分类学 —— 每条问题最终都要落到其中一个分区上。
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {partitions.map((p) => (
              <div
                key={p.name}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
              >
                <dt className="text-[13px] font-medium text-[var(--foreground)]">{p.name}</dt>
                <dd className="mt-0.5 text-[11px] text-[var(--accent)]">{p.role}</dd>
                <dd className="mt-0.5 text-[11px] leading-relaxed text-[var(--subtle)]">
                  {p.desc}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mt-8 text-xs leading-relaxed text-[var(--subtle)]">
          想先了解设计思路，可以直接看{" "}
          <Link
            href="/architecture"
            className="rounded text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            架构总览
          </Link>
          。当前为演示环境，数据来自 apps/web/data/ 下的本地 JSON，未接入真实数据库。
        </p>
      </div>
    </main>
  );
}
