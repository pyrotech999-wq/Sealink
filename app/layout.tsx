import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { BroadcastAwayToasts } from "@/components/BroadcastAwayToasts";
import { BroadcastToastProvider } from "@/components/BroadcastToastProvider";
import { BottomNav } from "@/components/BottomNav";
import { CapacitorAppShell } from "@/components/CapacitorAppShell";
import { AppLoadSplash } from "@/components/AppLoadSplash";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SessionDeviceRegistrar } from "@/components/SessionDeviceRegistrar";
import { SessionProfileEmailSync } from "@/components/SessionProfileEmailSync";
import { BroadcastReplyAlertsHost } from "@/components/BroadcastReplyAlertsHost";
import { TopNav } from "@/components/TopNav";
import { MobSenderActiveBanner } from "@/components/MobSenderActiveBanner";
import { MobIncomingAlertHost } from "@/components/MobIncomingAlertHost";
import { AnchorAlertsGlobalHost } from "@/components/AnchorAlertsGlobalHost";
import { ProfileNameGate } from "@/components/ProfileNameGate";
import { resolvePublicAppOrigin } from "@/lib/public-app-url";
import "./globals.css";

function getMetadataBase(): URL {
  return new URL(resolvePublicAppOrigin());
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
      { url: "/favicon.png?v=418800d", sizes: "32x32", type: "image/png" },
      { url: "/pwa-192.png?v=418800d", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512.png?v=418800d", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg?v=418800d", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=418800d", sizes: "180x180", type: "image/png" }],
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
      <body className="flex min-h-full flex-col bg-black text-zinc-100" style={{ backgroundColor: "#000000" }}>
        <BroadcastToastProvider>
          <CapacitorAppShell />
          <AppLoadSplash />
          <ServiceWorkerRegister />
          <SessionDeviceRegistrar />
          <SessionProfileEmailSync />
          <TopNav />
          <BroadcastReplyAlertsHost />
          <MobSenderActiveBanner />
          <MobIncomingAlertHost />
          <AnchorAlertsGlobalHost />
          <Suspense fallback={null}>
            <ProfileNameGate />
          </Suspense>
          {children}
          <BroadcastAwayToasts />
          <BottomNav />
        </BroadcastToastProvider>
      </body>
    </html>
  );
}
