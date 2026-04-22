import type { CSSProperties, ReactNode } from "react";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png" as const;

export const OG_COLORS = {
  bg: "#0a0b0d",
  bgElevated: "#111316",
  ink: "#ede8de",
  inkMuted: "rgba(237,232,222,0.6)",
  inkFaint: "rgba(237,232,222,0.3)",
  border: "rgba(237,232,222,0.12)",
  accent: "#6e8a6f",
  accentSoft: "rgba(110,138,111,0.18)",
  warm: "#b07b3e",
} as const;

const baseFont: CSSProperties = {
  fontFamily: '"Inter", "Helvetica Neue", "system-ui", -apple-system, sans-serif',
};

const monoFont: CSSProperties = {
  fontFamily: '"JetBrains Mono", "Menlo", "ui-monospace", "SFMono-Regular", monospace',
};

/**
 * Background grid — soft, large-spaced so it reads as texture rather than
 * a ruled page. Keep the cell size ≥ 80px and keep opacity low.
 */
const grid: CSSProperties = {
  backgroundColor: OG_COLORS.bg,
  backgroundImage: `linear-gradient(to right, rgba(237,232,222,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(237,232,222,0.04) 1px, transparent 1px)`,
  backgroundSize: "96px 96px",
};

/**
 * Soft accent glow in one corner — gives the canvas depth without
 * needing decorative artwork.
 */
const glow: CSSProperties = {
  position: "absolute",
  top: -240,
  right: -180,
  width: 720,
  height: 720,
  borderRadius: 9999,
  background: `radial-gradient(circle, ${OG_COLORS.accentSoft} 0%, transparent 70%)`,
  filter: "blur(40px)",
  display: "flex",
};

export function OgFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        ...baseFont,
        ...grid,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        color: OG_COLORS.ink,
        position: "relative",
        padding: 72,
      }}
    >
      <div style={glow} />
      {/* Top bar — accent tile + wordmark. Matches the deck slide-01
          chrome. No right-side slug, no footer. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            background: OG_COLORS.accent,
            borderRadius: 4,
            display: "flex",
          }}
        />
        <span
          style={{
            color: OG_COLORS.ink,
            letterSpacing: "-0.02em",
            fontFamily: '"Inter", "Helvetica Neue", "system-ui", sans-serif',
            fontSize: 34,
            fontWeight: 700,
            display: "flex",
          }}
        >
          pella metrics
        </span>
      </div>

      {children}
    </div>
  );
}

export function OgHeadline({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginTop: 56,
        gap: 20,
        maxWidth: 960,
      }}
    >
      {eyebrow ? (
        <div
          style={{
            ...monoFont,
            fontSize: 14,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: OG_COLORS.accent,
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <div
        style={{
          fontSize: 72,
          fontWeight: 600,
          lineHeight: 1.02,
          letterSpacing: "-0.035em",
          color: OG_COLORS.ink,
          display: "flex",
        }}
      >
        {title}
      </div>
      {description ? (
        <div
          style={{
            fontSize: 24,
            lineHeight: 1.3,
            color: OG_COLORS.inkMuted,
            maxWidth: 820,
            display: "flex",
          }}
        >
          {description}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Deck-style cover — big wordmark + short tagline. Minimal keynote tone.
 * Vertically centered inside the OgFrame's flex column.
 */
export function OgCover({ title, beats }: { title: ReactNode; beats?: string[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 36,
        flex: 1,
        maxWidth: 1040,
      }}
    >
      <div
        style={{
          fontSize: 176,
          fontWeight: 600,
          lineHeight: 0.95,
          letterSpacing: "-0.05em",
          color: OG_COLORS.ink,
          display: "flex",
        }}
      >
        {title}
      </div>
      {beats && beats.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            fontSize: 44,
            lineHeight: 1.2,
            color: OG_COLORS.inkMuted,
          }}
        >
          {beats.map((b, i) => (
            <span
              key={b}
              style={{
                color: i === beats.length - 1 ? OG_COLORS.accent : OG_COLORS.ink,
                fontStyle: i === beats.length - 1 ? "italic" : "normal",
                display: "flex",
                marginRight: i === beats.length - 1 ? 0 : 20,
              }}
            >
              {b}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OgStatRow({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        marginTop: 28,
        flexWrap: "wrap",
      }}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "12px 18px",
            border: `1px solid ${OG_COLORS.border}`,
            background: "rgba(17,19,22,0.6)",
            borderRadius: 8,
            minWidth: 170,
          }}
        >
          <span
            style={{
              ...monoFont,
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: OG_COLORS.inkFaint,
            }}
          >
            {s.label}
          </span>
          <span
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: OG_COLORS.ink,
              letterSpacing: "-0.02em",
            }}
          >
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}
