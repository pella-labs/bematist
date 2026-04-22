"use client";

import { DeckChrome } from "./components/deck-chrome";
import { DeckStage } from "./components/slide-frame";
import { Slide01Anchor } from "./slides/01-anchor";
import { Slide02Itemized } from "./slides/02-itemized";
import { Slide03WhatWeBuilt } from "./slides/03-what-we-built";
import { Slide04DemoSpend } from "./slides/04-demo-spend";
import { Slide05DemoEncryption } from "./slides/05-demo-encryption";
import { Slide06Breath } from "./slides/06-breath";
import { Slide07Verdict } from "./slides/07-verdict";
import { useDeckNav } from "./use-deck-nav";

const SLIDE_LABELS = [
  "Anchor",
  "Itemized",
  "What we built",
  "Demo — Spend",
  "Demo — Encryption",
  "Breath",
  "Verdict",
] as const;

const TOTAL = SLIDE_LABELS.length;

export default function Deck2Page() {
  const nav = useDeckNav(TOTAL);

  const renderSlide = (i: number) => {
    switch (i) {
      case 0:
        return <Slide01Anchor totalPages={TOTAL} />;
      case 1:
        return <Slide02Itemized totalPages={TOTAL} />;
      case 2:
        return <Slide03WhatWeBuilt totalPages={TOTAL} />;
      case 3:
        return <Slide04DemoSpend totalPages={TOTAL} />;
      case 4:
        return <Slide05DemoEncryption totalPages={TOTAL} />;
      case 5:
        return <Slide06Breath totalPages={TOTAL} />;
      case 6:
        return <Slide07Verdict totalPages={TOTAL} />;
      default:
        return null;
    }
  };

  return (
    <div className="deck-root" role="application" aria-roledescription="slide deck">
      <DeckStage slideKey={nav.index}>{renderSlide(nav.index)}</DeckStage>
      <DeckChrome nav={nav} labels={SLIDE_LABELS} />
    </div>
  );
}
