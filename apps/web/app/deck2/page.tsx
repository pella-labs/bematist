"use client";

import { DeckChrome } from "./components/deck-chrome";
import { DeckStage } from "./components/slide-frame";
import { SlidePlaceholder } from "./slides/placeholder";
import { useDeckNav } from "./use-deck-nav";

// /deck2 scaffold — single placeholder slide until the narrative lands.
const SLIDE_LABELS = ["Placeholder"] as const;

const TOTAL = SLIDE_LABELS.length;

export default function Deck2Page() {
  const nav = useDeckNav(TOTAL);

  const renderSlide = (i: number, _active: boolean) => {
    switch (i) {
      case 0:
        return <SlidePlaceholder totalPages={TOTAL} />;
      default:
        return null;
    }
  };

  return (
    <div className="deck-root" role="application" aria-roledescription="slide deck">
      <DeckStage slideKey={nav.index}>{renderSlide(nav.index, true)}</DeckStage>
      <DeckChrome nav={nav} labels={SLIDE_LABELS} />
    </div>
  );
}
