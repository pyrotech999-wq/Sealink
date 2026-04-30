import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BroadcastAwayToasts } from "@/components/BroadcastAwayToasts";
import { BroadcastToastProvider } from "@/components/BroadcastToastProvider";
import { BottomNav } from "@/components/BottomNav";
import { TopNav } from "@/components/TopNav";
import "./globals.css";

function getMetadataBase(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return new URL(raw && raw.length > 0 ? raw : "http://localhost:3000");
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: "SeaLink",
    template: "%s | SeaLink",
  },
  description: "SeaLink portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
        <BroadcastToastProvider>
          <TopNav />
          {children}
          <BroadcastAwayToasts />
          <BottomNav />
        </BroadcastToastProvider>
      </body>
    </html>
  );
}
