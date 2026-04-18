"use client";

import { useEffect, useState } from "react";
import { CardPage } from "./CardPage";
import type { CardData } from "./card-utils";

/**
 * Client-only mount wrapper. CardPage reads browser-only globals during
 * render, so we suppress the server render. Pre-hydration we return null
 * — the card itself handles its own intro animation once data is ready.
 */
export function CardMount({ demoData }: { demoData?: CardData } = {}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <CardPage demoData={demoData} />;
}
