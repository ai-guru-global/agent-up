"use client";

import "@/demo/install-fetch";
import { DemoBanner } from "./demo-banner";

/**
 * 演示模式注入点：import 副作用安装 fetch 拦截（先于任何子组件 effect），
 * 并渲染演示角标。仅由 root layout 在 NEXT_PUBLIC_DEMO_MODE=1 时挂载。
 */
export function DemoProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <DemoBanner />
    </>
  );
}
