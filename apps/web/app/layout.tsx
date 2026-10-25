import type { Metadata } from "next";
import "./globals.css";
import { DemoProvider } from "@/demo/demo-provider";
import { DemoDeepLinkRedirect } from "@/demo/demo-deep-link-redirect";

export const metadata: Metadata = {
  title: {
    default: "Agent 改进平台",
    template: "%s · Agent 改进平台",
  },
  description: "Agent 持续改进管理平台——反馈、归因、审批发布与效果回滚的工程化闭环",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "1";
  return (
    <html lang="zh-CN" data-force-light={isDemo ? "" : undefined}>
      <body className="antialiased">
        {isDemo ? (
          <>
            <DemoDeepLinkRedirect />
            <DemoProvider>{children}</DemoProvider>
          </>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
