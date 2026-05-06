/**
 * OpenCPN US Pilot Charts — same nine regional .7z archives as
 * https://opencpn.org/OpenCPN/info/pilotcharts.html (link labels match that page).
 * Files are hosted by OpenCPN; we link to them and optionally record HTTP metadata (HEAD) in KV.
 */
export const OPENCPN_PILOT_CHARTS_PAGE = "https://opencpn.org/OpenCPN/info/pilotcharts.html";

const DOC_BASE = "https://opencpn.org/OpenCPN/doc";

export type OpenCpnPilotArchive = {
  /** Stable id for manifest merge / KV rows */
  id: string;
  /** Anchor text on OpenCPN’s pilot charts page */
  label: string;
  /** Trailing phrase from the page (after the link), when present */
  sublabel?: string;
  filename: string;
  downloadUrl: string;
};

export const OPENCPN_PILOT_ARCHIVES: readonly OpenCpnPilotArchive[] = [
  {
    id: "nan",
    label: "The Northern North Atlantic",
    sublabel: "the far north part.",
    filename: "NAN.7z",
    downloadUrl: `${DOC_BASE}/NAN.7z`,
  },
  {
    id: "nac",
    label: "The Central North Atlantic",
    sublabel: "the main part.",
    filename: "NAC.7z",
    downloadUrl: `${DOC_BASE}/NAC.7z`,
  },
  {
    id: "naw",
    label: "The Western North Atlantic",
    sublabel: "the Caribbean.",
    filename: "NAW.7z",
    downloadUrl: `${DOC_BASE}/NAW.7z`,
  },
  {
    id: "sa",
    label: "The South Atlantic",
    filename: "SA.7z",
    downloadUrl: `${DOC_BASE}/SA.7z`,
  },
  {
    id: "med",
    label: "The Mediterranean",
    filename: "MED.7z",
    downloadUrl: `${DOC_BASE}/MED.7z`,
  },
  {
    id: "np",
    label: "The North Pacific Ocean",
    filename: "NP.7z",
    downloadUrl: `${DOC_BASE}/NP.7z`,
  },
  {
    id: "sp",
    label: "South Pacific",
    filename: "SP.7z",
    downloadUrl: `${DOC_BASE}/SP.7z`,
  },
  {
    id: "spinfo",
    label: "South Pacific Information Sheets",
    filename: "SPinfo.7z",
    downloadUrl: `${DOC_BASE}/SPinfo.7z`,
  },
  {
    id: "io",
    label: "The Indian Ocean",
    filename: "IO.7z",
    downloadUrl: `${DOC_BASE}/IO.7z`,
  },
] as const;

export const OPENCPN_PILOT_MD5_URL = `${DOC_BASE}/md5.txt`;
