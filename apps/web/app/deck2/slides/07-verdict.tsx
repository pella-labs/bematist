"use client";

import { CardMount } from "../../(marketing)/_card/CardMount";
import { DEMO_CARD } from "../../(marketing)/_card/demo-data";

// pellametric.com/intro is a 302 to the founders' Calendar booking page.
// pellametric.com/card is the public leaderboard card.
const CARD_LINK = "https://pellametric.com/card";
const SCHEDULE_LINK = "https://pellametric.com/intro";

/**
 * Slide 07 — Verdict.
 *
 * Closing tagline on the left ("every token, every tool, every repo —
 * finally counted"), CTA buttons stacked underneath, the card as hero
 * art on the right. Structurally mirrors deck/slide 12 so the visual
 * language of the closing moment is consistent across both decks.
 */
export function Slide07Verdict(_props: { totalPages: number }) {
  return (
    <div
      className="slide"
      style={{ padding: 0, height: "100%", position: "relative", overflow: "hidden" }}
    >
      <div className="grid-bg" />

      <div className="chrome-row">
        <div className="wordmark">
          <span className="wordmark-dot" /> pellametric
        </div>
        <div className="chrome-right">07 / VERDICT</div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.15fr)",
          gap: 72,
          alignItems: "stretch",
          padding: "176px 0 96px 96px",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            gap: 56,
            minHeight: 0,
            position: "relative",
            zIndex: 3,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <h2 className="title" style={{ margin: 0 }}>
              Every token, every tool, every repo.{" "}
              <em style={{ color: "var(--accent)", fontStyle: "normal", fontWeight: 500 }}>
                Finally counted.
              </em>
            </h2>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              alignItems: "stretch",
              width: 640,
              maxWidth: "100%",
            }}
          >
            <CtaButton
              href={CARD_LINK}
              label="pellametric.com/card →"
              description="For Claude Code and Codex users: claim your card today."
              tone="warm"
            />
            <CtaButton
              href={SCHEDULE_LINK}
              label="pellametric.com/intro →"
              description="For engineering leaders: map bottlenecks, workflows, and AI spend."
              tone="ghost"
            />
          </div>
        </div>

        <div
          className="deck-card-host"
          style={{
            position: "relative",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingRight: 72,
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "-120px -120px -120px -40px",
              background:
                "radial-gradient(circle at 50% 50%, rgba(176,123,62,0.22), transparent 55%), radial-gradient(circle at 30% 75%, rgba(110,138,111,0.16), transparent 60%)",
              filter: "blur(30px)",
              zIndex: 0,
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 2,
              width: 420,
              transform: "scale(1.45)",
              transformOrigin: "center center",
              filter: "drop-shadow(0 40px 80px rgba(0, 0, 0, 0.6))",
            }}
          >
            <CardMount demoData={DEMO_CARD} compact autoAdvanceMs={5000} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CtaButton({
  href,
  label,
  description,
  tone,
}: {
  href: string;
  label: string;
  description: string;
  tone: "accent" | "warm" | "ghost";
}) {
  const isGhost = tone === "ghost";
  const bg = isGhost ? "transparent" : tone === "accent" ? "var(--accent)" : "var(--warm)";
  const fg = isGhost ? "var(--ink)" : "#0a0b0d";
  const border = isGhost ? "1px solid rgba(255, 255, 255, 0.18)" : "none";
  const descriptionColor = isGhost ? "var(--ink-muted)" : "rgba(10,11,13,0.72)";
  return (
    <a
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 10,
        padding: "24px 32px",
        background: bg,
        color: fg,
        border,
        textDecoration: "none",
        width: "100%",
        boxSizing: "border-box",
        position: "relative",
        zIndex: 2,
      }}
    >
      <span
        style={{
          fontFamily: "var(--f-mono)",
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: "-0.01em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 16,
          lineHeight: 1.4,
          color: descriptionColor,
        }}
      >
        {description}
      </span>
    </a>
  );
}
