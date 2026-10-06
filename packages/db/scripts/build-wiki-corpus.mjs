/**
 * wiki 语料编译（批⑧，风险 #10）：knowledge 下的 markdown → prisma/wiki-corpus.mjs
 *
 * 为什么需要这一步：SQLite 里没有文件系统，wiki 正文必须作为数据行入库；
 * 但把几千字运维正文直接写在 seed-data.mjs 里既难读也难 diff。折中方案是
 * markdown 留在仓库（knowledge/，可评审、可 grep），编译成一份生成的 JS 常量，
 * 让 seed 轨与 demo 轨读同一个文件——正文只有一份事实源。
 *
 * 双向校验：seed-data.mjs 声明的 filePath 缺 markdown 会报错，
 * knowledge/ 下多出的 markdown（没有任何 wikiPage 引用）同样报错。
 * 静默丢正文正是本批要消除的那类问题。
 *
 * 运行：pnpm --filter @agent-up/db wiki:corpus
 *      （或 node packages/db/scripts/build-wiki-corpus.mjs）
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedData } from "../prisma/seed-data.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const corpusDir = join(repoRoot, "knowledge");
const outFile = join(repoRoot, "packages/db/prisma/wiki-corpus.mjs");

/** 递归收集 .md，返回相对 knowledge/ 的路径（与 seed-data 的 filePath 同形） */
function collectMarkdown(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) found.push(...collectMarkdown(full));
    else if (st.isFile() && name.endsWith(".md")) found.push(relative(corpusDir, full).split("\\").join("/"));
  }
  return found.sort();
}

if (!statSync(corpusDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`[wiki:corpus] 语料目录不存在：${corpusDir}`);
  process.exit(1);
}

const declared = seedData.wikiPages.map((p) => p.filePath).sort();
const onDisk = collectMarkdown(corpusDir);

const missing = declared.filter((f) => !onDisk.includes(f));
const orphan = onDisk.filter((f) => !declared.includes(f));
if (missing.length || orphan.length) {
  for (const f of missing) console.error(`[wiki:corpus] 缺少正文：${f}（seed-data 声明了 filePath，knowledge/ 下没有对应 .md）`);
  for (const f of orphan) console.error(`[wiki:corpus] 孤立正文：${f}（knowledge/ 下有 .md，但没有任何 wikiPage 引用它）`);
  process.exit(1);
}

/** 逐字节照搬磁盘内容，不做换行或空白归一——一致性测试按同一条规则比对 */
const corpus = {};
let totalBytes = 0;
for (const f of onDisk) {
  const text = readFileSync(join(corpusDir, f), "utf-8");
  if (!text.trim()) {
    console.error(`[wiki:corpus] 正文为空：${f}`);
    process.exit(1);
  }
  corpus[f] = text;
  totalBytes += Buffer.byteLength(text, "utf-8");
}

const body = JSON.stringify(corpus, null, 2);
writeFileSync(
  outFile,
  `/**
 * 由 packages/db/scripts/build-wiki-corpus.mjs 从 knowledge 下的 markdown 生成，请勿手改。
 * 重新生成：pnpm --filter @agent-up/db wiki:corpus
 *
 * 键为 seed-data.mjs 中 wikiPages 的 filePath，值为 markdown 正文原文（UTF-8，逐字节照搬）。
 * seed 轨与 demo 轨都从这里取正文，因此本文件是两轨共同的唯一事实源。
 * 一致性由 apps/web/lib/__tests__/wiki-corpus.test.ts 强制（含与磁盘 markdown 的逐字节比对）。
 */
export const wikiCorpus = ${body};
`,
  "utf-8",
);

console.log(`[wiki:corpus] ${onDisk.length} 页 / ${totalBytes} B → ${relative(repoRoot, outFile)}`);
for (const f of onDisk) {
  console.log(`  ${Buffer.byteLength(corpus[f], "utf-8").toString().padStart(6)} B  ${f}`);
}
