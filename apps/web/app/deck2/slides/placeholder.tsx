import { SlideShell } from "../components/slide-shell";

export function SlidePlaceholder({ totalPages }: { totalPages: number }) {
  return (
    <SlideShell sectionLabel="00 / PLACEHOLDER" pageNumber={1} totalPages={totalPages}>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--f-head)",
          fontSize: "var(--t-subtitle)",
          color: "var(--ink-muted)",
          letterSpacing: "-0.02em",
        }}
      >
        /deck2 scaffold — slides arriving
      </div>
    </SlideShell>
  );
}
