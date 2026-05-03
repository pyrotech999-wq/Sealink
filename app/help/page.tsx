import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help | SeaLink",
  description:
    "How to use SeaLink: home map, sharing, weather, IFM, Buy & Sell (boats & gear), marinas, anchor watch, broadcasts, and more.",
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
  { id: "broadcasts", label: "Broadcasts & chat" },
  { id: "messages-broadcast-audience", label: "Messages — who sees broadcasts" },
  { id: "anchor", label: "Anchor watch" },
  { id: "anchor-android-location", label: "Android location (anchor)" },
  { id: "sea-summary", label: "Sea state on Home" },
  { id: "mob", label: "Man overboard (MOB)" },
  { id: "plans", label: "Plans & payment" },
  { id: "sounds", label: "Sounds & bottom bar" },
  { id: "share-install", label: "Share app & tips" },
  { id: "iphone-install", label: "iPhone — save as app" },
  { id: "safety", label: "Safety & official info" },
  { id: "delete-account", label: "Delete your account" },
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
                if you already have one. Use the <strong className="text-zinc-200">top navigation bar</strong> (Home, IFM,
                Messages, Weather &amp; sea, Buy &amp; Sell) on every screen size — it stays visible while you scroll.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                <li>
                  <strong className="text-zinc-300">Home</strong> — your main map, sea summary, shortcuts, and sharing.
                </li>
                <li>
                  <strong className="text-zinc-300">Weather &amp; sea</strong> — global forecast map (wind, waves, rain,
                  pressure).
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
                <strong className="text-zinc-200">Top navigation</strong> (desktop / tablet): quick jumps to Home, IFM,
                Messages, Weather &amp; sea, and Buy &amp; Sell (then choose boats or gear). The active page is highlighted in
                green.
              </p>
              <p>
                <strong className="text-zinc-200">Home header</strong> (black bar on Home): Plans, Admin (if you are an
                admin), profile and sign-out when signed in — or Sign in / Create account when not.
              </p>
              <p>
                <strong className="text-zinc-200">Bottom strip</strong> (all sizes): only{" "}
                <strong className="text-zinc-300">Man overboard</strong> and the &quot;Silence message alerts&quot; checkbox
                — no duplicate page tabs, since those live in the top bar.
              </p>
              <p>
                <strong className="text-zinc-200">Other page</strong> (
                <Link href="/other" className="font-medium text-emerald-400 hover:underline">
                  /other
                </Link>
                ): extra shortcuts such as profile and plans — useful if you bookmark it or follow an old link.
              </p>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Hint:</strong> Marinas are not on the main five tabs; open them from the
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
                show your position, wind timeline, optional nearby users, broadcasts, and tools like anchor watch. It loads
                best with a good GPS fix outdoors or near a window.
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
                  in range when sharing is on.
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

            <Section id="weather" title="Weather &amp; sea map">
              <p>
                Open{" "}
                <Link href="/local-map" className="font-medium text-emerald-400 hover:underline">
                  Weather &amp; sea
                </Link>{" "}
                for a full-screen style forecast map. It can start at your location if permitted, but you can pan and
                zoom worldwide.
              </p>
              <p>
                <strong className="text-zinc-200">Base map</strong>: Satellite, Streets, or Light — pick what makes
                overlays easiest to read for the region you are viewing.
              </p>
              <p>
                <strong className="text-zinc-200">Overlays</strong>: <strong className="text-zinc-300">Wind</strong>{" "}
                (particle flow), <strong className="text-zinc-300">Waves</strong> (height shading),{" "}
                <strong className="text-zinc-300">Rain</strong>, and <strong className="text-zinc-300">Pressure</strong>.
                Use the <strong className="text-zinc-300">Overlay</strong> slider to balance base map vs data.
              </p>
              <p>
                <strong className="text-zinc-200">Time</strong>: <strong className="text-zinc-300">Play</strong> animates
                the forecast; drag the time slider to a specific model hour. Check the legend under the map for units and
                data sources.
              </p>
              <p>
                <strong className="text-zinc-200">My location</strong> and <strong className="text-zinc-300">AI outlook</strong>{" "}
                (when shown): recentre the map on you, or ask for an AI-style narrative for the map centre — treat AI text
                as informal commentary, not a forecast product.
              </p>
              <p>
                A <strong className="text-zinc-300">storm / wind alert strip</strong> may appear above the map when
                relevant; it is informational — always verify with official warnings.
              </p>
              <p className="rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-xs leading-5 text-amber-100/90">
                <strong className="text-amber-200">Important:</strong> SeaLink weather is for interest and situational
                awareness only. For any decision to go to sea, use official meteorological services and licensed charts.
              </p>
            </Section>

            <Section id="ifm" title="IFM — International Friends Map">
              <p>
                <Link href="/ifm" className="font-medium text-emerald-400 hover:underline">
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
                Build and edit your friends list on the <Link href="/ifm" className="font-medium text-emerald-400 hover:underline">IFM</Link>{" "}
                (friends) map. Email-based friends match by account; phone-based friends need compatible IFM presence so
                the app can match a normalised number — if a friend never appears for restricted broadcasts, check that
                they are on your list and using IFM with a comparable identity.
              </p>
              <p className="text-xs text-zinc-500">
                Sent messages may show small badges such as “Friends nearby” or “Friends worldwide” so you can tell which
                option you used.
              </p>
            </Section>

            <Section id="anchor" title="Anchor watch &amp; geofence">
              <p>
                Anchor tools on the home map let you define an allowed swing circle and monitor whether your reported
                position stays inside it. Quality indicators reflect GPS stability — poor GPS causes false confidence.
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

            <Section id="sounds" title="Sounds, message alerts &amp; bottom bar">
              <p>
                New broadcast-related alerts can play a sound. Use <strong className="text-zinc-200">Silence message alerts</strong> in the bottom strip if you need the app quiet in a meeting or overnight — you will still see in-app indicators
                where implemented, but audio may be suppressed.
              </p>
              <p className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <strong className="text-zinc-300">Hint:</strong> On iOS, also check the physical mute switch and volume;
                browsers cannot override system silent mode.
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
                background behaviour than a disposable browser tab.
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

            <Section id="delete-account" title="Delete your account">
              <p>
                You can close your SeaLink account at any time. Deleting removes your sign-in, profile, device registrations,
                listings you created (boats and gear), area broadcasts you authored, direct message threads you were part
                of, and billing rows we store for your user id where the database allows. Content others saved separately
                (for example screenshots) is outside the app.
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
                <Link href="/delete-account" className="font-mono text-emerald-400 hover:underline">
                  /delete-account
                </Link>{" "}
                — on the live site that is{" "}
                <a
                  href="https://sealinkapp.com/delete-account"
                  className="font-mono text-emerald-400 hover:underline"
                >
                  https://sealinkapp.com/delete-account
                </a>
                . Use the button on that page to confirm.
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
