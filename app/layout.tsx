import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BroadcastAwayToasts } from "@/components/BroadcastAwayToasts";
import { BroadcastToastProvider } from "@/components/BroadcastToastProvider";
import { BottomNav } from "@/components/BottomNav";
import { SessionDeviceRegistrar } from "@/components/SessionDeviceRegistrar";
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
  description: "Map, weather & sea, and anchor alerts.",
  applicationName: "SeaLink",
  appleWebApp: {
    capable: true,
    title: "SeaLink",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  /* Always dark shell; avoid light theme-color winning on mobile when OS is in light mode. */
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-black antialiased dark`}
      style={{ backgroundColor: "#000000" }}
    >
      <body
        className="flex min-h-full flex-col bg-black pb-[calc(4.25rem+env(safe-area-inset-bottom))] text-zinc-100"
        style={{ backgroundColor: "#000000" }}
      >
        <BroadcastToastProvider>
          <SessionDeviceRegistrar />
          <TopNav />
          {children}
          <BroadcastAwayToasts />
          <BottomNav />
        </BroadcastToastProvider>
      </body>
    </html>
  );
}
