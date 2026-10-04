/**
 * BM25-lite 知识库检索服务。
 *
 * 对 PG 中的 WikiPage 做本地文本检索，
 * 为 Agent 试聊和评测重放提供知识上下文。
 *
 * 打分/排序算法在 lib/retrieval-bm25.ts（零依赖纯模块），服务端与静态演示轨
 * 的 demo/mock-server.ts 共用同一份实现，避免两轨检索语义漂移。本模块只负责
 * Prisma 取数与响应契约。
 *
 * 契约约定（wiki-search.test.ts / retrieval-service.test.ts 与 /wiki 页 UI 均依赖）：
 * - candidates = 该 vault 的页面总数，不是"命中数"
 * - belowThreshold = 未进入上下文的全部页面（零分页也在内），是面向用户的完整性清单
 * - fallbackTriggered = results 为空
 */
import { prisma } from "@agent-up/db";
import { rankPages, type RankablePage } from "@/lib/retrieval-bm25";

export interface SearchWikiParams {
  query: string;
  vaultId: string;
  maxResults: number;
  confidenceThreshold: number;
}

export interface WikiSearchResult {
  pageId: string;
  title: string;
  slug: string;
  score: number;
  confidence: number;
  excerpt: string;
  usedInContext: boolean;
}

export interface WikiSearchBelowThreshold {
  pageId: string;
  score: number;
  confidence: number;
}

export interface WikiSearchResponse {
  query: string;
  strategy: string;
  candidates: number;
  results: WikiSearchResult[];
  belowThreshold: WikiSearchBelowThreshold[];
  fallbackTriggered: boolean;
}

const FALLBACK = {
  strategy: "BM25_LITE",
  candidates: 0,
  results: [] as WikiSearchResult[],
  belowThreshold: [] as WikiSearchBelowThreshold[],
  fallbackTriggered: true,
};

async function loadPages(vaultId: string): Promise<RankablePage[]> {
  return prisma.wikiPage.findMany({
    where: { vaultId },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      content: true,
      tags: true,
      baseConfidence: true,
    },
  });
}

/**
 * 检索 wiki vault 中最相关的页面。
 *
 * 在 agent 的试聊流程和评测重放中调用；
 * 结果用于组装知识上下文段（usedInContext=true 的页面）。
 */
export async function searchWiki(params: SearchWikiParams): Promise<WikiSearchResponse> {
  const { query, vaultId, maxResults, confidenceThreshold } = params;

  if (!vaultId || !query.trim()) {
    return { query, ...FALLBACK };
  }

  const pages = await loadPages(vaultId);
  if (pages.length === 0) {
    return { query, ...FALLBACK };
  }

  const { results, belowThreshold } = rankPages(
    pages,
    query,
    maxResults,
    confidenceThreshold,
    pages.length,
  );

  return {
    query,
    strategy: "BM25_LITE",
    candidates: pages.length,
    results,
    belowThreshold,
    fallbackTriggered: results.length === 0,
  };
}
