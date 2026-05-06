export const NAV_ITEMS: readonly {
  href: string;
  label: string;
  short: string;
  sub?: string;
  /** Treat these paths as this tab active (e.g. sale sub-routes). */
  alsoActiveFor?: readonly string[];
}[] = [
  { href: "/", label: "Home", short: "Home" },
  {
    href: "/anchor-alarm",
    label: "Anchor alarm",
    short: "Anchor",
    sub: "Geofence & drift alerts",
  },
  { href: "/ifm", label: "IFM", short: "IFM", sub: "International Friends Map" },
  { href: "/messaging", label: "Messages", short: "Messages", sub: "Broadcasts & vicinity chat" },
  { href: "/weather", label: "Weather & sea", short: "Weather", sub: "Weather & sea" },
  {
    href: "/navigation-charts",
    label: "Navigation charts",
    short: "Charts",
    sub: "Upload KAP / BSB charts",
  },
  { href: "/for-sale", label: "Buy & Sell", short: "Buy & Sell", sub: "Boats & gear", alsoActiveFor: ["/vessels", "/gear"] },
];

