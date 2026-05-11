import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of use | SeaLink",
  description:
    "Terms of use for SeaLink: recreational and entertainment use only; not for voyage planning, navigation, or emergency.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 pb-24 sm:px-6">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-emerald-400">
        <Link href="/" className="hover:underline">
          ← Home
        </Link>
        <Link href="/help" className="hover:underline">
          Help
        </Link>
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
      </nav>

      <aside className="mt-8 rounded-xl border-2 border-amber-600/60 bg-amber-950/40 px-4 py-5 sm:px-5" aria-label="Safety notice">
        <p className="text-sm font-bold text-amber-100">Important Safety Notice</p>
        <p className="mt-2 text-sm leading-6 text-amber-50/90">
          SeaLink and all anchor alarm notifications are provided for informational purposes only.
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-50/90">
          SeaLink must not be relied upon for life, safety, emergency response, navigation, collision avoidance,
          security, anchoring decisions, or protection of property.
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-50/90">
          GPS position data, mobile devices, background app activity, internet connectivity, notifications, and
          third-party services may be delayed, inaccurate, interrupted, or unavailable at any time.
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-50/90">
          You are solely responsible for maintaining a proper watch, verifying your vessel&apos;s position, and using
          appropriate marine safety equipment and procedures at all times.
        </p>
      </aside>

      <h1 className="mt-8 text-2xl font-semibold tracking-tight text-zinc-50">Terms of use</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Last updated April 2026. These terms are also referred to as <strong className="text-zinc-300">terms and conditions</strong> or{" "}
        <strong className="text-zinc-300">T&amp;C</strong> where the app uses those labels. They apply to SeaLink (the &quot;Service&quot;,
        &quot;we&quot;, &quot;us&quot;, &quot;our&quot;) and you (&quot;you&quot;, &quot;your&quot;, &quot;user&quot;).
      </p>

      {/* Critical limitations — must be visible at top */}
      <aside
        className="mt-8 rounded-xl border-2 border-amber-600/60 bg-amber-950/40 px-4 py-5 sm:px-5"
        aria-label="Important limitations on use"
      >
        <p className="text-xs font-bold uppercase tracking-wide text-amber-200">Read before you use SeaLink</p>
        <ul className="mt-4 list-none space-y-4 text-sm leading-6 text-amber-50/95">
          <li>
            <strong className="text-amber-100">Recreational use only.</strong> SeaLink is provided for casual, non-professional,
            recreational interest. It is <strong className="text-amber-100">not</strong> a navigational aid, passage-planning tool,
            safety system, or substitute for qualified maritime training or judgment.
          </li>
          <li>
            <strong className="text-amber-100">Do not use for planning trips or sailing.</strong> You must{" "}
            <strong className="text-amber-100">not</strong> use the Service to plan voyages, passages, routes, departures, or any
            decision to go to sea or to sail. Any map, forecast, tide, current, or other information shown here must not be used for
            that purpose.
          </li>
          <li>
            <strong className="text-amber-100">Official weather and official sources only for decisions.</strong> For any decision
            related to going afloat, weather routing, or safety at sea, you must obtain and rely on{" "}
            <strong className="text-amber-100">official</strong> meteorological and maritime information (for example national
            hydrographic offices, meteorological agencies, coast radio, NAVTEX, SAFETYNET, and other lawful official channels) and
            appropriate paper or approved electronic charts. Content in SeaLink is for{" "}
            <strong className="text-amber-100">entertainment and general interest only</strong>.
          </li>
          <li>
            <strong className="text-amber-100">Emergency and distress.</strong> The Service is not a replacement for emergency
            alerting. In any situation that may require rescue or professional assistance, you must first (and as applicable, in
            parallel with continuing efforts) use recognised emergency procedures: transmit distress on{" "}
            <strong className="text-amber-100">HF, VHF, or UHF</strong> maritime or aeronautical radio in accordance with
            international and local rules; contact the <strong className="text-amber-100">coastguard, MRCC, or equivalent rescue
            coordination authority</strong>; and use <strong className="text-amber-100">normal emergency telephone numbers</strong>{" "}
            (for example 999, 112, 911, or the numbers published for your region) and other official emergency responders. Any
            in-app help, chat, community message, broadcast, or similar feature may only be used{" "}
            <strong className="text-amber-100">in addition to</strong> those means and{" "}
            <strong className="text-amber-100">after</strong> proper distress and urgency traffic has been initiated where
            appropriate. We do not guarantee monitoring, response times, or that any message reaches anyone able to assist.
          </li>
          <li>
            <strong className="text-amber-100">Data and messages may be wrong.</strong> Weather data, forecasts, tides, maps,
            positions, and all user-generated or third-party content (including messages, alerts, and &quot;AI&quot; or automated
            text) may be incomplete, delayed, mis-stated, or entirely inaccurate.{" "}
            <strong className="text-amber-100">Nothing in the Service is to be relied on</strong> for navigation, safety, legal, or
            financial decisions.
          </li>
        </ul>
      </aside>

      <div className="mt-12 space-y-10 text-sm leading-7 text-zinc-300">
        <section>
          <h2 className="text-base font-semibold text-zinc-100">1. Acceptance and acknowledgements</h2>
          <p className="mt-3">
            By creating an account, signing in, or otherwise using the Service, you confirm that you have read, understood, and
            agree to be bound by these terms. You expressly acknowledge the limitations in the notice above and agree that you
            will comply with them. If you do not agree, you must not use the Service. We may refuse service to anyone at any time.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">2. Nature of the Service</h2>
          <p className="mt-3">
            SeaLink may include maps, location sharing, weather and marine overlays, tides or related data, listings, social or
            community features, notifications, payment flows, and other functionality. All such features are provided for
            entertainment, community interest, and recreational curiosity unless we expressly state otherwise in a separate written
            agreement signed by both parties. The Service does not create a duty of care, watch, or rescue obligation on our part.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">3. No voyage planning; no reliance</h2>
          <p className="mt-3">
            You agree not to use the Service as any part of passage planning, sail or motor plan, departure decision, crew briefing
            for going to sea, or compliance with regulatory carriage requirements. You agree that you will not treat any forecast,
            graphic, table, or narrative in the Service as authoritative. Official products and licensed publications remain solely
            responsible sources for those purposes.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">4. Weather, environmental, and third-party data</h2>
          <p className="mt-3">
            Forecasts and environmental layers are compiled from third-party models, APIs, or tiles and may be interpolated,
            re-projected, cached, or delayed. They can differ materially from official bulletins. We do not warrant accuracy,
            timeliness, completeness, or fitness for any purpose. Model names (for example ECMWF) are for attribution only and do
            not imply endorsement or that you are receiving an official product.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">5. Maps, positioning, and charts</h2>
          <p className="mt-3">
            Basemaps and overlays are not nautical charts. They must not be used for fixing position, determining depth, identifying
            aids to navigation, or meeting carriage-of-charts obligations. Browser and device GNSS can be spoofed, jammed, absent, or
            inaccurate. You are solely responsible for safe navigation and for carrying and using appropriate official charts and
            publications.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">6. Communications, broadcasts, and community content</h2>
          <p className="mt-3">
            Messages between users, area broadcasts, profile fields, listings, and any automated or AI-assisted text are user- or
            machine-generated. They may be false, offensive, illegal in your jurisdiction, or harmful if followed. We may moderate or
            remove content but are under no obligation to do so. You use all such content at your own risk and must verify anything
            material through independent, official channels.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">7. Emergency procedures (again)</h2>
          <p className="mt-3">
            Nothing in these terms authorises you to delay or replace distress, urgency, or safety communications on recognised
            radio frequencies or official emergency numbers. If you use in-app features to request help, you represent that you have
            already taken, or are simultaneously taking, appropriate steps on radio and with official responders where the situation
            warrants it. False or frivolous distress is unlawful; you indemnify us against claims arising from misuse of emergency or
            help features.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">8. No professional advice</h2>
          <p className="mt-3">
            The Service does not provide legal, medical, insurance, survey, engineering, or maritime professional advice. Any
            suggestion, summary, or &quot;outlook&quot; is informational entertainment only unless delivered by a separately identified
            licensed professional under a separate contract with you.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">9. Accounts, age, and security</h2>
          <p className="mt-3">
            You must provide accurate registration information where required and keep passwords confidential. You are responsible
            for all activity under your credentials. You must be old enough under applicable law to agree to these terms. You must not
            share access in a way that circumvents security or subscription limits.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">10. Acceptable use</h2>
          <p className="mt-3">Without limitation, you agree not to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Use the Service in breach of maritime, telecommunications, privacy, or criminal law.</li>
            <li>Harass, threaten, defraud, stalk, or endanger other users or the public.</li>
            <li>Transmit malware, scrape at scale, or probe or attack our infrastructure.</li>
            <li>Misrepresent identity, vessel details, distress, or location in a way that could divert rescue resources.</li>
            <li>Infringe intellectual property or misuse personal data of others.</li>
            <li>Resell or repackage the Service without written permission.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">11. Your content and licence to us</h2>
          <p className="mt-3">
            You retain ownership of content you submit. You grant us a worldwide, non-exclusive, royalty-free licence to host, store,
            reproduce, adapt, display, and distribute that content solely to operate, promote, and improve the Service and to comply with
            law. You warrant you have the rights to grant this licence and that your content does not violate these terms.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">12. Third-party services and links</h2>
          <p className="mt-3">
            The Service may integrate payment processors, maps, forecasts, analytics, hosting, and other third parties. Their terms and
            privacy policies apply to their processing. We are not responsible for third-party failures, content, or charges.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">13. Subscriptions and fees</h2>
          <p className="mt-3">
            Paid features, if any, are offered on the terms shown at checkout. Taxes may apply. Unless mandatory consumer law says
            otherwise, fees paid are non-refundable except as stated at purchase. We may change prices or plans on reasonable notice
            where the law allows.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">14. Intellectual property</h2>
          <p className="mt-3">
            Except for your content and third-party materials, the Service, branding, and software are our property or our
            licensors&apos;. You receive a limited, revocable, non-transferable licence to access the Service for personal
            recreational use in line with these terms. No licence is granted to underlying models, datasets, or source code.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">15. Disclaimers</h2>
          <p className="mt-3">
            To the fullest extent permitted by law, the Service is provided &quot;as is&quot; and &quot;as available&quot; without
            warranties of any kind, whether express, implied, or statutory, including implied warranties of merchantability, fitness for
            a particular purpose, title, and non-infringement. We do not warrant uninterrupted or error-free operation or that
            defects will be corrected.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">16. Limitation of liability</h2>
          <p className="mt-3">
            To the maximum extent permitted by law, we and our directors, employees, contractors, and suppliers shall not be liable
            for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of profits, goodwill,
            data, use, or life or limb arising from or related to the Service, whether in contract, tort (including negligence),
            strict liability, or otherwise, even if advised of the possibility.
          </p>
          <p className="mt-3">
            Our aggregate liability for all claims arising out of or relating to the Service in any twelve-month period is limited to
            the greater of (a) the fees you paid us in that period or (b) fifty pounds sterling (GBP 50) if you paid nothing. Some
            jurisdictions do not allow certain exclusions; in that event our liability is limited to the fullest extent permitted.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">17. Indemnity</h2>
          <p className="mt-3">
            You agree to defend, indemnify, and hold harmless us and our affiliates from claims, damages, losses, liabilities, and
            costs (including reasonable legal fees) arising from your use of the Service, your content, your breach of these terms,
            or your violation of law or third-party rights.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">18. Suspension and termination</h2>
          <p className="mt-3">
            We may suspend or terminate access, remove content, or close accounts at our discretion, including for breach, risk to
            others, legal process, or operational reasons. You may stop using the Service at any time. Provisions that by their nature
            should survive (including disclaimers, limitations, indemnity, and governing law) survive termination.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">19. Force majeure</h2>
          <p className="mt-3">
            We are not liable for failure or delay caused by events beyond our reasonable control, including natural disasters, war,
            terrorism, labour disputes, utility or internet failures, or government action.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">20. Changes to the Service and to these terms</h2>
          <p className="mt-3">
            We may modify the Service or these terms. Material changes will be indicated in-app or by posting an updated date above.
            Continued use after changes constitutes acceptance. If you do not agree, stop using the Service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">21. Governing law and disputes</h2>
          <p className="mt-3">
            Unless mandatory local law provides otherwise, these terms are governed by the laws of England and Wales. Subject to
            mandatory consumer rights in your country, the courts of England and Wales have exclusive jurisdiction. Nothing in these
            terms limits any right you may have to bring a claim in the courts of your home country where EU or UK consumer law
            requires it.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">22. Severability and entire agreement</h2>
          <p className="mt-3">
            If any provision is held invalid, the remainder remains in effect. These terms, together with the privacy policy and any
            order-specific terms presented at purchase, constitute the entire agreement regarding the Service and supersede prior
            oral or written understandings on the same subject.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-100">23. Contact</h2>
          <p className="mt-3">
            For questions about these terms, use the contact method published on the SeaLink website or app. General guidance is also
            linked from our{" "}
            <Link href="/help" className="font-medium text-emerald-400 hover:underline">
              Help
            </Link>{" "}
            page (which does not amend these terms).
          </p>
        </section>

        <p className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-xs leading-5 text-zinc-500">
          SeaLink encourages every user to carry appropriate safety equipment, maintain radio watch where required, and comply with
          local maritime regulations. These terms are intended to reflect serious recreational limitations; they are not a substitute
          for legal advice tailored to your operations or jurisdiction.
        </p>

        <nav
          className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-zinc-800 pt-8 text-sm text-zinc-400"
          aria-label="Related pages"
        >
          <Link href="/privacy" className="hover:text-zinc-200 hover:underline">
            Privacy policy
          </Link>
          <Link href="/help" className="hover:text-zinc-200 hover:underline">
            Help
          </Link>
        </nav>
      </div>
    </div>
  );
}
