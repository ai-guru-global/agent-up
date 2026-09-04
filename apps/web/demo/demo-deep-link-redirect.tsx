"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Meoo CDN 把无扩展名深链接统一回落到根 index.html，挂载后据真实地址把路由修复到目标页
export function DemoDeepLinkRedirect() {
  const router = useRouter();

  useEffect(() => {
    const path = window.location.pathname;
    if (path !== "/" && !path.endsWith(".html")) {
      router.replace(path);
    }
  }, [router]);

  return null;
}
