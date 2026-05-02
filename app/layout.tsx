import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BroadcastAwayToasts } from "@/components/BroadcastAwayToasts";
import { BroadcastToastProvider } from "@/components/BroadcastToastProvider";
import { BottomNav } from "@/components/BottomNav";
import { BOTTOM_DOCK_OFFSET } from "@/lib/bottom-dock-offset";
import { AppLoadSplash } from "@/components/AppLoadSplash";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SessionDeviceRegistrar } from "@/components/SessionDeviceRegistrar";
import { TopNav } from "@/components/TopNav";
import { MobSenderActiveBanner } from "@/components/MobSenderActiveBanner";
import { MobIncomingAlertHost } from "@/components/MobIncomingAlertHost";
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
  icons: {
    icon: [
      { url: "/pwa-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/pwa-512.png", sizes: "512x512", type: "image/png" }],
  },
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
        className="flex min-h-full flex-col bg-black text-zinc-100"
        style={{
          backgroundColor: "#000000",
          paddingBottom: `calc(${BOTTOM_DOCK_OFFSET} + env(safe-area-inset-bottom))`,
        }}
      >
        <BroadcastToastProvider>
          <AppLoadSplash />
          <ServiceWorkerRegister />
          <SessionDeviceRegistrar />
          <TopNav />
          <MobSenderActiveBanner />
          <MobIncomingAlertHost />
          {children}
          <BroadcastAwayToasts />
          <BottomNav />
        </BroadcastToastProvider>
      </body>
    </html>
  );
}
