export const NAV_ITEMS: readonly {
  href: string;
  label: string;
  short: string;
  sub?: string;
  /** Treat these paths as this tab active (e.g. sale sub-routes). */
  alsoActiveFor?: readonly string[];
}[] = [
  { href: "/", label: "Home", short: "Home" },
  { href: "/ifm", label: "IFM", short: "IFM", sub: "International Friends Map" },
  { href: "/local-map", label: "Local map", short: "Local Map", sub: "Nearby boats" },
  { href: "/messaging", label: "Messages", short: "Messages", sub: "Broadcasts & vicinity chat" },
  { href: "/weather", label: "Weather & sea", short: "Weather", sub: "Weather & sea" },
  { href: "/for-sale", label: "Buy & Sell", short: "Buy & Sell", sub: "Boats & gear", alsoActiveFor: ["/vessels", "/gear"] },
];

