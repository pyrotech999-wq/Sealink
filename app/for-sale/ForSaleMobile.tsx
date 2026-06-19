// app/for-sale/ForSaleMobile.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ship,
  Anchor,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Search,
  SlidersHorizontal,
  Mail,
  Phone,
  Calendar,
  Ruler,
  MapPin,
  Check,
  Shield,
  HelpCircle,
  Sparkles,
  Layout,
  MessageSquare,
  Compass,
  ShieldAlert
} from "lucide-react";
import { VESSEL_CATEGORIES } from "@/lib/vessel-classifieds-types";
import { GEAR_CATEGORIES } from "@/lib/gear-types";

// High-quality fallback images to display if an listing doesn't have images
const FALLBACK_VESSEL_IMAGE = "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=800&auto=format&fit=crop&q=80";
const FALLBACK_GEAR_IMAGE = "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&auto=format&fit=crop&q=80";

export default function ForSaleMobile() {
  const router = useRouter();

  // Navigation state between the main list dashboard and original menus
  const [viewMode, setViewMode] = useState<"menu" | "explorer">("menu");

  // Search & Navigation states inside Visual Explorer
  const [searchQuery, setSearchQuery] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "boats" | "gear">("all");

  // Real database listings
  const [boats, setBoats] = useState<any[]>([]);
  const [gear, setGear] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Selection state for item details view
  const [activeListing, setActiveListing] = useState<any | null>(null);
  const [activeType, setActiveType] = useState<"boat" | "gear" | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Debounce search query input (300ms)
  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(searchQuery);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Fetch listings dynamically whenever debounced query or active tab changes
  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);

    const loadData = async () => {
      try {
        const promises: Promise<any>[] = [];

        // 1. Fetch Boats
        if (activeTab === "all" || activeTab === "boats") {
          const boatParams = new URLSearchParams();
          if (qDebounced) boatParams.set("q", qDebounced);
          promises.push(
            fetch(`/api/vessels/classifieds?${boatParams.toString()}`)
              .then((r) => r.json())
              .then((d) => {
                if (active) {
                  const list = Array.isArray(d.listings) ? d.listings : [];
                  // Format them with fallback keys for custom details layout (engine, cabins, heads)
                  const formatted = list.map((b: any) => {
                    const desc = b.description || "";
                    const matchEngine = desc.match(/(\d+x?\s*\d*\s*hp|\b(yanmar|volvo penta|mercury|honda|yamaha|perkins|cummins|suzuki|beta)\b)/i);
                    const matchCabins = desc.match(/(\d+)\s*(cabin|berth|sleeper)/i);
                    const matchHeads = desc.match(/(\d+)\s*(head|toilet|bathroom)/i);

                    return {
                      ...b,
                      engine: matchEngine ? matchEngine[0] : "Inboard Diesel",
                      cabins: matchCabins ? parseInt(matchCabins[1], 10) : 2,
                      heads: matchHeads ? parseInt(matchHeads[1], 10) : 1,
                      keyFeatures: desc
                        .split(/[.\n]+/)
                        .map((s: string) => s.trim())
                        .filter((s: string) => s.length > 8 && s.length < 50)
                        .slice(0, 4)
                    };
                  });
                  setBoats(formatted);
                }
              })
          );
        } else {
          setBoats([]);
        }

        // 2. Fetch Gear
        if (activeTab === "all" || activeTab === "gear") {
          const gearParams = new URLSearchParams();
          if (qDebounced) gearParams.set("q", qDebounced);
          promises.push(
            fetch(`/api/gear/listings?${gearParams.toString()}`)
              .then((r) => r.json())
              .then((d) => {
                if (active) {
                  setGear(Array.isArray(d.listings) ? d.listings : []);
                }
              })
          );
        } else {
          setGear([]);
        }

        await Promise.all(promises);
      } catch (e) {
        console.error("Failed to load listings dynamically", e);
        if (active) setErr("Network error loading listings");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [qDebounced, activeTab]);

  // Featured listings section (take first 3 loaded boats as featured)
  const featuredBoats = useMemo(() => {
    return boats.slice(0, 3);
  }, [boats]);

  // Safe image rendering helpers
  const getVesselImage = (boat: any): string => {
    return boat.imageUrls && boat.imageUrls.length > 0 ? boat.imageUrls[0] : FALLBACK_VESSEL_IMAGE;
  };

  const getGearImage = (item: any): string => {
    return item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls[0] : FALLBACK_GEAR_IMAGE;
  };

  // Render detail view if listing selected
  if (activeListing) {
    const isBoat = activeType === "boat";
    const title = activeListing.title;
    const priceText = isBoat
      ? `£${activeListing.priceGbp?.toLocaleString("en-GB") ?? "POA"}`
      : activeListing.priceLabel ?? "POA";
    const subtitle = isBoat
      ? `${activeListing.makeModel || "Vessel"} · ${activeListing.year || "N/A"} · ${activeListing.lengthFt || "?"} ft`
      : `${GEAR_CATEGORIES.find((c) => c.id === activeListing.categoryId)?.label ?? "Gear"}`;

    const images = activeListing.imageUrls?.length > 0
      ? activeListing.imageUrls
      : [isBoat ? FALLBACK_VESSEL_IMAGE : FALLBACK_GEAR_IMAGE];

    // Default key features if none extracted
    const features = activeListing.keyFeatures?.length > 0
      ? activeListing.keyFeatures
      : [
        "Marine grade quality",
        "Tested & fully functional",
        "Includes original accessories",
        "Ready to use/sail"
      ];

    const specs = isBoat
      ? [
        { label: "Year", value: activeListing.year || "N/A", icon: Calendar },
        { label: "Length", value: `${activeListing.lengthFt || "?"} ft`, icon: Ruler },
        { label: "Engine", value: activeListing.engine || "Standard", icon: Ship },
        { label: "Cabins", value: activeListing.cabins || "N/A", icon: Layout },
        { label: "Heads", value: activeListing.heads || "N/A", icon: Shield },
        { label: "Location", value: activeListing.locationLabel || "UK", icon: MapPin }
      ]
      : [
        { label: "Category", value: subtitle, icon: Anchor },
        { label: "Condition", value: "Used - Good", icon: Sparkles },
        { label: "Location", value: activeListing.locationLabel || "UK", icon: MapPin }
      ];

    return (
      <div className="min-h-screen bg-black text-white flex flex-col pb-safe">
        {/* Detail Header */}
        <div className="sticky top-0 z-50 p-4 bg-[#0a192f]/90 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
          <button
            onClick={() => {
              setActiveListing(null);
              setActiveType(null);
              setActiveImageIndex(0);
            }}
            className="flex items-center gap-1.5 text-cyan-400 font-bold text-sm hover:text-cyan-300"
          >
            <ChevronLeft size={20} />
            <span>Back</span>
          </button>
          <span className="text-sm font-extrabold text-slate-100 tracking-tight">
            {isBoat ? "Vessel Listing" : "Gear Listing"}
          </span>
          <div className="w-12" /> {/* spacer for center alignment */}
        </div>

        {/* Detail Content */}
        <div className="flex-1 overflow-y-auto space-y-5 pb-32">
          {/* Image Slider */}
          <div className="relative overflow-hidden aspect-video bg-zinc-950">
            <img
              src={images[activeImageIndex]}
              alt={title}
              className="w-full h-full object-cover"
            />
            {images.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setActiveImageIndex((p) => (p === 0 ? images.length - 1 : p - 1))
                  }
                  className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 border border-white/10 text-white active:scale-95"
                >
                  ‹
                </button>
                <button
                  onClick={() =>
                    setActiveImageIndex((p) => (p === images.length - 1 ? 0 : p + 1))
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 border border-white/10 text-white active:scale-95"
                >
                  ›
                </button>
              </>
            )}
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 border border-white/10 px-3 py-0.5 text-[10px] font-mono text-white">
              {activeImageIndex + 1} / {images.length}
            </span>
          </div>

          <div className="px-4 space-y-5">
            {/* Title & Price Box */}
            <div className="space-y-1.5 text-left">
              <h1 className="text-xl font-black text-slate-100 tracking-tight leading-snug">
                {title}
              </h1>
              <p className="text-2xl font-black text-cyan-400">{priceText}</p>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                {subtitle}
              </p>
            </div>

            {/* Spec Badges Grid */}
            <div className="grid grid-cols-2 gap-2 text-left">
              {specs.map((spec, i) => {
                const Icon = spec.icon;
                return (
                  <div
                    key={`spec-${i}`}
                    className="flex items-center gap-2.5 bg-[#0b172a] border border-white/[0.04] p-3 rounded-xl"
                  >
                    <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-950/40 border border-cyan-500/20 text-cyan-400">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider leading-none">
                        {spec.label}
                      </p>
                      <p className="text-[11px] font-extrabold text-slate-200 mt-1 truncate">
                        {spec.value}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Key Features Checkbox Card */}
            <div className="p-4 rounded-2xl border border-white/[0.06] bg-[#0c192c]/30 space-y-3 text-left">
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                Key Features
              </h3>
              <ul className="grid gap-2">
                {features.map((feature: string, i: number) => (
                  <li key={`feature-${i}`} className="flex items-start gap-2.5 text-xs text-slate-300">
                    <Check size={14} className="text-cyan-400 mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Description */}
            <div className="space-y-2 text-left">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Description
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
                {activeListing.description}
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Call Actions */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-950/90 border-t border-white/[0.08] backdrop-blur-md z-40 flex flex-col gap-3">
          <div className="flex gap-3">
            <a
              href={`mailto:${activeListing.contactEmail || "inquiry@sealink.com"}?subject=${encodeURIComponent(`SeaLink Marketplace: ${title}`)}`}
              className="flex-1 h-12 flex items-center justify-center rounded-xl bg-cyan-500 text-zinc-950 font-black text-xs hover:bg-cyan-400 active:scale-[0.98] transition-all shadow-lg"
            >
              <Mail size={14} className="mr-1.5" />
              Send Inquiry
            </a>
            <a
              href={activeListing.contactPhone ? `tel:${activeListing.contactPhone}` : `mailto:${activeListing.contactEmail}`}
              className="flex-1 h-12 flex items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-200 font-extrabold text-xs hover:bg-white/[0.1] active:scale-[0.98] transition-all"
            >
              <MessageSquare size={14} className="mr-1.5" />
              Message Seller
            </a>
          </div>

          {/* Man Overboard Button */}
          <button
            onClick={() => {
              const until = Date.now() + 10 * 60 * 1000;
              window.localStorage.setItem("sealink_mob_sender_active_until", String(until));
              router.push("/mob");
            }}
            className="w-full h-8 flex items-center justify-center rounded-lg bg-red-600/90 text-[10px] font-black text-white hover:bg-red-700 uppercase tracking-widest active:scale-[0.98] transition-all"
          >
            🚨 Man Overboard
          </button>
        </div>
      </div>
    );
  }

  // --- RENDER 1: PRIMARY CARD MENU (Original UI with third card option) ---
  if (viewMode === "menu") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#071426] via-[#040c18] to-[#020610] text-white safe-top safe-bottom flex flex-col overflow-x-hidden">

        {/* Fixed Cockpit Header */}
        <div className="p-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.06] text-zinc-300 active:scale-95 transition-all"
              aria-label="Back to home"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-slate-100 flex items-center gap-1.5 text-left">
                <Ship className="size-4 text-emerald-400" />
                <span>Buy &amp; Sell</span>
              </h1>
              <p className="text-[9px] text-zinc-500 text-left">
                Vessels and marine equipment listings
              </p>
            </div>
          </div>
        </div>

        {/* Menu scrollable cards */}
        <div className="flex-1 overflow-y-auto p-4 max-w-md mx-auto w-full space-y-4 pb-24 text-left">

          {/* Card 1: Boats for Sale */}
          <Link
            href="/vessels"
            className="group relative block overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-5 active:scale-[0.99] hover:border-white/10 transition-all shadow-lg text-left"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-30 pointer-events-none" />
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold tracking-wide text-emerald-400 uppercase">
                  Listings
                </span>
                <h2 className="mt-3 text-lg font-extrabold text-slate-100 group-hover:text-emerald-400 transition-colors">
                  Boats for Sale
                </h2>
                <p className="mt-1.5 text-xs text-slate-400 leading-normal">
                  Browse paid boat listings, check vessel specifications, or post your boat for sale.
                </p>
              </div>
              <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 shadow-inner">
                <Ship className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1 text-[10px] font-bold text-emerald-400 group-hover:underline">
              <span>Browse Boats</span>
              <ChevronRight size={12} />
            </div>
          </Link>

          {/* Card 2: Boat Gear */}
          <Link
            href="/gear"
            className="group relative block overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-5 active:scale-[0.99] hover:border-white/10 transition-all shadow-lg text-left"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-transparent to-transparent opacity-30 pointer-events-none" />
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center rounded-full bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[9px] font-bold tracking-wide text-sky-400 uppercase">
                  Marketplace
                </span>
                <h2 className="mt-3 text-lg font-extrabold text-slate-100 group-hover:text-sky-400 transition-colors">
                  Boat Gear
                </h2>
                <p className="mt-1.5 text-xs text-slate-400 leading-normal">
                  Buy and sell marine equipment, rigging, spare hardware, accessories, and sails.
                </p>
              </div>
              <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-sky-950/40 border border-sky-500/20 text-sky-400 shadow-inner">
                <Anchor className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1 text-[10px] font-bold text-sky-400 group-hover:underline">
              <span>Open Gear Marketplace</span>
              <ChevronRight size={12} />
            </div>
          </Link>

          {/* NEW CARD 3: Explore All Listings (Visual Search Explorer) */}
          <button
            onClick={() => setViewMode("explorer")}
            className="w-full group relative block overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c192c]/65 p-5 active:scale-[0.99] hover:border-cyan-500/30 transition-all shadow-lg text-left focus:outline-none"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent opacity-30 pointer-events-none" />
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[9px] font-bold tracking-wide text-cyan-400 uppercase">
                  Interactive
                </span>
                <h2 className="mt-3 text-lg font-extrabold text-slate-100 group-hover:text-cyan-400 transition-colors">
                  Explore All Listings
                </h2>
                <p className="mt-1.5 text-xs text-slate-400 leading-normal">
                  Interactive visual search explorer of all boats &amp; gear with specs and photo galleries.
                </p>
              </div>
              <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-950/40 border border-cyan-500/20 text-cyan-400 shadow-inner">
                <Compass className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1 text-[10px] font-bold text-cyan-400 group-hover:underline">
              <span>Open Visual Search</span>
              <ChevronRight size={12} />
            </div>
          </button>

          {/* Safe Trading Guidelines Card */}
          <div className="p-4 rounded-2xl border border-white/[0.04] bg-[#091220]/80 shadow-md space-y-2.5">
            <div className="flex items-center gap-2 text-amber-400">
              <ShieldAlert size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Trading Safe Zone</span>
            </div>
            <p className="text-[10px] leading-relaxed text-zinc-500">
              Always inspect vessels and gear in person. Meet in secure public areas such as yacht clubs, marinas, or harbors. SeaLink provides listing services and does not process payments or guarantee transactions.
            </p>
          </div>

        </div>

        {/* Global MOB trigger */}
        <div className="px-4 pb-4 mt-auto">
          <button
            onClick={() => {
              const until = Date.now() + 10 * 60 * 1000;
              window.localStorage.setItem("sealink_mob_sender_active_until", String(until));
              router.push("/mob");
            }}
            className="w-full h-11 flex items-center justify-center rounded-xl bg-red-600 text-xs font-black text-white hover:bg-red-700 shadow-lg"
          >
            🛟 MAN OVERBOARD
          </button>
        </div>
      </div>
    );
  }

  // --- RENDER 2: VISUAL EXPLORER SUB-VIEW ---
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#071426] via-[#040c18] to-[#020610] text-white safe-top safe-bottom flex flex-col overflow-x-hidden">

      {/* Header containing title and search */}
      <div className="p-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewMode("menu")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.06] text-zinc-300 active:scale-95 transition-all"
              aria-label="Back to dashboard menu"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-slate-100 flex items-center gap-1.5 text-left">
                <Ship className="size-4 text-cyan-400" />
                <span>All Listings Explorer</span>
              </h1>
              <p className="text-[9px] text-zinc-500 text-left">
                Search boats and gear visually
              </p>
            </div>
          </div>
        </div>

        {/* Search bar matching mockup */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 size-4" />
          <input
            type="text"
            placeholder="Search for boats, gear..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#030c17]/60 border border-white/[0.08] rounded-xl pl-9 pr-9 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 placeholder:text-zinc-500"
          />
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
            <SlidersHorizontal className="size-4" />
          </button>
        </div>

        {/* Redesigned Pill Tab Controls */}
        <div className="flex gap-2 pb-1.5 overflow-x-auto">
          {[
            { id: "all", label: "All Listings" },
            { id: "boats", label: "Boats" },
            { id: "gear", label: "Gear" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-1.5 rounded-full text-[10px] font-extrabold transition-all border shrink-0
                ${activeTab === tab.id
                  ? "bg-cyan-500 text-zinc-950 border-cyan-500 shadow-inner"
                  : "bg-white/[0.02] text-zinc-400 border-white/[0.06] hover:bg-white/[0.06]"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-32">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="size-7 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-zinc-500">Loading live listings...</p>
          </div>
        ) : err ? (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 text-xs text-center">
            {err}
          </div>
        ) : (
          <>
            {/* Featured Listings Carousel (only show on "All" or "Boats" view) */}
            {activeTab !== "gear" && featuredBoats.length > 0 && !searchQuery && (
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 text-left">
                  Featured Listings
                </h2>
                <div className="flex overflow-x-auto gap-3.5 pb-2 snap-x scrollbar-none scroll-smooth">
                  {featuredBoats.map((boat) => (
                    <div
                      key={`feat-${boat.id}`}
                      onClick={() => {
                        setActiveListing(boat);
                        setActiveType("boat");
                      }}
                      className="snap-center shrink-0 w-64 rounded-xl overflow-hidden border border-white/[0.06] bg-[#0b172a] shadow-lg relative aspect-[4/3] cursor-pointer"
                    >
                      <img
                        src={getVesselImage(boat)}
                        alt={boat.title}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-2.5 left-2.5 rounded-md bg-cyan-400 px-2 py-0.5 text-[9px] font-bold text-zinc-950 uppercase tracking-wide">
                        Featured
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3 text-left">
                        <p className="text-xs font-black text-slate-100">{boat.title}</p>
                        <p className="text-[10px] text-cyan-400 font-extrabold mt-0.5">
                          £{boat.priceGbp?.toLocaleString("en-GB") ?? "POA"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Boats Section */}
            {activeTab !== "gear" && boats.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 text-left">
                    Boats for Sale
                  </h2>
                  {activeTab === "all" && (
                    <button
                      onClick={() => setActiveTab("boats")}
                      className="text-[10px] font-extrabold text-cyan-400"
                    >
                      See All
                    </button>
                  )}
                </div>

                {/* List Layout: Horizontal if All view, Vertical if Boats view */}
                {activeTab === "all" ? (
                  <div className="flex overflow-x-auto gap-4 pb-2 snap-x scrollbar-none">
                    {boats.map((boat) => (
                      <div
                        key={`boat-all-${boat.id}`}
                        className="snap-center shrink-0 w-72 rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 shadow-lg flex flex-col relative text-left"
                      >
                        <div className="relative overflow-hidden rounded-xl h-40 bg-zinc-900 shrink-0">
                          <img
                            src={getVesselImage(boat)}
                            alt={boat.title}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute top-2.5 right-2.5 rounded-lg bg-cyan-400 px-2.5 py-1 text-[10px] font-black text-zinc-950 shadow">
                            £{boat.priceGbp?.toLocaleString("en-GB") ?? "POA"}
                          </span>
                        </div>

                        <div className="mt-3 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="text-sm font-extrabold text-slate-100 truncate">
                              {boat.title}
                            </h3>
                            <p className="text-[10px] text-zinc-500 mt-1">
                              {boat.year} · {boat.lengthFt} ft
                            </p>
                          </div>

                          <button
                            onClick={() => {
                              setActiveListing(boat);
                              setActiveType("boat");
                            }}
                            className="mt-3.5 w-full h-9 rounded-xl bg-cyan-500 text-zinc-950 font-black text-[10px] hover:bg-cyan-400 transition-colors"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {boats.map((boat) => (
                      <div
                        key={`boat-list-${boat.id}`}
                        onClick={() => {
                          setActiveListing(boat);
                          setActiveType("boat");
                        }}
                        className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 shadow-lg flex flex-col relative text-left cursor-pointer active:scale-[0.99] transition-all"
                      >
                        <div className="relative overflow-hidden rounded-xl h-44 bg-zinc-900">
                          <img
                            src={getVesselImage(boat)}
                            alt={boat.title}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute top-2.5 right-2.5 rounded-lg bg-cyan-400 px-2.5 py-1 text-xs font-black text-zinc-950 shadow">
                            £{boat.priceGbp?.toLocaleString("en-GB") ?? "POA"}
                          </span>
                        </div>
                        <div className="mt-3 flex items-start justify-between">
                          <div>
                            <h3 className="text-sm font-extrabold text-slate-100">{boat.title}</h3>
                            <p className="text-[10px] text-zinc-500 mt-1">
                              {boat.year} · {boat.lengthFt} ft · {boat.locationLabel}
                            </p>
                          </div>
                          <ChevronRight size={16} className="text-zinc-600 mt-1 shrink-0" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Gear Section */}
            {activeTab !== "boats" && gear.length > 0 && (
              <div className="space-y-3 text-left">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Boat Gear
                  </h2>
                  {activeTab === "all" && (
                    <button
                      onClick={() => setActiveTab("gear")}
                      className="text-[10px] font-extrabold text-cyan-400"
                    >
                      See All
                    </button>
                  )}
                </div>

                {/* Grid Layout for Gear matching Mockup */}
                <div className="grid grid-cols-2 gap-3.5">
                  {gear.map((item) => (
                    <div
                      key={`gear-${item.id}`}
                      onClick={() => {
                        setActiveListing(item);
                        setActiveType("gear");
                      }}
                      className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-3.5 shadow-lg flex flex-col justify-between text-left cursor-pointer active:scale-[0.99] transition-all"
                    >
                      <div className="relative overflow-hidden rounded-xl bg-white p-3 aspect-square flex items-center justify-center shrink-0 shadow-inner">
                        <img
                          src={getGearImage(item)}
                          alt={item.title}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>

                      <div className="mt-2.5 flex-1 flex flex-col justify-between">
                        <h3 className="text-[11px] font-black text-slate-200 line-clamp-2 leading-tight">
                          {item.title}
                        </h3>
                        <span className="mt-1.5 self-start rounded-md bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[9px] font-extrabold text-cyan-400">
                          {item.priceLabel || "POA"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty States */}
            {((activeTab === "boats" && boats.length === 0) ||
              (activeTab === "gear" && gear.length === 0) ||
              (activeTab === "all" && boats.length === 0 && gear.length === 0)) && (
                <div className="bg-[#0c192c]/20 border border-white/[0.04] rounded-2xl p-12 text-center text-xs text-zinc-500">
                  No listings found matching your search.
                </div>
              )}
          </>
        )}
      </div>

      {/* Global Man Overboard Alert trigger button */}
      <div className="px-4 pb-4">
        <button
          onClick={() => {
            const until = Date.now() + 10 * 60 * 1000;
            window.localStorage.setItem("sealink_mob_sender_active_until", String(until));
            router.push("/mob");
          }}
          className="w-full h-11 flex items-center justify-center rounded-xl bg-red-600 text-xs font-black text-white hover:bg-red-700 shadow-lg"
        >
          🛟 MAN OVERBOARD
        </button>
        <p className="text-[9px] text-zinc-600 text-center mt-2.5">
          Sponsored Marine Scene
        </p>
      </div>
    </div>
  );
}