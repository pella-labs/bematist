import { activityOverview, codeDelivery, cohortFilters, sessionsFeed } from "@bematist/api";
import type { Metadata } from "next";
import { getSessionCtx } from "@/lib/session";
import { ActivitySection } from "./_components/ActivitySection";
import { DeliverySection } from "./_components/DeliverySection";
import { FilterBar } from "./_components/FilterBar";
import { SessionsSection } from "./_components/SessionsSection";
import { parseFilterFromSearchParams } from "./_filter";

export const metadata: Metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewDashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const ctx = await getSessionCtx();
  const filter = parseFilterFromSearchParams(params, ctx.actor_id);

  const [activity, delivery, cohorts, feedPage] = await Promise.all([
    activityOverview(ctx, filter),
    codeDelivery(ctx, filter),
    cohortFilters(ctx),
    sessionsFeed(ctx, { ...filter, page_size: 50 }),
  ]);

  return (
    <div className="newdash">
      <header className="newdash-head">
        <h1 className="newdash-h1">Dashboard</h1>
        <p className="newdash-sub">Activity, code delivery, and sessions — filtered together.</p>
      </header>
      <FilterBar filter={filter} cohorts={cohorts} myEngineerHash={engineerHash(ctx.actor_id)} />
      <ActivitySection data={activity} window={filter.window} />
      <DeliverySection data={delivery} />
      <SessionsSection initial={feedPage} filter={filter} />
    </div>
  );
}

/**
 * Collapse actor_id to an 8-char hash identical to the one packages/api
 * returns on rows. Used by the FilterBar "Just me" pill so the client
 * can compare without leaking the raw actor_id into the URL.
 */
function engineerHash(actor_id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < actor_id.length; i++) {
    h ^= actor_id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}
