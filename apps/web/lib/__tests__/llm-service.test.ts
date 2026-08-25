import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  chatCompletion,
  getLlmConfig,
  isLlmConfigured,
  LlmNotConfiguredError,
  LlmUpstreamError,
  LlmTimeoutError,
} from "@/lib/services/llm-service";

const MOCK_REPLY = {
  id: "cmpl-1",
  model: "mimo-v2.5-pro",
  choices: [{ message: { role: "assistant", content: "连通正常" } }],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
};

function stubFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

beforeEach(() => {
  process.env.MIMO_API_KEY = "tp-test";
  process.env.MIMO_BASE_URL = "https://example.test/v1";
  process.env.MIMO_MODEL = "mimo-v2.5-pro";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MIMO_API_KEY;
  delete process.env.MIMO_BASE_URL;
  delete process.env.MIMO_MODEL;
});

describe("getLlmConfig / isLlmConfigured", () => {
  it("reads env and strips trailing slash", () => {
    process.env.MIMO_BASE_URL = "https://example.test/v1/";
    const cfg = getLlmConfig();
    expect(cfg.apiKey).toBe("tp-test");
    expect(cfg.baseUrl).toBe("https://example.test/v1");
    expect(cfg.model).toBe("mimo-v2.5-pro");
    expect(isLlmConfigured()).toBe(true);
  });

  it("falls back to defaults when optional env missing", () => {
    delete process.env.MIMO_BASE_URL;
    delete process.env.MIMO_MODEL;
    const cfg = getLlmConfig();
    expect(cfg.baseUrl).toBe("https://token-plan-cn.xiaomimimo.com/v1");
    expect(cfg.model).toBe("mimo-v2.5-pro");
  });

  it("isLlmConfigured false without key", () => {
    delete process.env.MIMO_API_KEY;
    expect(isLlmConfigured()).toBe(false);
  });
});

describe("chatCompletion", () => {
  it("throws LlmNotConfiguredError when key missing", async () => {
    delete process.env.MIMO_API_KEY;
    await expect(
      chatCompletion({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(LlmNotConfiguredError);
  });

  it("parses content / usage / model and sends api-key header", async () => {
    stubFetch(MOCK_REPLY);
    const r = await chatCompletion({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.content).toBe("连通正常");
    expect(r.model).toBe("mimo-v2.5-pro");
    expect(r.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/chat/completions");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("tp-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("mimo-v2.5-pro");
    expect(body.max_completion_tokens).toBe(2048);
  });

  it("throws LlmUpstreamError on non-2xx with upstream status", async () => {
    stubFetch({ error: "rate limited" }, 429);
    const err = await chatCompletion({
      messages: [{ role: "user", content: "hi" }],
    }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmUpstreamError);
    expect(err.status).toBe(502);
    expect((err.details as { status: number }).status).toBe(429);
  });

  it("throws LlmTimeoutError when fetch times out", async () => {
    const timeoutErr = new Error("aborted");
    timeoutErr.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn(async () => { throw timeoutErr; }));
    await expect(
      chatCompletion({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(LlmTimeoutError);
  });

  it("throws LlmUpstreamError on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(
      chatCompletion({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow("无法连接 LLM 服务");
  });

  it("throws LlmUpstreamError when content is empty (reasoning overflow)", async () => {
    stubFetch({ ...MOCK_REPLY, choices: [{ message: { content: "" } }] });
    await expect(
      chatCompletion({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(LlmUpstreamError);
  });
});
