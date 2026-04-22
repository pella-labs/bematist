"use client";

import { DeckChrome } from "./components/deck-chrome";
import { DeckStage } from "./components/slide-frame";
import { Slide01Cover } from "./slides/01-cover";
import { Slide04BlackBox } from "./slides/04-black-box";
import { Slide04Demo } from "./slides/04-demo";
import { Slide05ClosingCta } from "./slides/05-closing-cta";
import { useDeckNav } from "./use-deck-nav";

// Four-slide pitch cut: cover -> problem+solution (black box) -> demo -> closing.
// All other slide files remain in the slides/ dir for reference but are no
// longer rendered.
const SLIDE_LABELS = ["Cover", "Problem", "Demo", "Call to Action"] as const;

const TOTAL = SLIDE_LABELS.length;

export default function DeckPage() {
  const nav = useDeckNav(TOTAL);

  const renderSlide = (i: number, _active: boolean) => {
    switch (i) {
      case 0:
        return <Slide01Cover totalPages={TOTAL} />;
      case 1:
        return <Slide04BlackBox totalPages={TOTAL} />;
      case 2:
        return <Slide04Demo totalPages={TOTAL} />;
      case 3:
        return <Slide05ClosingCta totalPages={TOTAL} />;
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
