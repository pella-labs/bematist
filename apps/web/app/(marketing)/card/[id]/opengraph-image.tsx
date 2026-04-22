import { ImageResponse } from "next/og";
import { OG_CONTENT_TYPE, OG_SIZE, OgCover, OgFrame } from "../../_og/chrome";

export const runtime = "nodejs";
export const alt = "A Pella Metrics card — a developer's coding-agent activity at a glance";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * Demo-only port — every card id renders the marketing cover. When real
 * cards exist, load them here and switch to a personalized OgHeadline +
 * OgStatRow (see the original bematist implementation for the shape).
 */
export default function CardOg() {
  return new ImageResponse(
    <OgFrame>
      <OgCover title="Your year in prompts." beats={["Parsed on device.", "No code leaves."]} />
    </OgFrame>,
    { ...OG_SIZE },
  );
}
