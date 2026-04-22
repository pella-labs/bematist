import { DEMO_CARD } from "@/app/(marketing)/_card/demo-data";

/**
 * Demo-only card endpoint. Always returns DEMO_CARD regardless of id so the
 * ported /card/[id] UX renders without a backend card store. Wire this up to
 * a real loader when card minting lands.
 */
export async function GET() {
  return Response.json(DEMO_CARD);
}
