"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CountLine,
  EmptyState,
  Field,
  Hint,
  Input,
  Modal,
  PageHeader,
  Skeleton,
  StatusBadge,
  Textarea,
  WIKI_LIFECYCLE,
  WIKI_META_HELP,
  WIKI_TIER,
} from "@/components/ui";

interface Vault {
  id: string;
  name: string;
  description: string | null;
  agentId: string | null;
  agent: { id: string; name: string } | null;
  isShared: boolean;
  pageCount: number;
  avgConfidence: number;
  orphanCount: number;
  gitRepoUrl: string | null;
  updatedAt: string;
  _count: { pages: number; ingestJobs: number };
}

interface WikiPageItem {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  lifecycle: string;
  tier: string;
  baseConfidence: number;
  tags: string[];
  updatedAt: string;
}

export default function WikiPage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [pages, setPages] = useState<WikiPageItem[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  /** 页面列表的失败原因；原实现失败时静默留白，用户无法区分「加载失败」与「确实没有页面」 */
  const [pagesError, setPagesError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchPages = useCallback(async (vaultId: string) => {
    setPagesLoading(true);
    setPagesError("");
    try {
      const res = await fetch(`/api/wiki/vaults/${vaultId}/pages`);
      const json = await res.json();
      if (json.success) setPages(json.data.items);
      else {
        setPages([]);
        setPagesError(json.error || "页面列表加载失败");
      }
    } catch {
      setPages([]);
      setPagesError("网络错误");
    } finally {
      setPagesLoading(false);
    }
  }, []);

  /**
   * autoSelect 仅用于首次进页：默认选中第一个知识库。
   * 否则已经有知识库时，右侧仍然是一个必须再点一次才有内容的空面板。
   * 新建后重拉列表不走 autoSelect，以免把用户当前正在看的知识库跳走。
   */
  const fetchVaults = useCallback(async (autoSelect = false) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/wiki/vaults");
      const json = await res.json();
      if (json.success) {
        const items: Vault[] = json.data.items;
        setVaults(items);
        if (autoSelect && items.length > 0) {
          setSelectedVault(items[0]);
          fetchPages(items[0].id);
        }
      } else {
        // 与同页 fetchPages 一致：失败时清空，不把重试前的旧列表接着当现状
        setVaults([]);
        setError(json.error || "加载失败");
      }
    } catch {
      setVaults([]);
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [fetchPages]);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchVaults(true);
  }, [fetchVaults]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectVault = (vault: Vault) => {
    setSelectedVault(vault);
    fetchPages(vault.id);
  };

  return (
    <div>
      <PageHeader
        title="知识库"
        description="Agent 的长期记忆：知识库里有什么料，决定了它能答出什么。左侧选择一个知识库，右侧查看其中的知识页（窄屏下改为上下排列：列表在上，页面在下）。默认已选中第一个知识库。"
        hint={
          <>
            知识库对应四分区模型里的「知识」分区。Agent 回答问题时会先按配置的检索策略在绑定的知识库里查资料，
            再据此组织答案 —— 所以「答得不对」有很大一部分并不是提示词的问题，而是这里缺料、料过期或料互相矛盾。
            每一页知识都带三个决定检索行为的标记：生命周期（能不能用）、层级（排多前面）、置信度（可信到什么程度）。
            共享知识库可以被多个 Agent 同时绑定，修改会立刻影响所有绑定方，改动前请留意影响面。
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + 新建
          </Button>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left pane – vault list */}
        <section aria-labelledby="vault-list-heading" className="w-full lg:w-80 lg:shrink-0">
          <h2
            id="vault-list-heading"
            className="text-sm font-semibold tracking-tight text-[var(--foreground)]"
          >
            知识库列表
          </h2>
          <CountLine
            className="mt-1"
            error={!!error}
            unknown="知识库数量这次没能取到，不代表一个知识库都没有。"
          >
            共 {vaults.length} 个知识库。点击任一项查看它包含的知识页；窄屏下页面列表会显示在下方。
          </CountLine>

          {error && (
            <Alert
              tone="danger"
              title="知识库列表加载失败"
              className="mt-4"
              onRetry={() => fetchVaults(true)}
              retryHint="点这里会重新拉一次知识库列表，拉到就自动选中第一个。"
            >
              {error}
              <span className="mt-1 block text-xs">
                数据来自 /api/wiki/vaults。请确认服务已启动后重试。
              </span>
            </Alert>
          )}

          {loading ? (
            <div className="mt-3 space-y-2" role="status" aria-live="polite">
              <span className="sr-only">正在加载知识库列表</span>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-md" />
              ))}
            </div>
          ) : vaults.length === 0 && !error ? (
            <EmptyState
              className="mt-4"
              title="暂无知识库"
              description="还没有创建任何知识库。可以先建一个，再把它绑定到某个 Agent 的「知识」分区上，Agent 才有料可查。"
              action={
                <Button variant="primary" onClick={() => setShowCreate(true)}>
                  新建第一个知识库
                </Button>
              }
              hint="只有名称是必填项；描述与 Git 仓库地址都可以稍后补。"
            />
          ) : (
            <ul className="mt-3 space-y-2">
              {vaults.map((v) => {
                const active = selectedVault?.id === v.id;
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => selectVault(v)}
                      aria-pressed={active}
                      title={`查看「${v.name}」包含的知识页`}
                      className={`w-full rounded-md p-3 text-left ring-1 transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${
                        active
                          ? "bg-[var(--surface-elevated)] ring-[var(--accent)]"
                          : "bg-[var(--surface)] ring-[var(--border)] hover:ring-[var(--accent)]/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="min-w-0 truncate text-sm font-medium text-[var(--foreground)]">
                          {v.name}
                        </h3>
                        {v.isShared && (
                          <Badge
                            tone="accent"
                            title="共享知识库：可被多个 Agent 同时绑定，改动会影响所有绑定方"
                          >
                            共享
                          </Badge>
                        )}
                      </div>
                      {v.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]" title={v.description}>
                          {v.description}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-[var(--subtle)]">
                        <span title="该知识库当前收录的知识页数量">{v._count.pages} 页</span>
                        {v.agent && (
                          <span className="truncate" title="绑定了这个知识库的 Agent">
                            {v.agent.name}
                          </span>
                        )}
                      </div>
                      {active && <span className="sr-only">（当前已选中）</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Right pane – pages */}
        <div className="min-w-0 flex-1">
          {!selectedVault ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border)] p-8 text-center">
              <p className="text-sm font-medium text-[var(--foreground)]">选择一个知识库查看页面</p>
              <p className="max-w-md text-xs leading-relaxed text-[var(--muted)]">
                选中后这里会列出该知识库的全部知识页，以及每页的生命周期、层级与置信度 ——
                这三个标记共同决定了一页知识会不会被检索到、以及被检索到时排在多前面。
              </p>
            </div>
          ) : (
            <section aria-labelledby="vault-detail-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    id="vault-detail-heading"
                    className="text-lg font-semibold tracking-tight text-[var(--foreground)]"
                  >
                    {selectedVault.name}
                  </h2>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-[var(--muted)]">
                    <span title="该知识库当前收录的知识页数量">{selectedVault._count.pages} 页</span>
                    <span className="cursor-help" title={WIKI_META_HELP.confidence}>
                      平均置信度: {(selectedVault.avgConfidence * 100).toFixed(0)}%
                    </span>
                    <span
                      className="cursor-help"
                      title="孤立页：没有任何其他页链接到它，也不链接到别的页。这类页往往是导入时漏了上下文，检索命中率通常偏低"
                    >
                      孤立页: {selectedVault.orphanCount}
                    </span>
                    {selectedVault.gitRepoUrl && (
                      <span
                        className="min-w-0 max-w-full truncate"
                        title={`知识来源仓库：${selectedVault.gitRepoUrl}（内容以该仓库为准，同步后覆盖本地改动）`}
                      >
                        Git: {selectedVault.gitRepoUrl}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {pagesError && (
                <Alert
                  tone="danger"
                  title="页面列表加载失败"
                  className="mt-4"
                  onRetry={() => fetchPages(selectedVault.id)}
                  retryHint="点这里会重新拉一次这个知识库的页面列表，不用先点别的再点回来。"
                >
                  {pagesError}
                  <span className="mt-1 block text-xs">
                    这不代表知识库为空 —— 只是这次没能取到页面列表。可以重新点一次左侧的知识库再试。
                  </span>
                </Alert>
              )}

              {pagesLoading ? (
                <div className="mt-4 space-y-2" role="status" aria-live="polite">
                  <span className="sr-only">正在加载知识页列表</span>
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 rounded-md" />
                  ))}
                </div>
              ) : pages.length === 0 && !pagesError ? (
                <EmptyState
                  className="mt-4"
                  title="暂无页面"
                  description="这个知识库还没有任何知识页。可以通过 Git 仓库同步导入，或从历史工单中蒸馏出知识条目。空知识库绑定给 Agent 不会报错，但检索永远不会命中。"
                  hint="导入后建议先把关键页的生命周期推到「已验证」，否则草稿状态的内容在检索时优先级最低。"
                />
              ) : pages.length > 0 ? (
                <>
                  <Hint className="mt-4">
                    共 {pages.length} 页知识。每页标题右侧依次是生命周期与层级标记，悬停可看判定标准；
                    「置信度」是{WIKI_META_HELP.confidence.replace(/^置信度：/, "")}。
                  </Hint>
                  <ul className="mt-2 space-y-2">
                    {pages.map((pg) => (
                      <li key={pg.id}>
                        <Card pad="sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium text-[var(--foreground)]">{pg.title}</h3>
                            <StatusBadge dict={WIKI_LIFECYCLE} code={pg.lifecycle} />
                            <StatusBadge dict={WIKI_TIER} code={pg.tier} />
                            <span
                              className="cursor-help text-xs tabular-nums text-[var(--muted)]"
                              title={`${WIKI_META_HELP.confidence}。这一页的自评可信度为 ${(pg.baseConfidence * 100).toFixed(0)}%`}
                            >
                              置信度: {(pg.baseConfidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          {pg.summary && (
                            <p
                              className="mt-1 line-clamp-1 text-sm leading-relaxed text-[var(--muted)]"
                              title={pg.summary}
                            >
                              {pg.summary}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--subtle)]">
                            <span
                              className="cursor-help font-mono"
                              title="slug：这一页在知识库内的唯一标识，检索结果与引用链接都用它定位"
                            >
                              {pg.slug}
                            </span>
                            <span className="tabular-nums" title="最近一次修改时间">
                              {new Date(pg.updatedAt).toLocaleDateString("zh-CN")}
                            </span>
                            {pg.tags.length > 0 && (
                              <span
                                className="flex flex-wrap items-center gap-1"
                                title={`标签用于按主题聚合与过滤知识页。全部标签：${pg.tags.join("、")}`}
                              >
                                <span className="sr-only">标签：</span>
                                {pg.tags.slice(0, 3).map((t) => (
                                  <span
                                    key={t}
                                    className="rounded bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--muted)]"
                                  >
                                    {t}
                                  </span>
                                ))}
                                {pg.tags.length > 3 && (
                                  <span title={`另有 ${pg.tags.length - 3} 个标签：${pg.tags.slice(3).join("、")}`}>
                                    +{pg.tags.length - 3}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 rounded-md border border-dashed border-[var(--border)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      三个标记怎么读
                    </p>
                    <dl className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--muted)]">
                      <div>
                        <dt className="inline font-medium text-[var(--foreground)]">生命周期：</dt>{" "}
                        <dd className="inline">
                          {Object.entries(WIKI_LIFECYCLE)
                            .map(([code, m]) => `${m.label}（${code}）${m.desc}`)
                            .join("；")}
                          。
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-medium text-[var(--foreground)]">层级：</dt>{" "}
                        <dd className="inline">
                          {Object.entries(WIKI_TIER)
                            .map(([code, m]) => `${m.label}（${code}）${m.desc}`)
                            .join("；")}
                          。
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-medium text-[var(--foreground)]">置信度：</dt>{" "}
                        <dd className="inline">{WIKI_META_HELP.confidence.replace(/^置信度：/, "")}。</dd>
                      </div>
                      <div>
                        <dt className="inline font-medium text-[var(--foreground)]">来源：</dt>{" "}
                        <dd className="inline">{WIKI_META_HELP.provenance.replace(/^来源：/, "")}。</dd>
                      </div>
                    </dl>
                  </div>
                </>
              ) : null}
            </section>
          )}
        </div>
      </div>

      <CreateVaultModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          // 创建的是第一个知识库时自动选中它，避开「刚建完却还是空面板」的断点
          fetchVaults(!selectedVault);
        }}
      />
    </div>
  );
}

function CreateVaultModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gitRepoUrl, setGitRepoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    if (!name) {
      setErr("请填写名称");
      return;
    }
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch("/api/wiki/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          gitRepoUrl: gitRepoUrl || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) onCreated();
      else setErr(json.error || "创建失败");
    } catch {
      setErr("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建知识库"
      description="知识库是一组知识页的容器。建好之后还需要到某个 Agent 的「知识」分区把它绑定上，Agent 才会在回答时检索它。"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            loadingText="创建中..."
          >
            创建
          </Button>
        </>
      }
    >
      {err && (
        <Alert tone="danger" title="创建未完成" className="mb-3">
          {err}
        </Alert>
      )}
      <div className="space-y-3">
        <Field
          label="名称"
          required
          hint="团队内可辨识的短名称，例如「ECS 运维手册」。名称会出现在 Agent 的知识分区绑定列表里，建议直接写清覆盖的业务范围。"
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ECS 运维手册"
            />
          )}
        </Field>
        <Field
          label="描述"
          hint="一句话说明这个知识库收录什么、不收录什么。多个知识库共存时，这句话决定别人会不会误绑。"
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="py-1.5"
              placeholder="e.g. 收录 ECS 实例创建、扩容与故障排查的标准流程，不含网络与存储"
            />
          )}
        </Field>
        <Field
          label="Git 仓库 URL"
          hint="选填。填写后可从该仓库同步 Markdown 作为知识来源，内容以仓库为准；留空则表示这个知识库的内容在平台内直接维护。"
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={gitRepoUrl}
              onChange={(e) => setGitRepoUrl(e.target.value)}
              placeholder="https://github.com/..."
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
