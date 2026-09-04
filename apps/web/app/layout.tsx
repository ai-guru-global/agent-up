import type { Metadata } from "next";
import "./globals.css";
import { DemoProvider } from "@/demo/demo-provider";
import { DemoDeepLinkRedirect } from "@/demo/demo-deep-link-redirect";

export const metadata: Metadata = {
  title: "Agent 改进平台",
  description: "Agent 持续改进管理平台",
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
