"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { WINDOWS, type WindowKey } from "@/lib/window";

export default function WindowPicker({ current }: { current: WindowKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function set(k: WindowKey) {
    const q = new URLSearchParams(sp.toString());
    q.set("window", k);
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-md border border-border bg-card">
      {WINDOWS.map(w => (
        <button
          key={w.key}
          onClick={() => set(w.key)}
          className={`px-3 py-1 rounded text-[11px] font-mono font-semibold transition ${current === w.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}
