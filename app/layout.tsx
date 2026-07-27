import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "衣集｜你的个人搭配档案",
  description: "记录衣服单品与穿搭组合，点开一件衣服即可查看它的所有搭配。",
  openGraph: {
    title: "衣集｜你的个人搭配档案",
    description: "把每一件衣服，放回它的搭配故事里。",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "衣集个人搭配档案",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "衣集｜你的个人搭配档案",
    description: "把每一件衣服，放回它的搭配故事里。",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
