/**
 * BM25-lite 纯算法层（零依赖 · 浏览器安全）。
 *
 * 抽离动机：检索语义此前只存在于 lib/services/retrieval-service.ts，而该模块顶层
 * import prisma，静态演示轨（demo/mock-server.ts 在浏览器内拦截 fetch）无法复用，
 * 只能手写第二套实现——这正是 /api/wiki/vaults/[id]/search 在 demo 轨缺失的成因。
 * 本文件不 import 任何 Node/Prisma 依赖，服务端与浏览器共用同一份打分逻辑。
 *
 * 算法约定（与服务端保持一致，改动需同步 retrieval-service.test.ts）：
 * - 分词：中文按单字 + 相邻双字 bigram（虚词单字丢弃，见 CJK_STOP_UNIGRAMS），
 *   拉丁按词，全小写
 * - 打分：title ×3, tags ×2, summary ×1, content ×0.5；tf 饱和 tf/(tf+1.2)；
 *   CJK 单字 token 权重 ×0.5（批⑤：抑制「完全」含「全」这类高频字污染）
 * - confidence：检索分归一化 0-1，与 page.baseConfidence 加权（0.6/0.4）
 * - 零分页（与查询无任何词面重叠）不进入 results：否则高 baseConfidence 的不相关页
 *   会凭 0.4×base 的置信度底数越过门限混入上下文
 */

/** 参与打分所需的最小页面形态（content/summary 可为空） */
export interface RankablePage {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string | null;
  tags: string[];
  baseConfidence: number;
}

export interface RankedHit {
  pageId: string;
  title: string;
  slug: string;
  score: number;
  confidence: number;
  excerpt: string;
  usedInContext: boolean;
}

export interface RankedMiss {
  pageId: string;
  score: number;
  confidence: number;
}

export interface RankOutcome {
  candidates: number;
  results: RankedHit[];
  belowThreshold: RankedMiss[];
}

/**
 * CJK 虚词单字停用表（批⑤新增）。
 *
 * 收录判据：该字单独成 token 时几乎不携带检索信息（助词/系词/连词/介词/代词/
 * 疑问语气字），且它承载的短语信息一定由同段 bigram 保留——丢弃「对」之后
 * 「对象」仍在，丢弃「不」之后「不上/连不」仍在。因此丢单字不丢召回，只降噪。
 * 注意：只作用于查询侧（tokenize 的唯一用途），文档侧本就按查询 token 扫描。
 */
export const CJK_STOP_UNIGRAMS: ReadonlySet<string> = new Set(
  "的了是在和与或及等而就都很最被把从向以为之于对让给由这那些个们我你他她它吗呢吧啊呀嘛不怎么".split(
    "",
  ),
);

/** CJK 单字 token 的打分权重（批⑤）：单字区分度低（「全」命中「完全」），
 *  半权让更具区分度的 bigram 与拉丁整词主导排序。 */
export const UNIGRAM_WEIGHT = 0.5;

const CJK_SINGLE_RE = /^[一-鿿]$/;

/** token 权重：CJK 单字 ×UNIGRAM_WEIGHT，bigram 与拉丁整词 ×1 */
export function tokenWeight(token: string): number {
  return CJK_SINGLE_RE.test(token) ? UNIGRAM_WEIGHT : 1;
}

/** 分词：中文字符 + bigram（虚词单字丢弃），拉丁词，全小写 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  // 匹配连续 CJK 字符或连续拉丁/数字字符
  const segments = lower.match(/[一-鿿]+|[a-z0-9]+/g) ?? [];
  for (const seg of segments) {
    if (/[一-鿿]/.test(seg)) {
      // CJK: 单字 + 相邻双字 bigram（bigram 永远保留，含虚词的短语靠它兜住）
      for (let i = 0; i < seg.length; i++) {
        if (!CJK_STOP_UNIGRAMS.has(seg[i])) tokens.push(seg[i]);
        if (i + 1 < seg.length) tokens.push(seg.slice(i, i + 2));
      }
    } else {
      // 拉丁/数字：整词
      tokens.push(seg);
    }
  }
  return tokens;
}

/** BM25-lite tf 饱和 */
export function tfSat(tf: number, k = 1.2): number {
  return tf / (tf + k);
}

/** 统计 token 在文本中出现次数 */
export function countToken(token: string, text: string): number {
  if (token.length <= 2) {
    let count = 0;
    let pos = 0;
    while ((pos = text.indexOf(token, pos)) !== -1) {
      count++;
      pos += token.length;
    }
    return count;
  }
  const re = new RegExp(`\\b${token}\\b`, "gi");
  return (text.match(re) ?? []).length;
}

export function scorePage(page: RankablePage, queryTokens: string[]): number {
  const titleText = (page.title ?? "").toLowerCase();
  const tagsText = (page.tags ?? []).join(" ").toLowerCase();
  const summaryText = (page.summary ?? "").toLowerCase();
  const contentText = (page.content ?? "").toLowerCase();

  let score = 0;
  for (const token of queryTokens) {
    const w = tokenWeight(token);
    score += tfSat(countToken(token, titleText)) * 3 * w;
    score += tfSat(countToken(token, tagsText)) * 2 * w;
    score += tfSat(countToken(token, summaryText)) * 1 * w;
    score += tfSat(countToken(token, contentText)) * 0.5 * w;
  }
  return score;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 对候选页集合打分、归一化、按门限切分。
 *
 * @param candidates 已进入打分的页面数（用于回传 candidates 计数，
 *                   调用方可传入 DB 侧筛出的候选集大小）
 */
export function rankPages(
  pages: RankablePage[],
  query: string,
  maxResults: number,
  confidenceThreshold: number,
  candidates = pages.length,
): RankOutcome {
  const queryTokens = tokenize(query);
  const scored = pages.map((page) => ({ page, rawScore: scorePage(page, queryTokens) }));

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

  normalized.sort((a, b) => b.score - a.score);

  const results: RankedHit[] = [];
  const belowThreshold: RankedMiss[] = [];

  for (const item of normalized) {
    const entry: RankedHit = {
      pageId: item.page.id,
      title: item.page.title ?? "",
      slug: item.page.slug ?? "",
      score: round2(item.score),
      confidence: round2(item.confidence),
      excerpt: (item.page.content ?? "").slice(0, 400),
      usedInContext: false,
    };

    if (
      item.score > 0 &&
      item.confidence >= confidenceThreshold &&
      results.length < maxResults
    ) {
      entry.usedInContext = true;
      results.push(entry);
    } else {
      belowThreshold.push({
        pageId: entry.pageId,
        score: entry.score,
        confidence: entry.confidence,
      });
    }
  }

  return { candidates, results, belowThreshold };
}
