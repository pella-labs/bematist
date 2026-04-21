import { ImageResponse } from "next/og";
import { OG_COLORS, OG_CONTENT_TYPE, OG_SIZE, OgFrame, OgHeadline, OgStatRow } from "../_og/chrome";

export const runtime = "nodejs";
export const alt = "Bema — generate your eight share cards from local agent history";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function CardOg() {
  return new ImageResponse(
    <OgFrame eyebrow="02 / share card">
      <OgHeadline
        eyebrow="for engineers · local-first"
        title={
          <span style={{ display: "flex", flexWrap: "wrap" }}>
            Generate your&nbsp;
            <span
              style={{
                color: OG_COLORS.accent,
                fontStyle: "italic",
                display: "flex",
              }}
            >
              eight share cards.
            </span>
          </span>
        }
        description="Plug in your Claude Code and Codex history. Parsed on your device — only your aggregate stats are saved. The rest never leaves your machine."
      />
      <OgStatRow
        stats={[
          { label: "Where it runs", value: "On your device" },
          { label: "What's saved", value: "Aggregate stats only" },
          { label: "Cards in series", value: "8 shareable" },
        ]}
      />
    </OgFrame>,
    { ...OG_SIZE },
  );
}
