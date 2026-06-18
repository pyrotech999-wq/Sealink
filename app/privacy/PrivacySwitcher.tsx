"use client";

import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import Link from "next/link";
import { Shield, Eye, ArrowLeft, HelpCircle } from "lucide-react";

const toc = [
  { id: "who", label: "Who we are" },
  { id: "scope", label: "Scope" },
  { id: "collect", label: "Data we collect" },
  { id: "use", label: "How we use data" },
  { id: "legal", label: "Lawful bases" },
  { id: "share", label: "Sharing & processors" },
  { id: "transfer", label: "International transfers" },
  { id: "retain", label: "Retention" },
  { id: "security", label: "Security" },
  { id: "rights", label: "Your rights" },
  { id: "cookies", label: "Cookies & storage" },
  { id: "children", label: "Children" },
  { id: "automated", label: "Automated decisions" },
  { id: "changes", label: "Changes" },
  { id: "complaints", label: "Complaints" },
  { id: "contact", label: "Contact" },
] as const;

export default function PrivacySwitcher() {
  const { isMobile, mounted } = useIsMobileApp();

  if (!mounted) {
    return (
      <div className="flex flex-1 flex-col bg-black min-h-screen">
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-8 sm:px-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-sm h-96 animate-pulse" />
        </main>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#030816] via-[#09152a] to-[#020510] text-slate-200 p-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* Mobile Header Navigation */}
        <div className="shrink-0 flex items-center justify-between pt-[calc(env(safe-area-inset-top)+1rem)] pb-3 border-b border-white/[0.05]">
          <Link
            href="/"
            className="text-xs font-bold text-slate-400 bg-white/[0.05] border border-white/[0.08] px-3.5 py-1.5 rounded-full hover:bg-white/[0.1] active:scale-95 transition-all"
          >
            ← Map
          </Link>
          <div className="flex items-center gap-1.5">
            <Shield size={14} className="text-cyan-400" />
            <span className="text-[10px] font-bold tracking-widest uppercase text-cyan-400">Privacy Node</span>
          </div>
        </div>

        {/* Title */}
        <div className="py-4 shrink-0">
          <h1 className="text-lg font-extrabold tracking-tight text-white">Privacy Policy</h1>
          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
            Understand how SeaLink handles and stores your telemetry and account logs securely.
          </p>
        </div>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Table of contents quick navigation */}
          <aside className="rounded-2xl border border-white/[0.06] bg-black/20 p-4 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">On this page</p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10.5px]">
              {toc.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      const target = document.getElementById(item.id);
                      if (target) {
                        target.scrollIntoView({ behavior: "smooth" });
                      }
                    }}
                    className="text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    <span>•</span>
                    <span>{item.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </aside>

          {/* Core Privacy text in glass card */}
          <div className="bg-white/[0.02] border border-white/[0.05] p-5 rounded-[24px] shadow-lg text-[11px] leading-relaxed text-slate-300 space-y-6">
            <p className="text-xs text-slate-400">
              Last updated April 2026. This policy explains how we collect and process your account, telemetry, and payment logs.
            </p>

            <section id="who" className="scroll-mt-6">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-white/[0.05] pb-1.5">Who we are</h2>
              <p className="mt-2 text-slate-300 leading-normal">
                The data controller for personal data processed through SeaLink is the entity named on invoice checkouts or app store listings. For queries, contact via developers help email.
              </p>
            </section>

            <section id="scope" className="scroll-mt-6">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-white/[0.05] pb-1.5">Scope</h2>
              <p className="mt-2 text-slate-300 leading-normal">
                This policy covers accounts, live telemetry coordinate records, vicinity chat threads, and payments on the Service. It does not govern external links or sponsor sites.
              </p>
            </section>

            <section id="collect" className="scroll-mt-6 space-y-3">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-white/[0.05] pb-1.5">Data we collect</h2>
              
              <div>
                <span className="font-extrabold text-white text-[10px] block uppercase">Account and Identity</span>
                <p className="text-slate-400 mt-0.5">Email addresses, credentials, display names, boat labels, phone numbers, and profile photographs you explicitly upload.</p>
              </div>

              <div>
                <span className="font-extrabold text-white text-[10px] block uppercase">Location and Map Activity</span>
                <p className="text-slate-400 mt-0.5">Precise GPS coordinates (latitude, longitude, accuracy estimates, timestamps) necessary for radar pins, friend updates, and anchor watch alerts.</p>
              </div>

              <div>
                <span className="font-extrabold text-white text-[10px] block uppercase">Browser / Local Storage</span>
                <p className="text-slate-400 mt-0.5">Local storage keys on your device used to cache telemetry settings, background consent states, and pin visibility options.</p>
              </div>

              <div>
                <span className="font-extrabold text-white text-[10px] block uppercase">Payments</span>
                <p className="text-slate-400 mt-0.5">Transaction reference tokens, active plan details, and receipt validation markers. We do not store credit card numbers locally.</p>
              </div>
            </section>

            <section id="use" className="scroll-mt-6">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-white/[0.05] pb-1.5">How we use data</h2>
              <ul className="mt-2 list-disc pl-4 space-y-1 text-slate-400">
                <li>To create and authenticate account logins.</li>
                <li>To display location pins and relative friends distances on maps.</li>
                <li>To check geofence breach conditions for anchor alarms.</li>
                <li>To process secure PayPal/Stripe payment subscriptions.</li>
                <li>To troubleshoot network exceptions and prevent app abuse.</li>
              </ul>
            </section>

            <section id="legal" className="scroll-mt-6">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-white/[0.05] pb-1.5">Lawful bases</h2>
              <p className="mt-2 text-slate-300 leading-normal">
                We process your data under standard contractual requirements to provide telemetry maps, based on legitimate security interests, or through direct consent states in the browser/app.
              </p>
            </section>

            <section id="retain" className="scroll-mt-6">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-white/[0.05] pb-1.5">Retention</h2>
              <p className="mt-2 text-slate-300 leading-normal">
                Account profiles are retained until account closure. Ephemeral map coordinates are cleared regularly on short cycles. You can clear local storage settings anytime under browser options.
              </p>
            </section>

            <section id="security" className="scroll-mt-6">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-white/[0.05] pb-1.5">Security</h2>
              <p className="mt-2 text-slate-300 leading-normal">
                We secure connections with SSL/TLS, and enforce HTTP-only session controls. We advise users to maintain unique crew passwords.
              </p>
            </section>

            <section id="rights" className="scroll-mt-6">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-white/[0.05] pb-1.5">Your rights</h2>
              <p className="mt-2 text-slate-300 leading-normal">
                You hold standard rights to access, update, or erase personal logs. You can request server-side profile deletions or lodge queries directly with the ICO.
              </p>
            </section>

            <section id="contact" className="scroll-mt-6">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-white/[0.05] pb-1.5">Contact</h2>
              <p className="mt-2 text-slate-300 leading-normal">
                For privacy requests, trigger the Email developers flow under the Help Centre page using "Privacy" in the subject headers.
              </p>
            </section>
          </div>

          {/* Quick links block */}
          <div className="bg-white/[0.01] border border-white/[0.04] p-3 rounded-2xl flex justify-around text-xs shrink-0 font-bold">
            <Link href="/help" className="text-cyan-400 hover:underline">Help Centre</Link>
            <span className="text-white/[0.1]">•</span>
            <Link href="/terms" className="text-cyan-400 hover:underline">Terms of Use</Link>
          </div>
        </div>
      </div>
    );
  }

  // Original desktop layout unchanged
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 pb-32 sm:px-6 sm:py-12">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-emerald-400">
        <Link href="/" className="hover:underline">
          ← Home
        </Link>
        <Link href="/terms" className="hover:underline">
          Terms of use
        </Link>
        <Link href="/help" className="hover:underline">
          Help
        </Link>
      </nav>

      <header className="mt-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Privacy policy</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          This policy explains how SeaLink (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) handles personal data when you use our website,
          progressive web app, or related services (together, the &quot;Service&quot;). It should be read together with our{" "}
          <Link href="/terms" className="font-medium text-emerald-400 hover:underline">
            terms of use
          </Link>
          .
        </p>
        <p className="mt-2 text-xs text-zinc-500">Last updated April 2026.</p>
      </header>

      <aside className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">On this page</p>
        <ul className="mt-3 columns-1 gap-x-6 text-sm sm:columns-2">
          {toc.map((item) => (
            <li key={item.id} className="mb-2 break-inside-avoid">
              <a href={`#${item.id}`} className="text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </aside>

      <article className="mt-10 space-y-10 text-sm leading-7 text-zinc-300">
        <section id="who" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Who we are</h2>
          <p className="mt-3">
            The <strong className="text-zinc-200">data controller</strong> for personal data processed through the public SeaLink
            Service is the person or organisation operating the production deployment (for example the entity named on invoices,
            app store listings, or the &quot;Plans&quot; payment pages). If you are unsure who that is for the site you are using, use
            the contact route at the end of this policy.
          </p>
        </section>

        <section id="scope" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Scope</h2>
          <p className="mt-3">
            This policy covers processing carried out in connection with accounts, maps, location sharing, community features,
            marketplace listings, marina enquiries, payments, support, and routine operation of the Service. It does not govern
            third-party websites you open from links inside SeaLink — those services have their own policies.
          </p>
        </section>

        <section id="collect" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Data we collect</h2>
          <p className="mt-3">Depending on how you use SeaLink, we may process the following categories of information:</p>

          <h3 className="mt-6 text-base font-semibold text-zinc-200">Account and identity</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-zinc-200">Email address</strong> and credentials you supply at sign-up or sign-in (stored and
              validated according to our authentication design, which may include a database such as Supabase and/or backup
              user records).
            </li>
            <li>
              <strong className="text-zinc-200">Profile and sign-up fields</strong> such as name, boat name, phone number, company
              details where collected on forms, and profile photographs you upload or attach.
            </li>
            <li>
              A <strong className="text-zinc-200">stable internal user identifier</strong> derived from your email (for example a
              truncated hash) used for ownership checks and feature gating.
            </li>
          </ul>

          <h3 className="mt-6 text-base font-semibold text-zinc-200">Location and map activity</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-zinc-200">Precise or coarse location</strong> when you grant browser or device permission and
              use map features (latitude, longitude, accuracy estimate, timestamps) — including when you opt in to share your
              position on the home map, appear in nearby-peer features, use IFM, send area broadcasts from your position, send
              man-overboard (MOB) alerts, or use anchor-watch style tools that compare your position to a geofence.
            </li>
            <li>
              <strong className="text-zinc-200">Map presence identifiers</strong> stored in an HTTP-only cookie to correlate your
              session with ephemeral &quot;presence&quot; records (for example nearby pins and heartbeats) without exposing your email
              to other users&apos; browsers.
            </li>
          </ul>

          <h3 className="mt-6 text-base font-semibold text-zinc-200">Device and browser storage (on your equipment)</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-zinc-200">Local storage keys</strong> used to remember map preferences and profile fields shown
              on your pin (for example boat name, display name, phone, avatar image data URL, whether to show your photo, background
              location consent, nearby-sharing opt-in, and share-on-map toggles). This keeps the UI responsive; some values may also
              be synced to the server when you use features that require it.
            </li>
            <li>
              <strong className="text-zinc-200">Device identifiers</strong> generated in the browser for features that must recognise
              the same handset across sessions (for example anchor monitoring or MOB flows).
            </li>
            <li>
              <strong className="text-zinc-200">UI preferences</strong> such as silencing broadcast alert sounds, stored locally where
              implemented.
            </li>
          </ul>

          <h3 className="mt-6 text-base font-semibold text-zinc-200">Content you submit</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-zinc-200">Broadcast messages</strong>, vicinity chat content, marina enquiry drafts, gear or
              vessel listing text and images, and similar user-generated material.
            </li>
            <li>
              <strong className="text-zinc-200">Support or feedback</strong> you send by email or through in-app flows.
            </li>
          </ul>

          <h3 className="mt-6 text-base font-semibold text-zinc-200">Payments</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-zinc-200">Transaction metadata</strong> processed by our payment provider (for example PayPal):
              subscription or purchase identifiers, status, amounts, and limited account linkage. We do not store full payment card
              numbers on SeaLink servers when checkout is handled entirely by the provider.
            </li>
          </ul>

          <h3 className="mt-6 text-base font-semibold text-zinc-200">Technical and security logs</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-zinc-200">Server and platform logs</strong> such as IP address, request path, approximate
              timestamps, user agent string, and error diagnostics — generated by hosting (for example Vercel) and our application
              for security, abuse prevention, and debugging.
            </li>
          </ul>
        </section>

        <section id="use" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">How we use personal data</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>To create and maintain your account and to authenticate you.</li>
            <li>To display maps, pins, weather, tides, and related overlays you request.</li>
            <li>To operate optional features you turn on (location sharing, nearby discovery, broadcasts, MOB peer alerts, anchor watch).</li>
            <li>To process payments, trials, vouchers, and access control.</li>
            <li>To store and display marketplace or marina-related submissions.</li>
            <li>To run optional AI-assisted features (for example narrative outlooks or tide assistance) where configured — prompts may
              include coarse location or context you supply; do not paste highly sensitive personal data into such fields.</li>
            <li>To detect, investigate, and block abuse, fraud, spam, or unlawful content.</li>
            <li>To comply with law, regulators, or court orders, and to establish or defend legal claims.</li>
            <li>To improve reliability and performance (aggregated or de-identified analytics where we create them).</li>
            <li>To communicate operational messages about the Service (for example security notices or subscription changes).</li>
          </ul>
        </section>

        <section id="legal" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Lawful bases (UK / EEA)</h2>
          <p className="mt-3">Where UK GDPR or EU GDPR applies, we rely on one or more of the following:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong className="text-zinc-200">Contract</strong> — processing necessary to provide the Service you request (for
              example account creation, delivering paid features, handling berth enquiry flows you start).
            </li>
            <li>
              <strong className="text-zinc-200">Legitimate interests</strong> — securing the Service, debugging, preventing misuse,
              improving features, and analysing aggregate usage, balanced against your rights.
            </li>
            <li>
              <strong className="text-zinc-200">Consent</strong> — where required for non-essential cookies or for precise location
              beyond what is strictly necessary, we rely on your clear affirmative action in the browser or app permission dialogs.
              You may withdraw consent at any time (see Rights and Cookies).
            </li>
            <li>
              <strong className="text-zinc-200">Legal obligation</strong> — where we must retain or disclose information to comply
              with the law.
            </li>
          </ul>
        </section>

        <section id="share" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Sharing and processors</h2>
          <p className="mt-3">We share data only as needed to run SeaLink, with categories of recipients such as:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong className="text-zinc-200">Hosting and infrastructure</strong> (for example Vercel or similar) that run our code
              and store logs.
            </li>
            <li>
              <strong className="text-zinc-200">Database and file storage</strong> (for example Supabase) for accounts, profiles, and
              uploaded media where configured.
            </li>
            <li>
              <strong className="text-zinc-200">Key-value or backup stores</strong> used for resilient account or feature data where
              the codebase provides them.
            </li>
            <li>
              <strong className="text-zinc-200">Payment providers</strong> (for example PayPal) who process card or wallet payments
              under their own terms.
            </li>
            <li>
              <strong className="text-zinc-200">Weather, tide, map, and AI vendors</strong> when our servers or your browser call
              external APIs — those calls may transmit coordinates, time windows, or prompts necessary to return a result. Each
              vendor processes data under its own privacy policy.
            </li>
            <li>
              <strong className="text-zinc-200">Other users</strong> — when you enable sharing, broadcasts, listings, or public profile
              elements, information you choose to expose (such as boat name, approximate position, or listing text) can be seen by
              recipients permitted by the feature.
            </li>
            <li>
              <strong className="text-zinc-200">Professional advisers, insurers, or purchasers</strong> of a business that includes
              the Service — only where permitted by law and subject to confidentiality.
            </li>
          </ul>
          <p className="mt-3">
            We do not sell your personal information in the conventional sense of exchanging a mailing list for money. If we ever use
            advertising partners that profile you across sites, we will update this policy and, where required, ask for consent.
          </p>
        </section>

        <section id="transfer" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">International transfers</h2>
          <p className="mt-3">
            Our processors may store or process data in the United Kingdom, the European Economic Area, the United States, or other
            countries. Where UK or EU GDPR applies and data is transferred outside the UK/EEA, we rely on appropriate safeguards such
            as the UK International Data Transfer Agreement / Addendum, the EU Standard Contractual Clauses, adequacy regulations, or
            other lawful transfer tools offered by the processor.
          </p>
        </section>

        <section id="retain" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Retention</h2>
          <p className="mt-3">
            We keep personal data only as long as needed for the purposes above: while your account remains open, as required to
            provide purchased features, and for a reasonable period afterwards to resolve disputes, enforce terms, comply with tax or
            accounting law, and maintain backups. Ephemeral map &quot;presence&quot; data is refreshed or deleted on short timers
            defined in our server configuration unless a longer retention is required for abuse investigations.
          </p>
          <p className="mt-3">
            You can clear many locally stored preferences using your browser&apos;s site-data controls; server-side deletion may
            require account closure or a request to us.
          </p>
        </section>

        <section id="security" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Security</h2>
          <p className="mt-3">
            We use industry-standard measures such as TLS in transit, HTTP-only cookies where appropriate for session identifiers,
            access controls on backend services, and separation of privileged credentials from application code. No online service can
            be guaranteed 100% secure — you should use a unique password, keep devices updated, and report suspected compromise promptly.
          </p>
        </section>

        <section id="rights" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Your rights</h2>
          <p className="mt-3">
            Subject to local law, you may have the right to: <strong className="text-zinc-200">access</strong> your personal data;{" "}
            <strong className="text-zinc-200">rectify</strong> inaccuracies; <strong className="text-zinc-200">erase</strong> data in
            defined circumstances; <strong className="text-zinc-200">restrict</strong> processing; <strong className="text-zinc-200">
              object
            </strong>{" "}
            to processing based on legitimate interests; <strong className="text-zinc-200">data portability</strong> for data you
            supplied and that we process by automated means under contract or consent; and to{" "}
            <strong className="text-zinc-200">withdraw consent</strong> without affecting prior lawful processing.
          </p>
          <p className="mt-3">
            To exercise rights, contact us using the details below. You may also lodge a complaint with the{" "}
            <strong className="text-zinc-200">Information Commissioner&apos;s Office (ICO)</strong> in the UK (
            <a href="https://ico.org.uk" className="font-medium text-emerald-400 hover:underline" rel="noopener noreferrer">
              ico.org.uk
            </a>
            ) or your local supervisory authority if you live in the EEA or elsewhere with a comparable regulator.
          </p>
        </section>

        <section id="cookies" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Cookies and similar technologies</h2>
          <p className="mt-3">SeaLink uses cookies and similar storage for:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong className="text-zinc-200">Session / sign-in state</strong> — cookies that indicate you are logged in and which
              account email the server should associate with your requests (typically HTTP-only, SameSite=Lax, Secure in production).
            </li>
            <li>
              <strong className="text-zinc-200">Map presence</strong> — an HTTP-only cookie holding an opaque ID used for nearby map
              features and related APIs.
            </li>
            <li>
              <strong className="text-zinc-200">Browser storage (localStorage)</strong> — as described above for profile fields and
              toggles; readable only by scripts on our origin unless a browser vulnerability exists.
            </li>
          </ul>
          <p className="mt-3">
            You can block non-essential cookies through browser settings, but parts of SeaLink (sign-in, sharing, nearby maps) may then
            stop working correctly.
          </p>
        </section>

        <section id="children" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Children</h2>
          <p className="mt-3">
            SeaLink is not directed at children under 16 (or the higher age required in your country). We do not knowingly collect
            personal data from children. If you believe a child has provided data, contact us and we will delete it where verification
            and law allow.
          </p>
        </section>

        <section id="automated" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Automated processing</h2>
          <p className="mt-3">
            We do not make solely automated decisions that produce legal or similarly significant effects about you under UK GDPR
            Article 22. Optional AI features generate text for information only; they are not used as the sole basis for denying
            accounts without human review where human review is practicable.
          </p>
        </section>

        <section id="changes" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Changes to this policy</h2>
          <p className="mt-3">
            We may update this privacy policy when we launch new features or change how data is processed. We will revise the &quot;Last
            updated&quot; date and, where changes are material, provide a more prominent notice in the app or by email where we have
            your address.
          </p>
        </section>

        <section id="complaints" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Complaints</h2>
          <p className="mt-3">
            We hope to resolve any privacy concern directly. If you are in the UK and remain unhappy, you may contact the ICO. If you
            are in the EU, you may contact your national data protection authority.
          </p>
        </section>

        <section id="contact" className="scroll-mt-24">
          <h2 className="text-lg font-semibold text-zinc-50">Contact</h2>
          <p className="mt-3">
            For privacy questions, data subject requests, or to identify the controller for the instance you use, contact us via the{" "}
            <strong className="text-zinc-200">Email developers</strong> button on the{" "}
            <Link href="/help" className="font-medium text-emerald-400 hover:underline">
              Help
            </Link>{" "}
            page (subject line starting with &quot;Privacy&quot; helps us triage), or any official contact address published on the
            same deployment of SeaLink you are using.
          </p>
        </section>

        <p className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-xs leading-5 text-zinc-500">
          This policy is written to reflect typical SeaLink architecture (cookies, optional Supabase/KV storage, map APIs, PayPal). A
          qualified privacy lawyer should review it against your actual deployment, contracts, and jurisdictions before you rely on it
          as the sole compliance document.
        </p>

        <nav
          className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-zinc-800 pt-8 text-sm text-zinc-400"
          aria-label="Related pages"
        >
          <Link href="/terms" className="hover:text-zinc-200 hover:underline">
            Terms of use
          </Link>
          <Link href="/help" className="hover:text-zinc-200 hover:underline">
            Help
          </Link>
        </nav>
      </article>
    </div>
  );
}
