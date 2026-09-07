/**
 * content.js — 运行在 agent-up 页面（http://localhost:3000 / 127.0.0.1:3000）。
 *
 * 职责（全部为「页面内」操作，与 agent-up 同源，无 CORS / 无主仓库改动）：
 * 1. AU_GET_STATE：报告当前页是否 Agent 详情页 + 提取试聊 Playground 的最近对话
 * 2. AU_SUBMIT：以当前页解析的 agentId 为准，把 popup 传来的表单内容 POST /api/feedback
 *
 * 提交身份走 x-actor-* 请求头（agent-up 的 MOCK 认证占位协议，见 lib/context.ts）：
 * 演示口径固定为 CRE 角色（cre-zhang），接入真实认证后由真实登录身份替换。
 * 会话「证据」随 sessionData 提交，标记来源 via=chrome-extension，不伪装成人工录入。
 */

(() => {
  const AGENT_DETAIL_RE = /^\/agents\/([^/]+)\/?$/;

  /** 从当前 URL 解析 Agent id；不在 Agent 详情页时返回 null */
  function agentIdFromUrl() {
    const m = window.location.pathname.match(AGENT_DETAIL_RE);
    return m ? decodeURIComponent(m[1]) : null;
  }

  /** 从 /api/agents/:id 取权威名称（同源），失败返回 null */
  async function fetchAgentName(id) {
    try {
      const res = await fetch(`${window.location.origin}/api/agents/${encodeURIComponent(id)}`, {
        headers: { Accept: "application/json" },
      });
      const json = await res.json();
      return json.success && json.data ? String(json.data.name || "") : null;
    } catch {
      return null;
    }
  }

  /**
   * 提取试聊 Playground 的对话（DOM：role="log" 容器，用户行 class 含 justify-end）。
   * 每轮保留气泡正文；按钮与 sr-only 朗读前缀被剔除，模型/耗时/tokens 元信息行
   * 转为结构化 meta 字段一并归档（对 AI 归因有参考价值）。
   * 正文按行还原（去行首尾空白 + 折叠连续空行），保留步骤/代码块的可读结构。
   * 返回最近 maxTurns 轮 [{ role: "user"|"assistant", content, meta? }]；无 Playground 时返回 []。
   */
  function extractConversation(maxTurns = 6) {
    const log = document.querySelector('[role="log"][aria-label="试聊对话记录"]');
    if (!log) return [];
    const turns = [];
    for (const row of log.children) {
      const bubble = row.firstElementChild;
      if (!bubble) continue;
      const cls = typeof row.className === "string" ? row.className : "";
      const clone = bubble.cloneNode(true);
      // meta 行（title 含"实际使用的模型"）只可能是 Playground 自己渲染的元信息，先取后删
      // data-chat-actions（打分/沉淀操作区）整体剔除，避免按钮/表单文案混入对话证据
      const metaEl = clone.querySelector("p[title]");
      const meta = metaEl ? metaEl.textContent.replace(/\s+/g, " ").trim() : "";
      clone.querySelectorAll("button, .sr-only, p[title], [data-chat-actions]").forEach((n) => n.remove());
      const text = (clone.textContent || "")
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (!text) continue;
      const isUser = cls.includes("justify-end");
      const turn = { role: isUser ? "user" : "assistant", content: text };
      if (meta) turn.meta = meta;
      turns.push(turn);
    }
    return turns.slice(-maxTurns);
  }

  /** 组装提交证据：来源标记 + 页面 + 时间 + 最近对话（作为 sessionData 原样入库） */
  function buildSessionData(conversation) {
    return {
      via: "chrome-extension",
      capturedAt: new Date().toISOString(),
      pageUrl: window.location.href,
      conversation,
    };
  }

  /**
   * 执行提交。agentId 永远以「当前 URL 解析」为准（防 popup 打开期间 SPA 切换 Agent 串台）。
   * 同源 POST /api/feedback，actor 头见文件头注释。返回 {ok, ...} 统一给 popup。
   */
  async function submitFeedback(form) {
    const agentId = agentIdFromUrl();
    if (!agentId) return { ok: false, error: "当前页面已不是 Agent 详情页，请回到试聊页面重试" };
    try {
      const conversation = extractConversation(6);
      const res = await fetch(`${window.location.origin}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-id": "cre-zhang",
          "x-actor-name": "CRE 张一",
          "x-actor-role": "cre_viewer",
        },
        body: JSON.stringify({
          agentId,
          title: form.title,
          content: form.content,
          rating: form.rating,
          severity: form.severity,
          tags: form.tag ? [form.tag] : undefined,
          sessionData: buildSessionData(conversation),
        }),
      });
      const json = await res.json();
      if (json.success) return { ok: true, feedback: json.data };
      const detail = Array.isArray(json.details) && json.details.length ? `（${json.details.join("；")}）` : "";
      return { ok: false, error: `${json.error || "提交失败"}${detail}` };
    } catch {
      return { ok: false, error: "网络错误：提交未到达 agent-up，请确认服务仍在运行" };
    }
  }

  /** 收集当前页面状态给 popup 渲染 */
  async function collectState() {
    const agentId = agentIdFromUrl();
    if (!agentId) return { ok: true, inAgentPage: false, pageUrl: window.location.href };
    const [name, conversation] = await Promise.all([fetchAgentName(agentId), Promise.resolve(extractConversation(6))]);
    return {
      ok: true,
      inAgentPage: true,
      agentId,
      agentName: name || agentId,
      pageUrl: window.location.href,
      conversation,
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "AU_GET_STATE") {
      collectState().then(sendResponse).catch(() => sendResponse({ ok: false, error: "页面状态读取失败" }));
      return true; // 异步响应
    }
    if (msg.type === "AU_SUBMIT") {
      submitFeedback(msg.payload || {}).then(sendResponse);
      return true;
    }
  });
})();
