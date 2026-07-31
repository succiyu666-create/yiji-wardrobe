import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE LOOK BOOK｜你的私人衣橱与衣帽间",
  description: "记录衣服、四季穿搭与穿着次数，用平均单次成本看懂衣柜使用效率。",
  openGraph: {
    title: "THE LOOK BOOK｜你的私人衣橱与衣帽间",
    description: "记录穿着次数与平均单次成本，让每一件衣服都物尽其用。",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "THE LOOK BOOK 私人衣橱与衣帽间",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "THE LOOK BOOK｜你的私人衣橱与衣帽间",
    description: "记录穿着次数与平均单次成本，让每一件衣服都物尽其用。",
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
