/**
 * 共享 UI 层统一出口。页面统一从 "@/components/ui" 导入，
 * 避免再出现同一语义在多个页面各写一套 Tailwind 的情况。
 */

export * from "./status";
export * from "./primitives";
export * from "./form";
export * from "./modal";
