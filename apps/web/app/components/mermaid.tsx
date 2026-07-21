"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let idCounter = 0;

/**
 * 主题感知的 Mermaid 渲染组件。
 * 读取 :root 上的 --foreground / --surface / --border / --accent，
 * 动态生成与 AgentUp 设计系统一致的 mermaid themeVariables。
 */
export function Mermaid({ chart, className = "" }: { chart: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    function readVar(name: string, fallback: string): string {
      if (typeof window === "undefined") return fallback;
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    }

    async function render() {
      try {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const fg = readVar("--foreground", isDark ? "#fafafa" : "#18181b");
        const surface = readVar("--surface", isDark ? "#18181b" : "#ffffff");
        const surfaceElevated = readVar("--surface-elevated", isDark ? "#27272a" : "#f4f4f5");
        const border = readVar("--border", isDark ? "#3f3f46" : "#e4e4e7");
        const accent = readVar("--accent", isDark ? "#3b82f6" : "#2563eb");
        const accentMuted = readVar("--accent-muted", isDark ? "#1e3a5f" : "#dbeafe");

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "base",
          themeVariables: {
            fontFamily:
              "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
            fontSize: "13px",
            primaryColor: surfaceElevated,
            primaryTextColor: fg,
            primaryBorderColor: border,
            lineColor: border,
            secondaryColor: surface,
            tertiaryColor: surface,
            mainBkg: surface,
            nodeBorder: border,
            clusterBkg: surface,
            clusterBorder: border,
            edgeLabelBackground: surface,
            // accent 着色用于高亮节点
            altBackground: accentMuted,
            accentColor: accent,
            textColor: fg,
          },
          flowchart: { htmlLabels: true, curve: "basis", padding: 12, useMaxWidth: true },
          sequence: { actorMargin: 50, boxMargin: 10, mirrorActors: false },
          gantt: { fontSize: 11 },
        });

        const id = `mmd-${++idCounter}`;
        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) {
          setSvg(rendered);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setSvg("");
        }
      }
    }

    render();

    // 主题切换时重渲染
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => render();
    mq.addEventListener("change", onChange);
    return () => {
      cancelled = true;
      mq.removeEventListener("change", onChange);
    };
  }, [chart]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
        Mermaid 渲染失败：{error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex justify-center overflow-x-auto rounded-lg bg-[var(--surface)] p-5 ring-1 ring-[var(--border)] ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
