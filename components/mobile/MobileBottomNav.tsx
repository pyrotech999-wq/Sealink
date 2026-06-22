"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useRef, useLayoutEffect } from "react";
import {
  Home,
  Anchor,
  MessageCircle,
  MoreHorizontal,
  LogOut,
  Globe,
  Sun,
  LineChart,
  DollarSign,
  ChevronRight,
  Shield,
  HelpCircle,
  FileText,
  Ship,
} from "lucide-react";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function MobileBottomNav() {
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [session, setSession] = useState<{ signedIn: boolean; email?: string } | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshSession = useCallback(() => {
    void fetch("/api/demo/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json()) as { signedIn?: boolean; email?: string };
        setSession({ signedIn: Boolean(d.signedIn), email: d.email });
      })
      .catch(() => setSession({ signedIn: false }));
  }, []);

  useEffect(() => {
    refreshSession();
  }, [pathname, refreshSession]);

  // Hide bottom bar when keyboard is open (Android input collision fix)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        setIsKeyboardVisible(true);
      }
    };

    const handleFocusOut = () => {
      setIsKeyboardVisible(false);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    const handleResize = () => {
      if (window.visualViewport) {
        const isKeyboard = window.innerHeight - window.visualViewport.height > 150;
        setIsKeyboardVisible(isKeyboard);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
    }

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleResize);
      }
    };
  }, []);

  // Update layout padding dynamically to match the bar's exact height
  useIsomorphicLayoutEffect(() => {
    if (isKeyboardVisible) {
      document.documentElement.style.setProperty("--sealink-bottom-dock-px", "0");
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const apply = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty("--sealink-bottom-dock-px", String(Math.max(0, Math.ceil(h))));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [isKeyboardVisible, isDrawerOpen]);


  const handleSignOut = async () => {
    try {
      const r = await fetch("/api/demo/sign-out", { method: "POST" });
      if (r.ok) {
        setIsDrawerOpen(false);
        window.location.href = "/";
      }
    } catch (err) {
      console.error("Failed to sign out", err);
    }
  };

  const primaryTabs = [
    { label: "Home", href: "/", icon: Home },
    { label: "Anchor", href: "/anchor-alarm", icon: Anchor },
    { label: "Messages", href: "/messaging", icon: MessageCircle },
  ];

  const isMoreActive = isDrawerOpen || [
    "/ifm",
    "/weather",
    "/navigation-charts",
    "/for-sale",
    "/marinas",
    "/help",
    "/terms",
    "/privacy",
    "/profile"
  ].some(path => pathname === path || pathname.startsWith(path + "/"));


  if (isKeyboardVisible) {
    return null;
  }

  return (
    <>
      {/* Bottom Bar */}
      <div
        ref={rootRef}
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.08] bg-[#071b36]/95 backdrop-blur-md pb-safe"
      >

        <div className="grid grid-cols-4 relative">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.href;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center justify-center py-2.5 text-[10px] font-medium transition-colors relative
                ${active
                    ? "text-cyan-400 font-bold"
                    : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Icon size={18} className={`transition-transform duration-200 ${active ? 'scale-110' : ''}`} />
                <span className="mt-1">{tab.label}</span>
                {active && (
                  <span className="absolute top-0 left-1/4 right-1/4 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)] animate-fade-in" />
                )}
              </Link>
            );
          })}

          {/* More Tab Wrapper containing Popover */}
          <div className="relative flex flex-col items-center justify-center">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              className={`flex flex-col items-center justify-center py-2.5 text-[10px] font-medium transition-colors w-full h-full relative
              ${isMoreActive
                  ? "text-cyan-400 font-bold"
                  : "text-slate-400 hover:text-slate-200"
                }`}
            >
              <MoreHorizontal size={18} className={`transition-transform duration-200 ${isMoreActive ? 'scale-110' : ''}`} />
              <span className="mt-1">More</span>
              {isMoreActive && (
                <span className="absolute top-0 left-1/4 right-1/4 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)] animate-fade-in" />
              )}
            </button>

            {/* Speech-Bubble Popover Menu */}
            {isDrawerOpen && (
              <div className="absolute bottom-[60px] right-3 w-64 bg-[#0a192f]/95 border border-white/[0.08] rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-50 p-2 flex flex-col text-left select-none animate-fade-in backdrop-blur-lg">
                {/* Popover Arrow pointing down to the "More" button center */}
                <div className="absolute bottom-[-6px] right-[37px] w-3 h-3 bg-[#0a192f] border-r border-b border-white/[0.08] rotate-45" />

                {/* Profile/Session Info Card */}
                {session === null ? (
                  <div className="px-3 py-2 border-b border-white/[0.06] mb-1 animate-pulse h-10" />
                ) : session.signedIn ? (
                  <div className="px-3 py-2 border-b border-white/[0.06] mb-1">
                    <div className="flex items-center gap-2">
                      <div className="size-6 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-[10px] font-bold border border-indigo-500/20 shrink-0">
                        {session.email ? session.email[0].toUpperCase() : "U"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider leading-none">Boater</p>
                        <p className="text-xs font-semibold text-slate-200 truncate mt-0.5">{session.email}</p>
                      </div>
                    </div>
                    <Link
                      href="/profile"
                      onClick={() => setIsDrawerOpen(false)}
                      className="mt-2 flex items-center justify-between text-[11px] font-bold text-blue-400 hover:text-blue-300"
                    >
                      <span>View Profile</span>
                      <ChevronRight size={12} />
                    </Link>
                  </div>
                ) : (
                  <div className="px-3 py-2 border-b border-white/[0.06] mb-1">
                    <p className="text-xs font-bold text-slate-200">Welcome to SeaLink</p>
                    <div className="mt-2 flex gap-1.5">
                      <Link
                        href="/sign-in"
                        onClick={() => setIsDrawerOpen(false)}
                        className="flex-1 text-center py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-[10px] font-bold text-white transition-colors"
                      >
                        Sign In
                      </Link>
                      <Link
                        href="/sign-up"
                        onClick={() => setIsDrawerOpen(false)}
                        className="flex-1 text-center py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[10px] font-bold text-slate-200 hover:bg-white/[0.1] transition-colors"
                      >
                        Sign Up
                      </Link>
                    </div>
                  </div>
                )}

                {/* List of Tools */}
                <div className="space-y-0.5 max-h-[280px] overflow-y-auto">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1 px-3 mt-1.5">Tools</p>

                  <Link
                    href="/ifm"
                    onClick={() => setIsDrawerOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors ${pathname === "/ifm"
                      ? "bg-cyan-500/10 text-cyan-300 font-bold"
                      : "text-slate-300 hover:bg-white/[0.04] active:bg-white/[0.08]"
                      }`}
                  >
                    <Globe size={15} className="text-indigo-400 shrink-0" />
                    <span className="text-xs font-bold flex-1">Friends Map (IFM)</span>
                    <ChevronRight size={12} className="text-zinc-600" />
                  </Link>

                  <Link
                    href="/weather"
                    onClick={() => setIsDrawerOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors ${pathname === "/weather"
                      ? "bg-cyan-500/10 text-cyan-300 font-bold"
                      : "text-slate-300 hover:bg-white/[0.04] active:bg-white/[0.08]"
                      }`}
                  >
                    <Sun size={15} className="text-amber-400 shrink-0" />
                    <span className="text-xs font-bold flex-1">Weather & Sea</span>
                    <ChevronRight size={12} className="text-zinc-600" />
                  </Link>

                  <Link
                    href="/navigation-charts"
                    onClick={() => setIsDrawerOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors ${pathname === "/navigation-charts"
                      ? "bg-cyan-500/10 text-cyan-300 font-bold"
                      : "text-slate-300 hover:bg-white/[0.04] active:bg-white/[0.08]"
                      }`}
                  >
                    <LineChart size={15} className="text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold flex-1">Charts</span>
                    <ChevronRight size={12} className="text-zinc-600" />
                  </Link>

                  <Link
                    href="/for-sale"
                    onClick={() => setIsDrawerOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors ${pathname === "/for-sale" || pathname.startsWith("/vessels") || pathname.startsWith("/gear")
                      ? "bg-cyan-500/10 text-cyan-300 font-bold"
                      : "text-slate-300 hover:bg-white/[0.04] active:bg-white/[0.08]"
                      }`}
                  >
                    <DollarSign size={15} className="text-blue-400 shrink-0" />
                    <span className="text-xs font-bold flex-1">Buy & Sell</span>
                    <ChevronRight size={12} className="text-zinc-600" />
                  </Link>

                  <Link
                    href="/marinas"
                    onClick={() => setIsDrawerOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors ${pathname === "/marinas" || pathname.startsWith("/marinas/")
                      ? "bg-cyan-500/10 text-cyan-300 font-bold"
                      : "text-slate-300 hover:bg-white/[0.04] active:bg-white/[0.08]"
                      }`}
                  >
                    <Ship size={15} className="text-teal-400 shrink-0" />
                    <span className="text-xs font-bold flex-1">Marina Berths</span>
                    <ChevronRight size={12} className="text-zinc-600" />
                  </Link>

                  <div className="h-px bg-white/[0.04] my-2 mx-2" />
                  <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1 px-3 mt-1">Information</p>

                  <Link
                    href="/help"
                    onClick={() => setIsDrawerOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors ${pathname === "/help"
                      ? "bg-cyan-500/10 text-cyan-300 font-bold"
                      : "text-slate-300 hover:bg-white/[0.04] active:bg-white/[0.08]"
                      }`}
                  >
                    <HelpCircle size={15} className="text-cyan-400 shrink-0" />
                    <span className="text-xs font-bold flex-1">Help Centre</span>
                    <ChevronRight size={12} className="text-zinc-600" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Popover Backdrop Overlay (closes popover on click-away) */}
      {isDrawerOpen && (
        <div
          onClick={() => setIsDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-black/10 backdrop-blur-[0.5px]"
        />
      )}
    </>
  );
}