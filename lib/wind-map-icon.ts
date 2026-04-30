import L from "leaflet";
import { downwindBearingDeg } from "@/lib/wind-compass";
import { mphToKnots, seaStateForMaxWindMph } from "@/lib/wind-tiers";

/** Wind arrow + speed; anchor sits near the user (bottom centre of icon at map point). */
export function buildWindArrowDivIcon(mph: number, dirFromDeg: number): L.DivIcon {
  const kn = mphToKnots(mph);
  const tier = seaStateForMaxWindMph(mph);
  const downwind = downwindBearingDeg(dirFromDeg);
  const stroke =
    tier.id === "calm" || tier.id === "light"
      ? "#15803d"
      : tier.id === "amber"
        ? "#b45309"
        : "#b91c1c";
  const fill =
    tier.id === "calm" || tier.id === "light"
      ? "#22c55e"
      : tier.id === "amber"
        ? "#f59e0b"
        : "#ef4444";

  const mphR = Math.round(mph);
  const knR = Math.round(kn);

  const html = `
<div class="sealink-wind-pin" style="width:104px;height:138px;pointer-events:none;font-family:system-ui,sans-serif;">
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:10px;padding-bottom:2px;box-sizing:border-box;">
    <div style="flex:0 0 auto;position:relative;z-index:2;margin-top:0;text-align:center;line-height:1.1;padding:4px 7px;border-radius:8px;background:rgba(255,255,255,.98);box-shadow:0 1px 6px rgba(0,0,0,.2);border:1px solid rgba(0,0,0,.1);">
      <div style="font-size:14px;font-weight:800;color:#18181b;letter-spacing:-0.02em">${mphR} mph</div>
      <div style="font-size:11px;font-weight:700;color:#3f3f46">${knR} kn</div>
    </div>
    <div style="flex:0 0 auto;display:flex;align-items:flex-start;justify-content:center;width:76px;height:78px;transform:rotate(${downwind}deg);transform-origin:50% 88%;">
      <svg width="56" height="64" viewBox="0 0 56 64" aria-hidden="true" style="display:block;">
        <defs>
          <filter id="wshadow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.3"/>
          </filter>
        </defs>
        <path
          d="M 28 2 L 46 28 L 34 28 L 34 60 L 22 60 L 22 28 L 10 28 Z"
          fill="${fill}"
          stroke="${stroke}"
          stroke-width="1.75"
          stroke-linejoin="round"
          stroke-linecap="round"
          filter="url(#wshadow)"
        />
      </svg>
    </div>
  </div>
</div>`;

  return L.divIcon({
    className: "sealink-wind-arrow",
    html,
    iconSize: [104, 138],
    iconAnchor: [52, 138],
  });
}
