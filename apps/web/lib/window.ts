export const WINDOWS = [
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
  { key: "all", label: "All", days: null },
] as const;

export type WindowKey = (typeof WINDOWS)[number]["key"];

export function windowCutoff(k: WindowKey): Date | null {
  const w = WINDOWS.find(x => x.key === k);
  if (!w || w.days == null) return null;
  return new Date(Date.now() - w.days * 86400 * 1000);
}

export function parseWindow(raw: string | undefined): WindowKey {
  return ["7d", "30d", "90d", "all"].includes(raw ?? "") ? (raw as WindowKey) : "30d";
}
