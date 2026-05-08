import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help | SeaLink",
  description:
    "How to use SeaLink: home map, Anchor alarm (geofence audio & alerts), sharing, Weather & sea, navigation charts & COLREGs, IFM, Messages (direct & area), Buy & Sell, marinas, broadcasts, MOB, sponsors strip, PWA install, and more.",
};

const DEV_EMAIL = "pyrotech999@hotmail.co.uk";
const mailtoDevelopers = `mailto:${DEV_EMAIL}?subject=${encodeURIComponent("SeaLink — help / feedback")}&body=${encodeURIComponent(
  `Hello SeaLink developers,\n\n` +
    `What I was trying to do:\n\n` +
    `What happened instead:\n\n` +
    `Device (phone / tablet / computer):\n` +
    `Browser (e.g. Safari, Chrome):\n` +
    `Rough location (optional):\n\n` +
    `Thanks,\n`,
)}`;

const toc: { id: string; label: string }[] = [
  { id: "quick-start", label: "Quick start" },
  { id: "navigation", label: "Finding your way" },
  { id: "home-map", label: "Home map & sharing" },
  { id: "map-settings", label: "Map sharing settings" },
  { id: "profile", label: "Profile & pin" },
  { id: "weather", label: "Weather & sea" },
  { id: "ifm", label: "IFM (friends map)" },
  { id: "marketplace", label: "Buy & Sell, gear & marinas" },
  { id: "navigation-charts-colregs", label: "Navigation charts & COLREGs" },
  { id: "broadcasts", label: "Broadcasts & chat" },
  { id: "messages-page", label: "Messages page" },
  { id: "messages-broadcast-audience", label: "Messages — who sees broadcasts" },
  { id: "anchor", label: "Anchor watch" },
  { id: "anchor-android-location", label: "Android location (anchor)" },
  { id: "sea-summary", label: "Sea state on Home" },
  { id: "mob", label: "Man overboard (MOB)" },
  { id: "plans", label: "Plans & payment" },
  { id: "sounds", label: "Sounds & alerts" },
  { id: "sponsors", label: "Sponsor strip" },
  { id: "share-install", label: "Share app & tips" },
  { id: "iphone-install", label: "iPhone — save as app" },
  { id: "safety", label: "Safety & official info" },
  { id: "delete-data", label: "Delete your data" },
  { id: "delete-my-data", label: "Delete my data (information page)" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

function TocLink({ id, label }: { id: string; label: string }) {
  return (
    <li>
      <a
        href={`#${id}`}
        className="text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline"
      >
        {label}
      </a>
    </li>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-zinc-800 pt-10 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-7 text-zinc-300">{children}</div>
    </section>
  );
}

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 pb-32 sm:px-6 sm:py-12">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-emerald-400">
        <Link href="/" className="hover:underline">
          ← Home
        </Link>
        <Link href="/terms" className="hover:underline">
          Terms of use
        </Link>
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
      </nav>

      <header className="mt-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Help centre</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          SeaLink brings together a live home map, weather overlays, community maps, listings, and safety-oriented tools.
          Use the topics below to get the most from each area. For legal limits (recreational use, no voyage planning,
          emergencies), read the{" "}
          <Link href="/terms" className="font-medium text-emerald-400 hover:underline">
            terms of use
          </Link>
          .
        </p>
      </header>

      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_13.5rem] lg:items-start lg:gap-10">
        <aside className="mb-10 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 lg:order-2 lg:mb-0 lg:sticky lg:top-24 lg:p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">On this page</p>
          <ul className="mt-3 space-y-2 text-sm">
            {toc.map((item) => (
              <TocLink key={item.id} {...item} />
            ))}
          </ul>
        </aside>

        <div className="min-w-0 lg:order-1">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:hidden">
            <p className="text-xs font-semibold text-zinc-400">Jump to</p>
            <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto text-sm">
              {toc.map((item) => (
                <a key={item.id} href={`#${item.id}`} className="text-emerald-400 hover:underline">
                  {item.label}
                </a>
              ))}
            </div>
          </div>

          <article className="mt-8 space-y-0 lg:mt-0">
            <Section id="quick-start" title="Quick start">
              <p>
                <strong className="text-zinc-200">New here?</strong> Create an account from{" "}
                <Link href="/sign-up" className="font-medium text-emerald-400 hover:underline">
                  Sign up
                </Link>
                , or{" "}
                <Link href="/sign-in" className="font-medium text-emerald-400 hover:underline">
                  Sign in
                </Link>{" "}
                if you already have one. Use the <strong className="text-zinc-200">top navigation bar</strong> (Home, Anchor,
                IFM, Messages when signed in, Weather &amp; sea, Navigation charts, Buy &amp; Sell) on every screen size — it stays visible while
                you scroll.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                <li>
                  <strong className="text-zinc-300">Home</strong> — your main map, sea summary, shortcuts, and sharing.
                </li>
                <li>
                  <strong className="text-zinc-300">Anchor</strong> —{" "}
                  <Link href="/anchor-alarm" className="font-medium text-emerald-400 hover:underline">
                    Anchor alarm
                  </Link>{" "}
                  page: full geofence controls and map (focused on anchor watch; no nearby-friends layer there).
                </li>
                <li>
                  <strong className="text-zinc-300">Weather &amp; sea</strong> — official-style chart images (UKMO MSLP,
                  OPC) plus an interactive GFS wind and wave viewer; see the detailed section below.
                </li>
                <li>
                  <strong className="text-zinc-300">Navigation charts</strong> —{" "}
                  <Link href="/navigation-charts" className="font-medium text-emerald-400 hover:underline">
                    upload your own .kap
                  </Link>{" "}
                  (BSB/KAP) for a map preview; you supply charts you are licensed to use. The same page links to{" "}
                  <Link href="/colregs" className="font-medium text-emerald-400 hover:underline">
                    COLREGs
                  </Link>{" "}
                  (rules of the road summaries, PDFs, and flash cards).
                </li>
                <li>
                  <strong className="text-zinc-300">Messages</strong> —{" "}
                  <Link href="/messaging" className="font-medium text-emerald-400 hover:underline">
                    /messaging
                  </Link>{" "}
                  for direct chats with IFM friends and area broadcasts in one place (see the Messages section below).
                </li>
                <li>
                  <strong className="text-zinc-300">IFM</strong> — International Friends Map for seeing other users.
                </li>
                <li>
                  <strong className="text-zinc-300">Buy &amp; Sell</strong> — hub for boat gear and boats for sale.
                </li>
              </ul>
              <p className="rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-xs leading-5 text-emerald-100/90">
                <strong className="text-emerald-200">Tip:</strong> Allow location when the browser asks if you want the
                map centred on you. You can still pan anywhere without sharing your pin with others until you turn sharing
                on.
              </p>
            </Section>

            <Section id="navigation" title="Finding your way around">
              <p>
                <strong className="text-zinc-200">Top navigation</strong> (all sizes): quick jumps to Home, Anchor, IFM,
                Messages (when you are signed in), Weather &amp; sea, Navigation charts, and Buy &amp; Sell (then choose boats or gear). The
                active page is highlighted in green.
              </p>
              <p>
                <strong className="text-zinc-200">Home header</strong> (black bar on Home): Plans, Admin (if you are an
                admin), profile and sign-out when signed in — or Sign in / Create account when not.
              </p>
              <p>
                <strong className="text-zinc-200">Bottom strip</strong> (all sizes):{" "}
                <strong className="text-zinc-300">Man overboard</strong>, an optional{" "}
                <strong className="text-zinc-300">sponsor</strong> image carousel on supported pages (tap opens the
                sponsor link), then the &quot;Silence message alerts&quot; checkbox — no duplicate page tabs, since those
                live in the top bar.
              </p>
              <p>
                <strong className="text-zinc-200">Other page</strong> (
                <Link href="/other" className="font-medium text-emerald-400 hover:underline">
                  /other
                </Link>
                ): extra shortcuts such as profile and plans — useful if you bookmark it or follow an old link.
              </p>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Hint:</strong> Marinas are not in the top navigation row; open them from the
                home screen call-to-action{" "}
                <span className="text-zinc-300">&quot;Marina berths&quot;</span> block when it appears, or go directly to{" "}
                <Link href="/marinas" className="font-medium text-emerald-400 hover:underline">
                  Marina berths
                </Link>
                .
              </p>
            </Section>

            <Section id="home-map" title="Home map &amp; GPS sharing">
              <p>
                The large map on <Link href="/" className="font-medium text-emerald-400 hover:underline">Home</Link> can
                show your position, wind timeline, optional nearby users, broadcasts, and anchor status. Full anchor setup
                (arm/disarm dialog, radius, devices) lives on the{" "}
                <Link href="/anchor-alarm" className="font-medium text-emerald-400 hover:underline">
                  Anchor alarm
                </Link>{" "}
                page — on Home you still see a compact pill such as <strong className="text-zinc-200">Anchor · Off</strong>{" "}
                (tap to open the Anchor page) or <strong className="text-zinc-200">Anchor · On · Monitoring …</strong> (tap
                to disarm quickly). It loads best with a good GPS fix outdoors or near a window.
              </p>
              <p>
                <strong className="text-zinc-200">Share my location on this map</strong> (green / grey button): when
                green/active, your approximate position is published according to your settings. When off, you can still
                browse the map; others do not see your live pin.
              </p>
              <p>
                <strong className="text-zinc-200">Accuracy ring</strong>: a circle around your pin shows GPS uncertainty
                when available — a wide ring means the fix is weak; wait for it to tighten before trusting fine-grained
                features.
              </p>
              <p>
                <strong className="text-zinc-200">Wind timeline</strong>: scrub hourly wind for planning curiosity only
                — not for navigation; cross-check official forecasts (see Safety below).
              </p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                <li>
                  Use <strong className="text-zinc-300">Map sharing</strong> in the panel to open detailed sharing
                  controls (or go to{" "}
                  <Link href="/map-sharing" className="font-medium text-emerald-400 hover:underline">
                    Map sharing
                  </Link>
                  ).
                </li>
                <li>
                  <strong className="text-zinc-300">Background updates:</strong> optional checkbox to keep refreshing
                  while the tab stays open; fully closing the browser usually stops web GPS — use the native app build if
                  you need always-on tracking.
                </li>
                <li>
                  <strong className="text-zinc-300">Nearby (~5 mi):</strong> optional visibility to other SeaLink users
                  in range when sharing is on (on Home only — the Anchor alarm page omits friends so the map stays focused).
                </li>
              </ul>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Tip:</strong> If the map jumps to open ocean between fixes, leave
                sharing on briefly after a good fix — the app can hold your last good position so the view stays sensible.
              </p>
              <p>
                <strong className="text-zinc-200">Seas the day / Life on Seas:</strong> once in a while you may see a
                short, once-per-day style prompt when you open the map. Those messages are meant to be{" "}
                <strong className="text-zinc-100">inspirational</strong> — celebrating the <strong className="text-zinc-100">adventure</strong>,{" "}
                <strong className="text-zinc-100">joy</strong>, <strong className="text-zinc-100">freedom</strong>, and{" "}
                <strong className="text-zinc-100">spirit</strong> of life on the sea or on the water. They are not forecasts
                or instructions; dismiss the prompt whenever you like to get straight back to the map. We may also use the
                same channel for occasional safety or community reminders so important notes do not clutter the main UI.
              </p>
            </Section>

            <Section id="map-settings" title="Map sharing settings page">
              <p>
                <Link href="/map-sharing" className="font-medium text-emerald-400 hover:underline">
                  Map sharing
                </Link>{" "}
                is a dedicated page for the same controls as the home map panel: boat name, avatar visibility, nearby
                peers, background consent, and the main share toggle — without the distraction of the full map. Use it
                when you want to configure sharing calmly, then return to Home to see the result.
              </p>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Hint:</strong> Turn sharing off when you are ashore or in port if you
                do not want your berth position visible to the community.
              </p>
            </Section>

            <Section id="profile" title="Profile &amp; how you appear on the map">
              <p>
                <Link href="/profile" className="font-medium text-emerald-400 hover:underline">
                  Edit profile
                </Link>{" "}
                (header on Home, or Other shortcuts) controls name, boat label, phone, and photo used on your map pin.
                Changes are stored for map display consistent with how you signed up.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                <li>Use a clear boat name — it truncates on the pin; short names read better at small zoom.</li>
                <li>
                  Tap or use pin interactions to peek your avatar where supported — useful to confirm which photo others
                  might recognise.
                </li>
              </ul>
            </Section>

            <Section id="weather" title="Weather &amp; sea — maps and charts">
              <p>
                Open{" "}
                <Link href="/weather" className="font-medium text-emerald-400 hover:underline">
                  Weather &amp; sea
                </Link>{" "}
                for <strong className="text-zinc-200">static forecast chart images</strong> (analysis and prognosis maps)
                plus an <strong className="text-zinc-200">interactive model viewer</strong> built on OpenStreetMap. Charts are
                fetched through SeaLink and typically <strong className="text-zinc-200">cached for about six hours</strong>,
                so repeat views stay quick and the source sites see less load.
              </p>

              <p>
                <strong className="text-zinc-200">How the page is laid out (top to bottom)</strong>
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-zinc-400">
                <li>
                  <strong className="text-zinc-300">UK, Med &amp; Europe — surface pressure</strong> — UKMO mean sea level
                  pressure (MSLP) analysis and forecast steps.
                </li>
                <li>
                  <strong className="text-zinc-300">Surface pressure / Interactive</strong> — one card with two modes: OPC
                  pressure panels, or the GFS-based grid viewer (wind and waves).
                </li>
                <li>
                  <strong className="text-zinc-300">Ocean Prediction Centre charts</strong> — full chart browser (several
                  chart types per ocean basin).
                </li>
              </ol>

              <p>
                <strong className="text-zinc-200">1. UK, Med &amp; Europe MSLP</strong>
              </p>
              <p>
                Use the tabs along the top of that block — <strong className="text-zinc-300">Analysis</strong>, then{" "}
                <strong className="text-zinc-300">T+24</strong> through <strong className="text-zinc-300">T+120</strong> — to
                step through UK Met Office MSLP charts (via weathercharts.org). <strong className="text-zinc-300">Source</strong>{" "}
                opens the provider page. Read them like conventional surface charts: isobar spacing, centre positions, and
                how features move between valid times.
              </p>

              <p>
                <strong className="text-zinc-200">2. “Surface pressure” vs “Interactive”</strong>
              </p>
              <p>Switch with the two buttons at the top of the middle section.</p>
              <ul className="list-disc space-y-2 pl-5 text-zinc-400">
                <li>
                  <strong className="text-zinc-300">Surface pressure</strong> — US{" "}
                  <abbr title="Ocean Prediction Center" className="no-underline">
                    OPC
                  </abbr>{" "}
                  surface analysis and forecast maps. Choose <strong className="text-zinc-300">Atlantic</strong>,{" "}
                  <strong className="text-zinc-300">Pacific</strong>, or <strong className="text-zinc-300">Alaska / Arctic</strong>
                  , then <strong className="text-zinc-300">Analysis</strong>, <strong className="text-zinc-300">24h</strong>,{" "}
                  <strong className="text-zinc-300">48h</strong>, <strong className="text-zinc-300">72h</strong>, or{" "}
                  <strong className="text-zinc-300">96h</strong>. Greyed-out times are not available for that product.{" "}
                  <strong className="text-zinc-300">OPC site</strong> links to the official loop index.
                </li>
                <li>
                  <strong className="text-zinc-300">Interactive</strong> — the <strong className="text-zinc-300">Model chart viewer</strong>
                  : OpenStreetMap with a sampled grid from <strong className="text-zinc-300">Open‑Meteo (GFS family)</strong>.
                  Pick <strong className="text-zinc-300">10 m wind</strong> or <strong className="text-zinc-300">Waves</strong>.
                  Wind arrows are drawn <strong className="text-zinc-200">downwind</strong>; tap a marker for speed in{" "}
                  <strong className="text-zinc-200">knots</strong> and the direction the wind is <strong className="text-zinc-200">from</strong> (degrees). Waves show coloured circles (significant height) and, where data supports it, direction arrows; tap for height in metres and direction-from. A small <strong className="text-zinc-300">legend</strong> on the map matches colours to wind speed or wave height.
                </li>
              </ul>

              <p>
                <strong className="text-zinc-200">Interactive viewer — regions and time</strong>
              </p>
              <p>
                The <strong className="text-zinc-300">Region</strong> menu reframes the map (for example Europe, North or
                South America, Africa, Eastern Asia, Australia, plus smaller areas such as United Kingdom, Scandinavia,
                Netherlands, France, Spain, Italy / Balkans, Turkey / Middle East, and others). The{" "}
                <strong className="text-zinc-300">timeline</strong> uses <strong className="text-zinc-200">three-hour steps</strong> out to about{" "}
                <strong className="text-zinc-200">+117 h</strong> from the model. Use <strong className="text-zinc-300">Play</strong> /{" "}
                <strong className="text-zinc-300">Pause</strong> to animate, <strong className="text-zinc-300">−3h</strong> /{" "}
                <strong className="text-zinc-300">+3h</strong> to step, or drag the <strong className="text-zinc-300">slider</strong>.
                <strong className="text-zinc-300"> Fit region</strong> re-centres on the bounding box for the area you selected.
                The app preloads a few nearby timesteps when you change region or layer; other hours load as you scrub (and
                results are stored in your browser for up to six hours). If the service is rate-limited, you may see a note
                that <strong className="text-zinc-200">cached data</strong> is shown. If a step has almost no wave points (for
                example over land), try another hour, the other layer, or a more maritime region.
              </p>

              <p>
                <strong className="text-zinc-200">3. Ocean Prediction Centre charts (full list)</strong>
              </p>
              <p>
                The bottom block is a complete OPC chart picker: choose <strong className="text-zinc-300">Region</strong> (same
                ocean basins as above), then <strong className="text-zinc-300">Chart</strong> — typically{" "}
                <strong className="text-zinc-300">Surface pressure</strong>, <strong className="text-zinc-300">Wind &amp; wave</strong>,{" "}
                <strong className="text-zinc-300">Wave period</strong>, and <strong className="text-zinc-300">500 mb</strong> where
                that basin provides it. Step through <strong className="text-zinc-300">Analysis</strong> and{" "}
                <strong className="text-zinc-300">24h–96h</strong>; use <strong className="text-zinc-300">Prev</strong> /{" "}
                <strong className="text-zinc-300">Next</strong> to move between forecast times when those controls are enabled.
                The header bar repeats your selection and links to the OPC site.
              </p>

              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Note:</strong> The interactive viewer is <strong className="text-zinc-200">not</strong> a full GRIB viewer — it samples the model on a coarse grid for clarity. Synoptic judgement should still use the official chart images and your national meteorological service.
              </p>

              <p className="rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-xs leading-5 text-amber-100/90">
                <strong className="text-amber-200">Important:</strong> SeaLink weather is for interest and situational
                awareness only. For any decision to go to sea, use official meteorological services, NAVAREA / coastal
                warnings, and licensed charts — not this app alone.
              </p>
            </Section>

            <Section id="ifm" title="IFM — International Friends Map">
              <p>
                <Link href="/ifm" prefetch={false} className="font-medium text-emerald-400 hover:underline">
                  IFM
                </Link>{" "}
                is a separate map focused on discovering other SeaLink users (friends, local, or all modes depending on
                UI). Grant location to see yourself relative to others; respect privacy — do not use IFM to pressure or
                track people without consent.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                <li>Clusters group many users at low zoom; zoom in to expand clusters into individual pins.</li>
                <li>Use popups to read boat names and add peers where the app offers it.</li>
              </ul>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Tip:</strong> IFM and Home use different map contexts; sharing settings
                on Home still govern how you appear on the home map — see Map sharing for the full picture.
              </p>
            </Section>

            <Section id="marketplace" title="Buy &amp; Sell, boat gear &amp; marinas">
              <p>
                Start from{" "}
                <Link href="/for-sale" className="font-medium text-emerald-400 hover:underline">
                  Buy &amp; Sell
                </Link>{" "}
                (<span className="font-mono text-zinc-400">/for-sale</span>) to open either{" "}
                <strong className="text-zinc-200">boats for sale</strong> (
                <Link href="/vessels" className="font-medium text-emerald-400 hover:underline">
                  /vessels
                </Link>
                ) or <strong className="text-zinc-200">boat gear</strong> (
                <Link href="/gear" className="font-medium text-emerald-400 hover:underline">
                  /gear
                </Link>
                ).
              </p>
              <p>
                <strong className="text-zinc-200">Boat gear</strong>: member listings for chandlery, kit, and spares — not
                whole boats. Search and filter by category; your posts can be extended or marked sold according to the
                on-screen rules.
              </p>
              <p>
                <strong className="text-zinc-200">Boats for sale</strong>: paid classifieds for boats — follow prompts for
                posting, payment, and renewals.
              </p>
              <p>
                <strong className="text-zinc-200">Marina berths</strong> (
                <Link href="/marinas" className="font-medium text-emerald-400 hover:underline">
                  /marinas
                </Link>
                ): search marinas, compare facilities, and draft berth enquiries. Keep copies of important correspondence
                outside the app.
              </p>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Hint:</strong> Treat all listings as &quot;caveat emptor&quot; — meet
                sellers safely, inspect gear, and verify documentation for boats independently.
              </p>
            </Section>

            <Section id="navigation-charts-colregs" title="Navigation charts &amp; COLREGs">
              <p>
                <Link href="/navigation-charts" className="font-medium text-emerald-400 hover:underline">
                  Navigation charts
                </Link>{" "}
                (<span className="font-mono text-zinc-400">/navigation-charts</span>) lets you upload{" "}
                <strong className="text-zinc-200">.kap / BSB</strong> raster charts you are entitled to use, then preview
                them on a slippy map with pan and zoom. SeaLink does not supply charts — you provide files from your
                publisher or conversion workflow and stay responsible for licensing and corrections.
              </p>
              <p>
                The charts page also links to{" "}
                <Link href="/colregs" className="font-medium text-emerald-400 hover:underline">
                  COLREGs
                </Link>{" "}
                (<span className="font-mono text-zinc-400">/colregs</span>): short explanations of collision-regulation
                themes, links to full-rule PDFs, and optional{" "}
                <strong className="text-zinc-200">flash cards</strong> on Quizlet for revision. COLREGs are reference
                only — always use official publications and local rules for compliance.
              </p>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Tip:</strong> Large KAP files can be slow on mobile data; upload on Wi‑Fi
                when possible.
              </p>
            </Section>

            <Section id="broadcasts" title="Area broadcasts &amp; vicinity chat">
              <p>
                When signed in and sharing your location on the home map, you may be able to <strong className="text-zinc-200">send an area broadcast</strong> — a short message to other users in range (or wider if your account has global broadcast permission). Recipients may get a sound unless they silence alerts (see Sounds below).
              </p>
              <p>
                <strong className="text-zinc-200">Vicinity chat</strong> may open from broadcast or inbox flows so you can
                coordinate with a specific peer — keep conversations courteous and report abuse via email to developers if
                needed.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                <li>Broadcasts are not emergency services — use VHF/DSC and phone to999/112/911 for distress.</li>
                <li>If sending fails, confirm sharing is on and you have network connectivity.</li>
              </ul>
              <h3
                id="messages-broadcast-audience"
                className="scroll-mt-24 pt-2 text-base font-semibold tracking-tight text-zinc-100"
              >
                Messages: who sees an area broadcast
              </h3>
              <p>
                On the home map and the <strong className="text-zinc-200">Messaging</strong> page, when you send an area
                broadcast (not a private reply thread), you can choose the <strong className="text-zinc-200">audience</strong>{" "}
                before you send — as long as you are not using the admin-only “all map areas” option, which always reaches
                everyone in range on every map view.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                <li>
                  <strong className="text-zinc-300">Everyone nearby</strong> — any user who is signed in and loads
                  broadcasts from within the usual vicinity radius (~5 miles by default) can see the message, same as a
                  classic area heads-up.
                </li>
                <li>
                  <strong className="text-zinc-300">IFM friends nearby</strong> — only people on{" "}
                  <strong className="text-zinc-300">your</strong> IFM friends list, and only if they are also within that
                  same ~5 mi radius of the broadcast. Others in the anchorage will not see it.
                </li>
                <li>
                  <strong className="text-zinc-300">IFM friends worldwide</strong> — only your IFM friends, no matter where
                  they are. They still open broadcasts from their own position in the app; the server only delivers the
                  message to accounts on your friends list.
                </li>
              </ul>
              <p>
                Build and edit your friends list on the{" "}
                <Link href="/ifm" prefetch={false} className="font-medium text-emerald-400 hover:underline">
                  IFM
                </Link>{" "}
                (friends) map. Email-based friends match by account; phone-based friends need compatible IFM presence so
                the app can match a normalised number — if a friend never appears for restricted broadcasts, check that
                they are on your list and using IFM with a comparable identity.
              </p>
              <p className="text-xs text-zinc-500">
                Sent messages may show small badges such as “Friends nearby” or “Friends worldwide” so you can tell which
                option you used.
              </p>
            </Section>

            <Section id="messages-page" title="Messages page — Direct &amp; area">
              <p>
                Open{" "}
                <Link href="/messaging" className="font-medium text-emerald-400 hover:underline">
                  Messages
                </Link>{" "}
                from the top bar when you are signed in. It brings together{" "}
                <strong className="text-zinc-200">direct chats</strong> with people on your IFM friends list and{" "}
                <strong className="text-zinc-200">area broadcasts</strong> (~5 mi) in one place.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                <li>
                  Use the <strong className="text-zinc-300">Direct</strong> tab to pick a friend and send a private
                  message; conversations stay between those accounts.
                </li>
                <li>
                  Use the <strong className="text-zinc-300">Area</strong> tab (or the home map broadcast panel) for
                  short heads-ups to nearby boaters, with the same audience choices as on the map (everyone nearby, IFM
                  friends nearby, or IFM friends worldwide).
                </li>
                <li>
                  Replying to a broadcast opens a <strong className="text-zinc-300">shared thread</strong> on its own
                  page so you can follow the conversation without losing the main map.
                </li>
              </ul>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Tip:</strong> Add or manage friends on the{" "}
                <Link href="/ifm" prefetch={false} className="font-medium text-emerald-400 hover:underline">
                  IFM
                </Link>{" "}
                map first if restricted broadcasts or DMs say the recipient is unavailable.
              </p>
            </Section>

            <Section id="anchor" title="Anchor watch &amp; geofence">
              <p>
                Open <strong className="text-zinc-200">Anchor alarm</strong> from the top bar or go to{" "}
                <Link href="/anchor-alarm" className="font-medium text-emerald-400 hover:underline">
                  /anchor-alarm
                </Link>
                . There you can define an allowed swing circle, choose which device monitors movement, and arm the geofence
                at your current fix. The map shows your orange anchor ring while armed. That page is intentionally simple: it
                does <strong className="text-zinc-200">not</strong> show the optional nearby-friends ring or other users’
                pins — turn on <strong className="text-zinc-200">Show friends</strong> on{" "}
                <Link href="/" className="font-medium text-emerald-400 hover:underline">
                  Home
                </Link>{" "}
                or in{" "}
                <Link href="/map-sharing" className="font-medium text-emerald-400 hover:underline">
                  Map sharing
                </Link>{" "}
                if you want that layer.
              </p>
              <p>
                On <Link href="/" className="font-medium text-emerald-400 hover:underline">Home</Link>, a compact status
                line next to the map duplicates whether anchor watch is on or off; use it for a quick disarm or follow the
                link when disarmed to return to the full Anchor alarm page.
              </p>
              <p>
                <strong className="text-zinc-200">When the geofence trips</strong> (drift or bearing change beyond your
                limits), SeaLink shows a <strong className="text-zinc-200">full-screen alarm</strong> on devices configured
                to receive alerts, plays a <strong className="text-zinc-200">loud warning sound</strong>, and pulses
                vibration where the device supports it. Grant{" "}
                <strong className="text-zinc-200">notification permission</strong> if you want an extra banner when the tab
                is in the background (behaviour varies by browser).
              </p>
              <p>
                <strong className="text-zinc-200">Sound timing:</strong> the alarm audio plays when the alert appears and{" "}
                <strong className="text-zinc-200">repeats about every five minutes</strong> until you tap{" "}
                <strong className="text-zinc-200">Mark seen</strong> or <strong className="text-zinc-200">Reset anchor</strong>.
                To avoid draining attention overnight, playback <strong className="text-zinc-200">stops automatically after three hours</strong>{" "}
                even if the red screen is still open — use the buttons to clear the alert for good. Many browsers require a{" "}
                <strong className="text-zinc-200">tap (“play alarm sound”)</strong> the first time before audio is allowed.
              </p>
              <p>
                <strong className="text-zinc-200">Cross-device:</strong> signed-in users can choose which device monitors
                GPS and which device(s) should show the alert pop-up; settings sync when you save in the anchor dialog.
              </p>
              <p>
                <strong className="text-zinc-200">How often it checks:</strong> the geofence is evaluated about{" "}
                <strong className="text-zinc-200">every 30 seconds</strong> on the monitoring device, using the same
                stabilised position as your map pin and nearby features (not a second, hidden GPS track). If you monitor
                another device on board, its position is refreshed on the same interval from the server.
              </p>
              <p>
                Quality indicators reflect GPS stability — poor GPS causes false confidence.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                <li>Arm anchor watch only after your GPS ring is reasonably tight and you are actually anchored.</li>
                <li>Multi-device setups may show monitor vs alerting device roles where configured.</li>
                <li>Anchor alerts complement — but do not replace — deck checks, radar watch, and crew rounds.</li>
              </ul>
              <p className="rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-xs leading-5 text-amber-100/90">
                Anchor alerts depend on phone GPS and internet. Never rely on them as your only drag alarm.
              </p>
            </Section>

            <Section id="anchor-android-location" title="Android: location for anchor watch">
              <p>
                <strong className="text-zinc-200">Android:</strong> In system settings, allow{" "}
                <strong className="text-zinc-200">precise</strong> (high-accuracy) location for SeaLink or your browser.
                Small anchor rings need a tight GPS fix; if location is blurred for privacy, alerts can misfire.
              </p>
              <p>
                Android does not let websites turn precise location on automatically — only you can, in Settings. Use{" "}
                <strong className="text-zinc-200">Settings → Apps → your browser or SeaLink → Permissions → Location</strong>
                .
              </p>
              <p className="text-xs text-zinc-400">
                In the anchor dialog, <strong className="text-zinc-300">Open in Android settings</strong> tries to jump to
                app details for your browser or the SeaLink app. If nothing opens, use the path above — the same steps are
                offered in the app when that button does not launch Settings.
              </p>
            </Section>

            <Section id="sea-summary" title="Sea state summary on Home">
              <p>
                The summary card on Home combines contextual text with tide tables or marine snippets where configured. It
                may use marina proximity or place search — set or adjust context in the UI when offered so tides match your
                berth or anchorage as closely as the data allows.
              </p>
              <p>
                Tide tables use NOAA, Stormglass, or WorldTides when those integrations are configured on the server;
                otherwise the app can fall back to a live web search via OpenAI. For that fallback, set{" "}
                <span className="font-mono text-sm text-zinc-300">OPENAI_API_KEY</span> in the deployment environment (see{" "}
                <span className="font-mono text-sm text-zinc-300">.env.example</span>).
              </p>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Tip:</strong> If tides look wrong, check the displayed datum / station
                distance — always verify with official tide tables for pilotage.
              </p>
            </Section>

            <Section id="mob" title="Man overboard (MOB) in the dock">
              <p>
                The bottom strip includes a <strong className="text-zinc-200">MAN OVERBOARD</strong> button — it is{" "}
                <strong className="text-zinc-300">only active when you are signed in</strong> (otherwise it stays greyed
                out). Confirm in the dialog before sending; the app posts your last known position and profile details to
                nearby boaters on the network, not to official rescue services.
              </p>
              <p>
                It is designed for peer alerting within the app — read every on-screen warning before use. It does not
                replace DSC, EPIRB, PLB, or calling MRCC / coastguard by radio and phone.
              </p>
              <p>
                Real MOB recovery requires crew training, throwable gear, VHF/DSC, and immediate manoeuvring. Use the app
                feature only in line with your skills and local regulations.
              </p>
            </Section>

            <Section id="plans" title="Plans, payment &amp; access">
              <p>
                Subscription or trial state may gate parts of the app. Open <strong className="text-zinc-200">Plans</strong> from the Home header (
                <Link href="/payment" className="font-medium text-emerald-400 hover:underline">
                  /payment
                </Link>
                ) to review options, pay, or fix a lapsed plan. After paying, return to Home and refresh if access seems
                stale.
              </p>
              <p>
                <Link href="/payment/success" className="font-medium text-emerald-400 hover:underline">
                  Payment success
                </Link>{" "}
                is used as a return URL from checkout flows — you normally land there automatically after a provider
                redirects you back.
              </p>
            </Section>

            <Section id="sounds" title="Sounds &amp; in-app alerts">
              <p>
                <strong className="text-zinc-200">Area broadcasts &amp; vicinity / DM alerts:</strong> on the home map
                broadcast panel, <strong className="text-zinc-200">Message alert sound</strong> (on by default) controls
                the short chime when new nearby messages arrive. Use{" "}
                <strong className="text-zinc-200">Silence message alerts (no sound)</strong> in the bottom strip if you
                need the app quiet in a meeting or overnight — you will still see in-app indicators where implemented, but
                those <strong className="text-zinc-200">broadcast-related</strong> sounds are suppressed.
              </p>
              <p>
                <strong className="text-zinc-200">Anchor alarm:</strong> uses a separate, urgent alarm while a geofence
                breach is showing. It is <strong className="text-zinc-200">not</strong> turned off by “Silence message
                alerts” — you dismiss it from the full-screen anchor alarm (Seen / Reset anchor) or wait for the automatic
                sound timeout described in the Anchor section.
              </p>
              <p>
                <strong className="text-zinc-200">Man overboard (MOB):</strong> incoming MOB alerts from others can play
                their own alarm until you silence them on the alert card.
              </p>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Hint:</strong> On iOS, also check the physical mute switch and volume;
                browsers cannot override system silent mode.
              </p>
            </Section>

            <Section id="sponsors" title="Sponsor strip">
              <p>
                On Home, Anchor alarm, IFM, Messages, Weather, and Navigation charts, the bottom dock may show a thin row
                of <strong className="text-zinc-200">rotating sponsor images</strong> between the Man overboard button and
                the silence checkbox. Tap an image to open the sponsor&apos;s link in a new tab. Sponsors do not replace
                navigation or safety information — they are optional community or commercial messages run by SeaLink.
              </p>
            </Section>

            <Section id="share-install" title="Share SeaLink, install &amp; performance">
              <p>
                On Home, <strong className="text-zinc-200">Share SeaLink</strong> opens the device share sheet when
                available, or copies the site link for SMS, email, or WhatsApp deep links. Good for inviting crew or
                marina neighbours.
              </p>
              <p>
                SeaLink can run as a <strong className="text-zinc-200">Progressive Web App</strong> or inside a native
                wrapper on Android — install or &quot;Add to Home Screen&quot; for quicker launch and sometimes better
                background behaviour than a disposable browser tab. The saved icon should match SeaLink branding; if an
                old shortcut shows a blank tile, remove it and add the site again after updating, or clear site data for
                the origin and retry.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                <li>Keep the app updated — forecast endpoints and tiles change over time.</li>
                <li>Clear site data only if instructed by support; it may reset local preferences.</li>
              </ul>
            </Section>

            <Section id="iphone-install" title="iPhone &amp; iPad — save SeaLink on your Home Screen">
              <p>
                On Apple phones and tablets you can pin SeaLink like an app icon. It opens full-screen in{" "}
                <strong className="text-zinc-200">Safari</strong> (Apple&apos;s browser) — handy if you don&apos;t use the
                Android native build.
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-zinc-400">
                <li>
                  Open your SeaLink site in <strong className="text-zinc-300">Safari</strong> (not only inside another
                  app&apos;s in-app browser if that hides the share tools).
                </li>
                <li>
                  Tap the <strong className="text-zinc-300">Share</strong> button — the square with an arrow pointing up —
                  usually at the bottom on iPhone or top on iPad.
                </li>
                <li>
                  Scroll the actions list and tap <strong className="text-zinc-300">Add to Home Screen</strong>. If you
                  don&apos;t see it, swipe up on the grey icons row, tap <strong className="text-zinc-300">Edit Actions</strong>{" "}
                  / <strong className="text-zinc-300">More</strong>, and add &quot;Add to Home Screen&quot; to favourites.
                </li>
                <li>
                  Optionally change the label (e.g. &quot;SeaLink&quot;), then tap <strong className="text-zinc-300">Add</strong>{" "}
                  (top right). The icon appears on your Home Screen like any other app.
                </li>
                <li>
                  Open SeaLink from that icon next time — you stay signed in like a normal tab until cookies expire or you
                  clear website data.
                </li>
              </ol>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Note:</strong> Chrome and other browsers on iOS use Apple&apos;s web engine;
                they often have a similar <strong className="text-zinc-300">Share → Add to Home Screen</strong> path. The
                exact labels can change slightly with iOS updates.
              </p>
            </Section>

            <Section id="safety" title="Safety, privacy &amp; official information">
              <p>
                SeaLink is built for <strong className="text-zinc-200">recreational interest</strong>. It must not be used
                to plan passages or replace official weather, NAVAREA warnings, charts, or emergency procedures. Always use
                VHF/DSC, HF, and national emergency numbers for distress.
              </p>
              <p>
                Privacy practices are described in the{" "}
                <Link href="/privacy" className="font-medium text-emerald-400 hover:underline">
                  Privacy policy
                </Link>
                . Location and profile fields are sensitive — share only what you are comfortable with the community
                seeing.
              </p>
            </Section>

            <Section id="delete-data" title="Delete your data">
              <p>
                You can close your SeaLink account and remove data we hold for you at any time. Deleting removes your
                sign-in, profile, device registrations, listings you created (boats and gear), area broadcasts you authored,
                direct message threads you were part of, and billing rows we store for your user id where the database
                allows. Content others saved separately (for example screenshots) is outside the app.
              </p>
              <p>
                If you use <strong className="text-zinc-200">Google, Apple, or Facebook</strong> to sign in, deleting here
                removes the SeaLink account linked to that email — it does not delete your social account with the
                provider.
              </p>
              <p>
                After deletion, you can register again with the same email if you choose. Questions about data are
                covered in the{" "}
                <Link href="/privacy" className="font-medium text-emerald-400 hover:underline">
                  privacy policy
                </Link>
                ; you can also{" "}
                <a href={mailtoDevelopers} className="font-medium text-emerald-400 hover:underline">
                  email the developers
                </a>
                .
              </p>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-3 text-xs text-zinc-400">
                <strong className="text-zinc-300">Delete in the app:</strong> sign in, then open{" "}
                <Link href="/delete-data" className="font-mono text-emerald-400 hover:underline">
                  /delete-data
                </Link>{" "}
                — on the live site that is{" "}
                <a href="https://sealinkapp.com/delete-data" className="font-mono text-emerald-400 hover:underline">
                  https://sealinkapp.com/delete-data
                </a>
                .                 The old <span className="font-mono text-zinc-500">/delete-account</span> address redirects here. Use the
                button on that page to confirm.
              </p>
            </Section>

            <Section id="delete-my-data" title="Delete my data (information page)">
              <p>
                For <strong className="text-zinc-200">app stores and Meta (Facebook Login)</strong> we also publish a
                separate, plain static page with the same deletion instructions in normal text — no app navigation, no
                message alerts, and no pop-ups. Use that URL in the developer console when a “data deletion” or “user data
                deletion” link is required.
              </p>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-3 text-xs text-zinc-400">
                <strong className="text-zinc-300">Information-only page:</strong> open{" "}
                <Link href="/delete-my-data" className="font-mono text-emerald-400 hover:underline">
                  /delete-my-data
                </Link>{" "}
                — on the live site that is{" "}
                <a href="https://sealinkapp.com/delete-my-data" className="font-mono text-emerald-400 hover:underline">
                  https://sealinkapp.com/delete-my-data
                </a>
                . It links to <span className="font-mono text-zinc-500">/delete-data</span> for the actual deletion
                button once you are signed in, and lists the operator email for requests if you cannot use the app.
              </p>
            </Section>

            <Section id="troubleshooting" title="Troubleshooting">
              <ul className="list-disc space-y-2 pl-5 text-zinc-400">
                <li>
                  <strong className="text-zinc-300">No GPS / wrong place:</strong> check OS location permission for the
                  browser, disable mock location apps, go outdoors, disable VPNs that geo-shift, retry after 30–60 s.
                </li>
                <li>
                  <strong className="text-zinc-300">Map tiles blank:</strong> check network and ad-blockers; try another
                  base layer (Satellite vs Streets).
                </li>
                <li>
                  <strong className="text-zinc-300">Weather overlay missing:</strong> wait a few seconds after panning;
                  very zoomed-out views still load but slowly. Toggle layer off/on.
                </li>
                <li>
                  <strong className="text-zinc-300">Cannot post broadcast:</strong> enable sharing on the home map and
                  ensure you are signed in with network access.
                </li>
                <li>
                  <strong className="text-zinc-300">Payment / access:</strong> confirm card or wallet with your bank; open
                  Plans again after success; try sign-out and sign-in if entitlements look wrong.
                </li>
                <li>
                  <strong className="text-zinc-300">Anchor alarm silent:</strong> interact with the page once (tap{" "}
                  <strong className="text-zinc-200">Tap to play alarm sound</strong> on the red screen) so the browser
                  allows audio; check volume and Do Not Disturb.
                </li>
                <li>
                  <strong className="text-zinc-300">Messages not updating:</strong> confirm you are signed in, refresh the
                  Messages page, and check network; Direct chats need the recipient on your IFM friends list.
                </li>
              </ul>
              <p>
                If something still feels broken, use <strong className="text-zinc-200">Email developers</strong> below with
                screenshots, browser version, and steps to reproduce — that gets issues fixed fastest.
              </p>
            </Section>
          </article>
        </div>
      </div>

      <footer className="mt-16 rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-zinc-950 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-zinc-50">Contact the developers</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Bug reports, feature ideas, and account questions can go straight to the SeaLink developers. Your email app will
          open with <strong className="text-zinc-300">{DEV_EMAIL}</strong> in the To field and a short template in the
          message body — edit it before sending.
        </p>
        <a
          href={mailtoDevelopers}
          className="mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          Email developers
        </a>
        <p className="mt-4 text-xs text-zinc-500">
          If the button does nothing, copy the address manually:{" "}
          <span className="font-mono text-zinc-400">{DEV_EMAIL}</span>
        </p>
      </footer>
    </div>
  );
}
