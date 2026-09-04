import type { NextConfig } from "next";

/**
 * DEMO_EXPORT=1 时产出纯静态演示站点：
 * - output: "export" 输出 out/ 目录（无 Node 服务端）；
 * - trailingSlash 保证静态托管（Meoo CDN）子路径直接命中 index.html；
 * - NEXT_PUBLIC_DEMO_MODE=1 使 demo fetch 拦截层生效。
 * 正常构建（不带该变量）零影响。
 */
const isDemoExport = process.env.DEMO_EXPORT === "1";

const nextConfig: NextConfig = isDemoExport
  ? {
      output: "export",
      trailingSlash: true,
      pageExtensions: ["tsx"],
      env: { NEXT_PUBLIC_DEMO_MODE: "1" },
    }
  : {};

export default nextConfig;
