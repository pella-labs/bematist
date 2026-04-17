import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Bematist · AI-engineering analytics, self-hostable",
  description:
    "Open-source, self-hostable AI-engineering analytics. Auto-instruments every developer's coding-agent usage and correlates LLM spend with Git outcomes — without panopticon leaderboards.",
};

export default function MarketingHome() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-6 py-24">
      <span className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
        Landing page entrypoint — content coming next
      </span>
      <h1 className="max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
        AI-engineering analytics, without the panopticon.
      </h1>
      <p className="max-w-2xl text-balance text-lg text-muted-foreground">
        Bematist auto-instruments every developer's coding-agent usage and correlates LLM spend with
        Git outcomes. Self-host in one container, or run on our managed cloud.
      </p>
      <div className="flex gap-3">
        <Link
          href="/"
          className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Open dashboard
        </Link>
        <a
          href="https://github.com/pella-labs/bematist"
          className="cursor-pointer rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Self-host on GitHub
        </a>
      </div>
    </section>
  );
}
