import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
        {/* Sets html.dark when system is dark OR viewport is mobile-width; pairs with @custom-variant dark in globals.css. Revert both if unwanted. */}
        <Script id="sealink-dark-class" strategy="beforeInteractive">
          {`(function(){function a(){var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var m=window.matchMedia("(max-width: 767px)").matches;document.documentElement.classList.toggle("dark",d||m);}a();try{window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",a);window.matchMedia("(max-width: 767px)").addEventListener("change",a);}catch(e){window.matchMedia("(prefers-color-scheme: dark)").addListener(a);window.matchMedia("(max-width: 767px)").addListener(a);}})();`}
        </Script>
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
