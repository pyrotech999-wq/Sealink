/** Convert mph to knots (1 kn = 1.15078 mph). */
export function mphToKnots(mph: number): number {
  return mph / 1.15078;
}

export type WindTierId = "calm" | "light" | "amber" | "rough" | "extreme";

export type WindTierStyle = {
  id: WindTierId;
  /** Short sea state line for the card */
  sea: string;
  boxClass: string;
  badgeClass: string;
};

/**
 * Daily max wind (mph) → colour band + sea description (your copy).
 * Bands: [0,12), [12,23), [23,35), [35,47), [47,120+]
 */
export function seaStateForMaxWindMph(mph: number): WindTierStyle {
  const v = Math.max(0, mph);

  if (v < 12) {
    return {
      id: "calm",
      sea: "Sea flat to slight",
      boxClass: "border-green-600/80 bg-green-50 text-green-950 dark:border-green-500/70 dark:bg-green-950/40 dark:text-green-50",
      badgeClass: "bg-green-600 text-white",
    };
  }
  if (v < 23) {
    return {
      id: "light",
      sea: "Flat to slight — some waves",
      boxClass: "border-green-600/80 bg-emerald-50 text-emerald-950 dark:border-emerald-500/70 dark:bg-emerald-950/35 dark:text-emerald-50",
      badgeClass: "bg-green-600 text-white",
    };
  }
  if (v < 35) {
    return {
      id: "amber",
      sea: "Rough seas developing",
      boxClass: "border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950/40 dark:text-amber-50",
      badgeClass: "bg-amber-600 text-white",
    };
  }
  if (v < 47) {
    return {
      id: "rough",
      sea: "Rough seas — avoid unless experienced",
      boxClass: "border-red-600 bg-red-50 text-red-950 dark:border-red-500 dark:bg-red-950/45 dark:text-red-50",
      badgeClass: "bg-red-600 text-white",
    };
  }
  return {
    id: "extreme",
    sea: "High seas — dangerous — beware of mooring",
    boxClass: "border-red-800 bg-red-100 text-red-950 dark:border-red-600 dark:bg-red-950/60 dark:text-red-50",
    badgeClass: "bg-red-800 text-white",
  };
}
