"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from "@/components/ui";

interface EvalCaseItem {
  id: string;
  agentId: string;
  sourceTraceId: string;
  title: string;
  expectation: string;
  message: string;
  referenceReply: string;
  status: string;
  createdAt: string;
  createdBy: string;
}

/**
 * 评测用例库：展示该 Agent 已沉淀的评测用例（来源 Playground 打分）。
 *
 * 这些用例是「发布前 AI 评测」的 replay 语料：提交发布后，在发布审批页
 * 运行 AI 评测，会用待发布配置重放这里每个用例并与参考回复对比。
 * 删除 = 从语料中移除（可随时在 Playground 重新沉淀），不影响原 trace。
 */
export function EvalCasePanel({ agentId }: { agentId: string }) {
  const [items, setItems] = useState<EvalCaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState("");

  const fetchList = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/agents/${agentId}/eval-cases`);
      const json = await res.json();
      if (json.success) setItems(json.data.items);
      else {
        setItems([]);
        setErr(json.error || "加载失败");
      }
    } catch {
      setItems([]);
      setErr("网络错误");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchList(); }, [fetchList]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    setDeleteErr("");
    try {
      const res = await fetch(`/api/eval-cases/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success === false) setDeleteErr(json.error || "删除失败");
      fetchList();
    } catch {
      setDeleteErr("网络错误，删除未生效");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="mt-8" aria-labelledby="eval-case-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="eval-case-heading" className="text-sm font-semibold text-[var(--foreground)]">
          评测用例库
        </h2>
        {items.length > 0 && (
          <Badge
            tone="info"
            title="这些用例将作为发布前 AI 评测的 replay 语料"
          >
            {items.length} 个用例
          </Badge>
        )}
        <span className="text-[11px] text-[var(--subtle)]">
          在下方 Playground 对回复打分后，可一键沉淀为回归评测用例
        </span>
      </div>

      {deleteErr && (
        <Alert tone="danger" title="删除失败" className="mt-3">
          {deleteErr}
          <span className="mt-1 block text-xs">删除未生效，用例仍在评测语料中。</span>
        </Alert>
      )}

      {loading ? (
        <div className="mt-3 space-y-2" role="status" aria-live="polite">
          <span className="sr-only">正在加载评测用例</span>
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
      ) : err ? (
        <Alert
          tone="danger"
          title="评测用例加载失败"
          className="mt-3"
          onRetry={fetchList}
        >
          {err}
        </Alert>
      ) : items.length === 0 ? (
        <EmptyState
          className="mt-3"
          title="还没有评测用例"
          description="到下方 Playground 真实试聊并给回复打分，把有价值的回复沉淀为评测用例；提交发布后即可运行 AI 回归评测。"
        />
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((c) => (
            <li key={c.id}>
              <Card pad="sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--foreground)]">{c.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--subtle)]">
                      期望：{c.expectation}
                    </p>
                    <p className="mt-1 text-[10px] tabular-nums text-[var(--subtle)]">
                      沉淀于 {new Date(c.createdAt).toLocaleString("zh-CN")}
                      {c.createdBy ? ` · ${c.createdBy}` : ""} · 含参考回复
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDelete(c.id)}
                    loading={deleting === c.id}
                    loadingText="移除中…"
                    title="从评测语料中移除（可在 Playground 重新沉淀）"
                  >
                    移除
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
