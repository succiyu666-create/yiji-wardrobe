import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE LOOK BOOK｜你的私人衣橱与衣帽间",
  description: "记录衣服单品与四季穿搭，点开一件衣服即可查看它的所有搭配。",
  openGraph: {
    title: "THE LOOK BOOK｜你的私人衣橱与衣帽间",
    description: "把喜欢的衣服和每一套搭配，轻松收进你的私人造型册。",
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
    description: "把喜欢的衣服和每一套搭配，轻松收进你的私人造型册。",
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
