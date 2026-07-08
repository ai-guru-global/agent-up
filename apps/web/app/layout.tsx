import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent 改进平台",
  description: "Agent 持续改进管理平台 — 基于三层 Loop 设计理念",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
