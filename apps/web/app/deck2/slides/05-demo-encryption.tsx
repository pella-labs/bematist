import { SlideShell } from "../components/slide-shell";

/**
 * Slide 05 — Demo handoff #2, the session I cannot read.
 *
 * Mirror of slide 04: same sparse handoff affordance, same negative
 * space — but now the headline stakes the encryption claim. The
 * presenter will open a session and fail to read its prompts live.
 */
export function Slide05DemoEncryption({ totalPages }: { totalPages: number }) {
  return (
    <SlideShell sectionLabel="05 / DEMO — ENCRYPTION" pageNumber={5} totalPages={totalPages}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          minHeight: 0,
        }}
      >
        <h2 className="title" style={{ maxWidth: 1500 }}>
          I built this dashboard. <em>I still cannot read his prompts.</em>
        </h2>

        <div
          style={{
            marginTop: 140,
            display: "flex",
            alignItems: "center",
            gap: 28,
            fontFamily: "var(--f-mono)",
            fontSize: 22,
            color: "var(--ink-faint)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          <span
            aria-hidden
            style={{
              fontFamily: "var(--f-sys)",
              fontSize: 64,
              color: "var(--accent)",
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            →
          </span>
          <span>presenter: live dashboard</span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 96,
          right: 96,
          fontFamily: "var(--f-mono)",
          fontSize: 18,
          color: "var(--ink-faint)",
          letterSpacing: "0.04em",
          textAlign: "right",
        }}
      >
        per-user DEK · AES-256-GCM · enforced at query, not at render
      </div>
    </SlideShell>
  );
}
