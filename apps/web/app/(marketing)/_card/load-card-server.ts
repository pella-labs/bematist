import "server-only";
import type { CardData } from "./card-utils";
import { DEMO_CARD } from "./demo-data";

/**
 * Demo-only card loader. The original Bema card system stores per-user stats
 * in Postgres; this port keeps the card UX as a static demo until a backend
 * card store is wired up. Returns null for any id other than "demo" so that
 * /card/<other> falls back gracefully.
 */
export type LoadedCard = {
  cardId: string;
  stats: CardData["stats"];
  user: {
    displayName: string | null;
    githubUsername: string | null;
    photoURL: string | null;
  } | null;
};

export async function loadCardServer(id: string): Promise<LoadedCard | null> {
  if (id !== "demo") return null;
  return {
    cardId: DEMO_CARD.cardId,
    stats: DEMO_CARD.stats,
    user: DEMO_CARD.user
      ? {
          displayName: DEMO_CARD.user.displayName ?? null,
          githubUsername: DEMO_CARD.user.githubUsername ?? null,
          photoURL: DEMO_CARD.user.photoURL ?? null,
        }
      : null,
  };
}
