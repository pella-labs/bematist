/**
 * Color-dot pseudonymization for cluster contributors.
 *
 * Per CLAUDE.md §Scoring Rules: IC names are hidden by default (color dots;
 * reveal requires IC opt-in). Color is derived deterministically from the
 * engineer hash so the same engineer always paints the same color across
 * Twin Finder + cluster views, without ever surfacing identity.
 *
 * Pure server component — no JS shipped to the client.
 */
export interface ContributorDotProps {
  /** Opaque `eh_*` hash from the API. NEVER pass a raw engineer_id. */
  hash: string;
  /** Diameter in px; default 10. */
  size?: number;
}

export function ContributorDot({ hash, size = 10 }: ContributorDotProps) {
  const hue = hashToHue(hash);
  return (
    <span
      aria-hidden="true"
      className="inline-block rounded-full ring-1 ring-border"
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(${hue}deg 65% 55%)`,
      }}
    />
  );
}

/**
 * Map a hash string to a deterministic hue in [0, 360). FNV-1a 32-bit keeps
 * this cheap + avalanche-good for the short `eh_xxxxxxxx` strings the API
 * returns. No secret material here — it's just a stable coloring.
 */
function hashToHue(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 360;
}
