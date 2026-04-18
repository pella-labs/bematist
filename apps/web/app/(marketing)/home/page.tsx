import type { Metadata } from "next";
import Link from "next/link";
import { CardMount } from "../_card/CardMount";
import { DEMO_CARD } from "../_card/demo-data";
import { BrandMonolith } from "../_components/BrandMonolith";
import { DashboardShot } from "../_components/DashboardShot";
import { HeroGrid } from "../_components/HeroGrid";

const HOME_TITLE = "Bematist · The instrument for AI-assisted engineering";
const HOME_DESCRIPTION =
  "Bematist is the analytics platform for AI-assisted software development. See where every dollar lands, which workflows ship code, and the patterns worth copying across your team.";

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/home" },
  openGraph: {
    type: "website",
    url: "/home",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    site: "@bematist_dev",
  },
};

const ADAPTERS = [
  {
    name: "Claude Code",
    iface: "CLI",
    notes: "Tokens, sessions, tool calls, accepted edits.",
  },
  {
    name: "Cursor",
    iface: "IDE",
    notes: "Edits, diff sizes, model routing, acceptance decisions.",
  },
  {
    name: "Codex CLI",
    iface: "CLI",
    notes: "JSONL session tail with cumulative token diffs.",
  },
] as const;

const FEATURES = [
  {
    eyebrow: "01",
    title: "See where the money goes",
    body: "One lightweight agent per machine detects the AI coding tools your engineers already use. Tokens, cost, sessions, actions — unified across every agent, in one company-owned backend.",
  },
  {
    eyebrow: "02",
    title: "Tie spend to shipped code",
    body: "Every accepted edit joins a commit. Every commit joins a merged PR. You see cost per shipped change, not cost per token — and which tools are creating real leverage.",
  },
  {
    eyebrow: "03",
    title: "Learn the patterns worth copying",
    body: "Spot inefficient loops, expensive model routing, and workflows that burn tokens without results. Surface the prompts and patterns your strongest engineers use that the rest of the team could adopt.",
  },
] as const;

export default function MarketingHome() {
  return (
    <>
      {/* Hero */}
      <section className="mk-hero">
        <HeroGrid />
        <div className="mk-hero-grid">
          <div className="mk-hero-content">
            <div className="mk-sys" style={{ marginBottom: 20 }}>
              open-source. self-hostable.
            </div>
            <h1>
              Where is all your AI money <em>actually going</em>?
            </h1>
            <p>
              AI coding agents are exploding across engineering teams — Claude Code, Cursor, Codex.
              Spend is up, usage is everywhere, but the answer to "what are we getting back" is
              still a black box. Bematist makes that system legible. Start with a personal card in
              30 seconds; the dashboard is where your team lives.
            </p>
            <div className="mk-hero-actions">
              <Link href="/card" className="mk-btn mk-btn-primary">
                Grab your card
              </Link>
              <a
                href="https://github.com/pella-labs/bematist"
                className="mk-btn mk-btn-ghost"
                rel="noreferrer"
              >
                View on GitHub
              </a>
            </div>
          </div>
          <div className="mk-hero-card-slot">
            <CardMount demoData={DEMO_CARD} compact />
          </div>
        </div>
      </section>

      {/* Dashboard screenshot */}
      <DashboardShot />

      {/* Brand monolith */}
      <BrandMonolith />

      {/* Features */}
      <section aria-label="What the dashboard does">
        <div className="mk-section-header">
          <span className="mk-mono mk-xs">01 / What Bematist gives you</span>
        </div>
        <div className="mk-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="mk-feature">
              <span className="mk-feature-index">{f.eyebrow}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Adapters */}
      <section>
        <div className="mk-section-header">
          <span className="mk-mono mk-xs">02 / Supported agents</span>
        </div>
        <table className="mk-table">
          <thead>
            <tr>
              <th>Target</th>
              <th>Interface</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {ADAPTERS.map((row) => (
              <tr key={row.name}>
                <td style={{ color: "var(--mk-ink)" }}>{row.name}</td>
                <td className="mk-muted">{row.iface}</td>
                <td>
                  <span className="mk-badge full">Shipped</span>
                </td>
                <td className="mk-muted">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Primary metric */}
      <section className="mk-metric" aria-label="Outcome metric">
        <div className="mk-metric-visual">
          <span className="mk-sys">OUTCOME METRIC</span>
          <div className="mk-metric-value">14.2x</div>
          <div className="mk-metric-label">
            <strong>accepted edits per dollar</strong>
            <br />
            The conversation shifts from "people are using AI" to "here is where AI is helping us
            ship." Spend per merged PR, wins by workflow, wasted tokens by session.
          </div>
        </div>
        <div className="mk-metric-details">
          <span className="mk-sys">HOW IT JOINS</span>
          <ul className="mk-kv">
            <li>
              <span>Session event</span>
              <span>accepted-edit decision</span>
            </li>
            <li>
              <span>Commit marker</span>
              <span>opt-in AI-assisted trailer</span>
            </li>
            <li>
              <span>Merge validation</span>
              <span>GitHub webhook</span>
            </li>
            <li>
              <span>Revert window</span>
              <span>24h</span>
            </li>
            <li>
              <span>Dedup unit</span>
              <span>session + hunk hash</span>
            </li>
          </ul>
        </div>
      </section>

      {/* AI Leverage Score */}
      <section aria-label="AI Leverage Score">
        <div className="mk-section-header">
          <span className="mk-mono mk-xs">03 / AI Leverage Score</span>
        </div>
        <div className="mk-features">
          <div className="mk-feature">
            <span className="mk-feature-index">EFFECTIVENESS</span>
            <h3>Outcomes, not activity</h3>
            <p>
              Sessions that end in shipped code counted one way. Sessions that burn tokens without a
              result counted another. The score rewards results, not keystrokes.
            </p>
          </div>
          <div className="mk-feature">
            <span className="mk-feature-index">EFFICIENCY</span>
            <h3>Token economy</h3>
            <p>
              How much an engineer ships per dollar of model spend, normalized against peers doing
              similar work. Not a leaderboard — a signal for where workflows compound.
            </p>
          </div>
          <div className="mk-feature">
            <span className="mk-feature-index">ADOPTION</span>
            <h3>Depth of use</h3>
            <p>
              Which agents, which workflows, which repos. Shows leaders where AI is actually part of
              how the team works, and where it's still a tab that gets closed.
            </p>
          </div>
        </div>
      </section>

      {/* Install */}
      <section className="mk-terminal-wrap">
        <span className="mk-sys" style={{ display: "block", marginBottom: 20 }}>
          04 / Install
        </span>
        <div className="mk-terminal">
          <div className="mk-term-comment"># 1. Pull your tenant backend</div>
          <div>
            <span className="mk-term-prompt">$</span>
            <span className="mk-term-cmd">
              curl -fsSL https://get.bematist.dev/compose.yml {">"} docker-compose.yml
            </span>
          </div>
          <div>
            <span className="mk-term-prompt">$</span>
            <span className="mk-term-cmd">docker compose up -d</span>
          </div>
          <br />
          <div className="mk-term-comment"># 2. Install the local collector</div>
          <div>
            <span className="mk-term-prompt">$</span>
            <span className="mk-term-cmd">brew install pella-labs/bematist/bematist</span>
          </div>
          <div>
            <span className="mk-term-prompt">$</span>
            <span className="mk-term-cmd">bematist install --auto-detect</span>
          </div>
          <br />
          <div className="mk-term-comment"># 3. Open the dashboard</div>
          <div>
            <span className="mk-term-prompt">$</span>
            <span className="mk-term-cmd">open http://localhost:9873</span>
          </div>
        </div>
      </section>

      {/* Closing quote */}
      <section className="mk-closing" aria-label="Closing">
        <div className="mk-closing-inner">
          <p className="mk-closing-quote">
            The most expensive system your engineering org has ever bought may be the one you
            understand the least.
          </p>
          <p className="mk-closing-body">
            Bematist is the instrument for measuring it. One open-source platform that makes AI
            spend legible, accountable, and tied to real engineering outcomes. The data was always
            yours. We just made it legible.
          </p>
          <div className="mk-closing-actions">
            <Link href="/card" className="mk-btn mk-btn-primary">
              Grab your card
            </Link>
            <a
              href="https://x.com/bematist_dev"
              className="mk-btn mk-btn-ghost"
              rel="noreferrer"
              target="_blank"
            >
              Follow on X
            </a>
          </div>
        </div>
      </section>

      {/* License */}
      <section className="mk-license">
        <span className="mk-sys">05 / License</span>
        <div className="mk-license-body">
          <strong>Apache 2.0</strong> for the collector, dashboard, adapters, schemas, and CLI.
          <br />
          <strong>BSL 1.1</strong> for the managed-cloud gateway and admin surfaces. Converts to
          Apache 2.0 after four years.
        </div>
      </section>
    </>
  );
}
