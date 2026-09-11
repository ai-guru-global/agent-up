/**
 * BM25-lite 知识库检索服务。
 *
 * 对 PG 中的 WikiPage 做本地文本检索，
 * 为 Agent 试聊和评测重放提供知识上下文。
 *
 * 设计决策：
 * - 分词：中文按单字 + 相邻双字 bigram，拉丁按词，全小写
 * - 打分：title ×3, tags ×2, summary ×1, content ×0.5；tf 饱和 tf/(tf+1.2)
 * - confidence：检索分归一化 0-1，与 page.baseConfidence 加权（0.6/0.4）
 * - 低于 confidenceThreshold 的不入上下文，记入 belowThreshold
 */
import { prisma } from "@agent-up/db";

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

/** 分词：中文字符 + bigram，拉丁词，全小写 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  // 匹配连续 CJK 字符或连续拉丁/数字字符
  const segments = lower.match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) ?? [];
  for (const seg of segments) {
    if (/[\u4e00-\u9fff]/.test(seg)) {
      // CJK: individual chars + bigrams
      for (let i = 0; i < seg.length; i++) {
        tokens.push(seg[i]);
        if (i + 1 < seg.length) tokens.push(seg.slice(i, i + 2));
      }
    } else {
      // Latin/number: whole word
      tokens.push(seg);
    }
  }
  return tokens;
}

/** BM25-lite tf 饱和 */
function tfSat(tf: number, k = 1.2): number {
  return tf / (tf + k);
}

/** 统计 token 在文本中出现次数 */
function countToken(token: string, text: string): number {
  if (token.length <= 2) {
    // CJK char/bigram: exact substring count
    let count = 0;
    let pos = 0;
    while ((pos = text.indexOf(token, pos)) !== -1) {
      count++;
      pos += token.length;
    }
    return count;
  }
  // Latin word: word boundary match
  const re = new RegExp(`\\b${token}\\b`, "gi");
  return (text.match(re) ?? []).length;
}

interface WikiPage {
  id: string;
  vaultId: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  tags: string[];
  baseConfidence: number;
}

async function loadPages(vaultId: string): Promise<WikiPage[]> {
  return prisma.wikiPage.findMany({
    where: { vaultId },
    select: {
      id: true,
      vaultId: true,
      title: true,
      slug: true,
      summary: true,
      content: true,
      tags: true,
      baseConfidence: true,
    },
  });
}

function scorePage(page: WikiPage, queryTokens: string[]): number {
  const titleText = (page.title ?? "").toLowerCase();
  const tagsText = (page.tags ?? []).join(" ").toLowerCase();
  const summaryText = (page.summary ?? "").toLowerCase();
  const contentText = (page.content ?? "").toLowerCase();

  let score = 0;
  for (const token of queryTokens) {
    score += tfSat(countToken(token, titleText)) * 3;
    score += tfSat(countToken(token, tagsText)) * 2;
    score += tfSat(countToken(token, summaryText)) * 1;
    score += tfSat(countToken(token, contentText)) * 0.5;
  }
  return score;
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
    return { query, strategy: "BM25_LITE", candidates: 0, results: [], belowThreshold: [], fallbackTriggered: true };
  }

  const pages = await loadPages(vaultId);
  if (pages.length === 0) {
    return { query, strategy: "BM25_LITE", candidates: 0, results: [], belowThreshold: [], fallbackTriggered: true };
  }

  const queryTokens = tokenize(query);

  // score all pages
  const scored = pages.map((p) => ({ page: p, rawScore: scorePage(p, queryTokens) }));

  // 归一化：最高分映射到 1.0（最低为 0），若最高分 0 则全部 0
  const maxRaw = Math.max(...scored.map((s) => s.rawScore), 0);
  const normalized = scored.map((s) => {
    const retrievalConf = maxRaw > 0 ? s.rawScore / maxRaw : 0;
    const base = s.page.baseConfidence ?? 0.5;
    return {
      page: s.page,
      score: s.rawScore,
      confidence: 0.6 * retrievalConf + 0.4 * base,
    };
  });

  // 按 score 降序
  normalized.sort((a, b) => b.score - a.score);

  const results: WikiSearchResult[] = [];
  const belowThreshold: WikiSearchBelowThreshold[] = [];

  for (const item of normalized) {
    const entry = {
      pageId: item.page.id,
      title: item.page.title ?? "",
      slug: item.page.slug ?? "",
      score: Math.round(item.score * 100) / 100,
      confidence: Math.round(item.confidence * 100) / 100,
      excerpt: (item.page.content ?? "").slice(0, 400),
      usedInContext: false,
    };

    if (item.confidence >= confidenceThreshold && results.length < maxResults) {
      entry.usedInContext = true;
      results.push(entry);
    } else {
      belowThreshold.push({ pageId: entry.pageId, score: entry.score, confidence: entry.confidence });
    }
  }

  return {
    query,
    strategy: "BM25_LITE",
    candidates: pages.length,
    results,
    belowThreshold,
    fallbackTriggered: results.length === 0,
  };
}
