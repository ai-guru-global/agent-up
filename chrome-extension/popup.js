/**
 * popup.js — 扩展弹窗控制器。
 *
 * 状态机：checking → ready（收集表单）/ empty（非 Agent 详情页引导）→ done（提交成功）
 * 弹窗自身是扩展 origin，不能跨域访问 agent-up；所有页面读取与提交
 * 都经 chrome.tabs.sendMessage 委托给 content.js 以页面同源执行。
 */

(() => {
  const $ = (sel) => document.querySelector(sel);

  const els = {
    checking: $("#view-checking"),
    empty: $("#view-empty"),
    ready: $("#view-ready"),
    done: $("#view-done"),
    agentName: $("#agent-name"),
    agentMeta: $("#agent-meta"),
    title: $("#title"),
    content: $("#content"),
    severity: $("#severity"),
    tag: $("#tag"),
    segOpts: Array.from(document.querySelectorAll(".au-seg-opt")),
    evCount: $("#ev-count"),
    evList: $("#ev-list"),
    submit: $("#btn-submit"),
    formError: $("#form-error"),
    doneId: $("#done-id"),
  };

  let tabId = null;
  let pageUrl = "";
  let conversation = [];

  /* ---------------- 视图切换 ---------------- */

  function show(name) {
    ["checking", "empty", "ready", "done"].forEach((v) => {
      els[v === name ? name : v].hidden = v !== name;
    });
  }

  /* ---------------- 消息委托 ---------------- */

  function askContent(message, timeoutMs = 1500) {
    return new Promise((resolve) => {
      if (tabId == null) return resolve({ ok: false, reason: "no-tab" });
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, reason: "timeout" });
      }, timeoutMs);
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError) resolve({ ok: false, reason: "no-content" });
        else resolve(resp || { ok: false, reason: "empty" });
      });
    });
  }

  /* ---------------- 初始化：读取页面状态 ---------------- */

  async function init() {
    show("checking");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab ? tab.id : null;
    const state = await askContent({ type: "AU_GET_STATE" }, 2000);
    if (!state.ok || !state.inAgentPage) {
      show("empty");
      return;
    }
    pageUrl = state.pageUrl || "";
    conversation = Array.isArray(state.conversation) ? state.conversation : [];
    els.agentName.textContent = state.agentName || state.agentId;
    els.agentMeta.textContent = state.agentId;
    els.title.value = defaultTitle(state.agentName || state.agentId);
    renderEvidence();
    show("ready");
    validate();
  }

  function defaultTitle(agentName) {
    const firstAsk = conversation.find((t) => t.role === "user");
    const hint = firstAsk ? firstAsk.content.slice(0, 18) : "";
    return `客服反馈：${agentName}${hint ? `（${hint}${firstAsk.content.length > 18 ? "…" : ""}）` : ""}`;
  }

  /* ---------------- 会话证据预览 ---------------- */

  function renderEvidence() {
    els.evCount.textContent = String(conversation.length);
    els.evList.textContent = "";
    conversation.forEach((turn) => {
      const row = document.createElement("div");
      row.className = "au-ev-turn";

      const who = document.createElement("span");
      who.className = "au-ev-who";
      who.textContent = turn.role === "user" ? "客服（用户）" : "Agent";

      const text = document.createElement("span");
      text.className = `au-ev-text${turn.role === "user" ? " is-user" : ""}`;
      text.textContent = turn.content;

      row.append(who, text);
      if (turn.meta) {
        // Agent 回复的实际模型 · 耗时 · tokens，随对话一并作为证据归档
        const meta = document.createElement("span");
        meta.className = "au-ev-meta";
        meta.textContent = turn.meta;
        row.append(meta);
      }
      els.evList.append(row);
    });
  }

  /* ---------------- 表单行为 ---------------- */

  function currentRating() {
    const checked = document.querySelector('input[name="rating"]:checked');
    return checked ? checked.value : "NEGATIVE";
  }

  els.segOpts.forEach((opt) => {
    opt.addEventListener("click", () => {
      els.segOpts.forEach((o) => o.classList.toggle("is-on", o === opt));
      const input = opt.querySelector('input[type="radio"]');
      if (input) input.checked = true;
      // 评价与问题类型联动：不满意默认补一个 MAJOR 的提示级联太啰嗦，仅置空错误
      validate();
    });
  });

  els.title.addEventListener("input", validate);
  els.content.addEventListener("input", validate);

  function validate() {
    const contentOk = els.content.value.trim().length > 0;
    const titleOk = els.title.value.trim().length > 0;
    els.formError.hidden = true;
    els.submit.disabled = !(contentOk && titleOk);
    return contentOk && titleOk;
  }

  function setError(text) {
    els.formError.textContent = text || "";
    els.formError.hidden = !text;
  }

  /* ---------------- 提交 ---------------- */

  async function submit() {
    if (!validate()) return;
    const form = {
      rating: currentRating(),
      severity: els.severity.value,
      tag: els.tag.value,
      title: els.title.value.trim(),
      content: els.content.value.trim(),
    };
    els.submit.disabled = true;
    els.submit.classList.add("is-loading");
    els.submit.textContent = "提交中…";
    setError("");

    const resp = await askContent({ type: "AU_SUBMIT", payload: form }, 10000);
    if (resp.ok) {
      els.doneId.textContent = resp.feedback?.id || "—";
      show("done");
    } else {
      const why =
        resp.reason === "no-content" || resp.reason === "timeout"
          ? "与页面的连接已断开（可能刚刷新或切走了标签）。请回到试聊页面重试。"
          : resp.error || "提交失败，请重试";
      setError(why);
      els.submit.disabled = false;
      els.submit.classList.remove("is-loading");
      els.submit.textContent = "提交到反馈池";
    }
  }

  /* ---------------- 事件绑定 ---------------- */

  els.submit.addEventListener("click", submit);

  $("#btn-open-demo").addEventListener("click", () => {
    chrome.tabs.create({ url: "http://localhost:3000/agents/ecs-assistant/" });
  });

  $("#btn-open-list").addEventListener("click", () => {
    const origin = pageUrl ? new URL(pageUrl).origin : "http://localhost:3000";
    chrome.tabs.create({ url: `${origin}/feedback/` });
    window.close();
  });

  els.againBtn = $("#btn-again");
  els.againBtn.addEventListener("click", () => {
    els.content.value = "";
    els.formError.hidden = true;
    validate();
    show("ready");
  });

  document.addEventListener("keydown", (e) => {
    // Cmd/Ctrl + Enter 快捷提交（与 agent-up 页面编辑习惯一致）
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!els.submit.disabled) submit();
    }
  });

  init();
})();
