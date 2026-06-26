"use client";

import Link from "next/link";
import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import { ArrowLeft, BookOpen, ExternalLink, Shield, FileText, Compass, Award } from "lucide-react";

const COLREGS_FULL_PDF_URL =
  "https://www.dohle-yachts.com/wp-content/uploads/2022/07/COLREGS-The-Rules-of-the-Road.pdf";

const USCG_USA_NAVIGATION_RULES_PDF_URL =
  "https://www.navcen.uscg.gov/sites/default/files/pdf/navRules/navrules.pdf";

const RNLI_MARITIME_SAR_MANUAL_URL =
  "https://rnli.org/-/media/rnli/downloads/maritime-sar-2017.pdf?rev=ae476fa675de486cbd40819b8515b144";

const COLREGS_QUIZLET_FLASHCARDS_URL =
  "https://quizlet.com/727929923/flashcards?funnelUUID=987482af-88df-4b70-9d78-dc784b4ddb01";

export function ColregsClient() {
  const { isMobile, mounted } = useIsMobileApp();

  if (mounted && isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#071426] via-[#040c18] to-[#020610] text-white safe-bottom flex flex-col overflow-x-hidden">
        {/* Immersive Header */}
        <div className="pt-[calc(env(safe-area-inset-top)+1rem)] px-4 pb-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/navigation-charts"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.06] text-zinc-300 active:scale-95 transition-all"
              aria-label="Back to charts"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-slate-100 flex items-center gap-1.5 text-left">
                <Shield className="size-4 text-emerald-400" />
                <span>COLREGs Rules</span>
              </h1>
              <p className="text-[9px] text-zinc-500 text-left">
                Collision prevention regulations
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 max-w-md mx-auto w-full space-y-4 pb-24 text-left">
          {/* Quick reference guide */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 shadow-lg backdrop-blur-md space-y-3">
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-white/[0.05] pb-2.5">
              <Compass size={12} className="text-emerald-400" />
              Core Navigation Rules
            </span>
            <div className="space-y-3.5">
              <div className="flex gap-2.5">
                <span className="text-xs font-mono font-bold text-emerald-400 shrink-0">Rule 5</span>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Look-out</h4>
                  <p className="text-[10px] text-zinc-400 mt-0.5 leading-normal">
                    Every vessel shall at all times maintain a proper look-out by sight and hearing as well as by all available means appropriate.
                  </p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <span className="text-xs font-mono font-bold text-emerald-400 shrink-0">Rule 6</span>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Safe Speed</h4>
                  <p className="text-[10px] text-zinc-400 mt-0.5 leading-normal">
                    Every vessel shall at all times proceed at a safe speed so that she can take proper and effective action to avoid collision.
                  </p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <span className="text-xs font-mono font-bold text-emerald-400 shrink-0">Rule 8</span>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Avoidance Action</h4>
                  <p className="text-[10px] text-zinc-400 mt-0.5 leading-normal">
                    Any action taken to avoid collision shall be positive, made in ample time, and with due regard to the observance of good seamanship.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 text-left">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300">Rules &amp; Manuals Library</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">Download or browse full maritime regulations.</p>
          </div>

          {/* Cards of Resources */}
          {/* USA Rules */}
          <a
            href={USCG_USA_NAVIGATION_RULES_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 cursor-pointer active:scale-[0.99] hover:border-white/10 transition-all shadow-md"
          >
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold text-slate-200 group-hover:text-cyan-400 transition-colors">USA Navigation Rules</h3>
                <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                  Official USCG handbook for safe inland &amp; international rules.
                </p>
              </div>
            </div>
            <ExternalLink size={14} className="text-slate-500 group-hover:text-white transition-colors shrink-0 ml-2" />
          </a>

          {/* COLREGs Rules of the Road */}
          <a
            href={COLREGS_FULL_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 cursor-pointer active:scale-[0.99] hover:border-white/10 transition-all shadow-md"
          >
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-emerald-950/40 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">COLREGs Road PDF</h3>
                <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                  Full IMO text describing the Rules of the Road standard.
                </p>
              </div>
            </div>
            <ExternalLink size={14} className="text-slate-500 group-hover:text-white transition-colors shrink-0 ml-2" />
          </a>

          {/* Maritime SAR Manual */}
          <a
            href={RNLI_MARITIME_SAR_MANUAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 cursor-pointer active:scale-[0.99] hover:border-white/10 transition-all shadow-md"
          >
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-amber-950/40 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Compass className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors">Maritime SAR Manual</h3>
                <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                  RNLI search &amp; rescue reference procedures guidelines.
                </p>
              </div>
            </div>
            <ExternalLink size={14} className="text-slate-500 group-hover:text-white transition-colors shrink-0 ml-2" />
          </a>

          {/* Quizlet study Flash Cards */}
          <a
            href={COLREGS_QUIZLET_FLASHCARDS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 cursor-pointer active:scale-[0.99] hover:border-white/10 transition-all shadow-md"
          >
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-violet-950/40 border border-violet-500/20 flex items-center justify-center text-violet-400">
                <Award className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold text-slate-200 group-hover:text-violet-400 transition-colors">Rules Flash Cards</h3>
                <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                  Interactive flashcards for lights, shapes, sound signs.
                </p>
              </div>
            </div>
            <ExternalLink size={14} className="text-slate-500 group-hover:text-white transition-colors shrink-0 ml-2" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 pb-32 sm:px-6 sm:py-12 text-left">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-emerald-400">
        <Link href="/" className="hover:underline">
          ← Home
        </Link>
        <Link href="/navigation-charts" className="hover:underline">
          Navigation charts
        </Link>
        <Link href="/weather" className="hover:underline">
          Weather &amp; sea
        </Link>
        <Link href="/help" className="hover:underline">
          Help
        </Link>
        <Link href="/terms" className="hover:underline">
          Terms
        </Link>
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
      </nav>

      <header className="mt-8">
        <h1 className="text-3xl font-black tracking-tight text-zinc-50 sm:text-4xl">
          COLREGs
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          The International Regulations for Preventing Collisions at Sea.
        </p>
      </header>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-zinc-50">
          Full regulations (PDF)
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          <a
            href={USCG_USA_NAVIGATION_RULES_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700"
          >
            USA Navigation rules
          </a>
          <a
            href={COLREGS_FULL_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700"
          >
            COLREGS — The Rules of the Road (PDF)
          </a>
          <a
            href={RNLI_MARITIME_SAR_MANUAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700"
          >
            Maritime SAR manual
          </a>
          <a
            href={COLREGS_QUIZLET_FLASHCARDS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700"
          >
            Flash Cards
          </a>
        </div>
      </section>
    </div>
  );
}
