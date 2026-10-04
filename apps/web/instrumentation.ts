/**
 * Next.js 启动钩子：服务进程启动时执行一次。
 *
 * 实测口径（AUTH_SECRET 探针验证）：`next build` 与 `DEMO_EXPORT=1` 静态导出
 * 都不会触发 register，因此校验放在这里不会要求构建期配置运行时密钥。
 *
 * 当前只做一件事——生产环境缺 AUTH_SECRET 就让进程退出。不能只 throw：
 * 实测 Next.js 16 会把 instrumentation 抛出的错误记成 unhandledRejection 后
 * 照常监听端口，服务「看起来起来了」但签不出任何令牌，比静默降级更危险。
 * 所以必须显式 process.exit 把进程真正杀死，交给进程管理器去重启并告警。
 */
export async function register() {
  // edge runtime 没有 node:crypto；用动态 import 避免把服务端依赖拖进去。
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertAuthConfigured } = await import("./lib/auth-token");
  try {
    assertAuthConfigured();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
