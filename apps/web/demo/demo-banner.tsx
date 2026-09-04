"use client";

import { useState } from "react";
import { resetDemoState } from "./mock-server";

/**
 * 演示模式角标：提示数据存于内存，并提供一键重置。
 */
export function DemoBanner() {
  const [resetting, setResetting] = useState(false);

  const handleReset = () => {
    setResetting(true);
    resetDemoState();
    window.location.reload();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-amber-500/95 px-4 py-2 text-xs font-medium text-amber-950 shadow-lg backdrop-blur">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-900" />
      <span>演示模式 · 数据存于内存，刷新即重置</span>
      <button
        type="button"
        onClick={handleReset}
        disabled={resetting}
        className="ml-1 rounded-full bg-amber-900/90 px-2.5 py-0.5 text-amber-50 transition-colors hover:bg-amber-900 disabled:opacity-50"
      >
        {resetting ? "重置中…" : "重置数据"}
      </button>
    </div>
  );
}
