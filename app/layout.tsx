import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BroadcastAwayToasts } from "@/components/BroadcastAwayToasts";
import { BroadcastToastProvider } from "@/components/BroadcastToastProvider";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
          {children}
          <BroadcastAwayToasts />
          <BottomNav />
        </BroadcastToastProvider>
      </body>
    </html>
  );
}
