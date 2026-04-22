import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./deck2.css";

// Investor-facing pitch deck v2. Unlisted — not in primary nav, excluded from
// SEO via robots metadata. Distribute the URL directly; search engines are
// told to skip it.
export const metadata: Metadata = {
  title: "Pellametric · Pitch Deck v2",
  description:
    "Investor-facing pitch deck v2 for Pellametric — the open-source analytics platform for AI-assisted engineering.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  alternates: { canonical: "/deck2" },
};

export default function Deck2Layout({ children }: { children: ReactNode }) {
  return <div className="pellametric-deck2">{children}</div>;
}
