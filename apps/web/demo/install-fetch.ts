import { handleMockRequest } from "./mock-server";

/**
 * 演示模式 fetch 拦截器。
 *
 * 模块顶层同步执行（import 即生效，早于任何页面 useEffect 的 fetch）：
 * - 仅在浏览器环境 + NEXT_PUBLIC_DEMO_MODE=1 时 patch；
 * - 幂等保护，重复 import 不会二次包裹；
 * - 只拦截同源 /api/* 请求，其余透传原始 fetch。
 */
declare global {
  interface Window {
    __agentUpDemoFetchPatched?: boolean;
  }
}

if (
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_DEMO_MODE === "1" &&
  !window.__agentUpDemoFetchPatched
) {
  window.__agentUpDemoFetchPatched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    let pathname: string;
    let search: string;
    try {
      const u = new URL(rawUrl, window.location.origin);
      pathname = u.pathname;
      search = u.search;
    } catch {
      return originalFetch(input as RequestInfo, init);
    }
    if (!pathname.startsWith("/api/")) {
      return originalFetch(input as RequestInfo, init);
    }

    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    let body: unknown;
    const rawBody =
      init?.body ?? (input instanceof Request ? await input.clone().text() : "");
    if (rawBody) {
      try {
        body = JSON.parse(String(rawBody));
      } catch {
        body = undefined;
      }
    }

    const result = handleMockRequest(
      method,
      pathname,
      new URLSearchParams(search),
      body,
    );
    if (result.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, result.delayMs));
    }
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  };
}
