"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "@/lib/auth-client";

const AUTHED_PREFIXES = ["/dashboard", "/org", "/setup", "/onboarding"];

export default function UserMenu() {
  const pathname = usePathname() ?? "";
  const { data, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onAuthedRoute = AUTHED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"));
  if (!onAuthedRoute) return null;
  if (isPending || !data?.user) return null;

  const user = data.user;
  const displayName = user.name?.split(" ")[0] ?? user.email ?? "Account";
  const initial = (user.name?.[0] ?? user.email?.[0] ?? "?").toUpperCase();

  return (
    <div ref={ref} className="fixed top-3 right-3 sm:top-4 sm:right-4 z-50">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className={`group flex items-center gap-2 rounded-full border bg-background/70 backdrop-blur pl-1 pr-1 sm:pr-3 py-1 transition shadow-sm ${
          open
            ? "border-accent/60 bg-card/90"
            : "border-border hover:border-[color:var(--border-hover)] hover:bg-card/80"
        }`}
      >
        {user.image ? (
          <img
            src={user.image}
            alt=""
            className="size-7 rounded-full object-cover ring-1 ring-border group-hover:ring-accent/40 transition"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="size-7 rounded-full bg-accent/10 ring-1 ring-accent/30 flex items-center justify-center text-xs font-semibold text-accent">
            {initial}
          </span>
        )}
        <span className="mk-label hidden sm:inline max-w-[10rem] truncate text-foreground/90 group-hover:text-foreground transition">
          {displayName}
        </span>
        <svg
          className={`hidden sm:block w-3 h-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 origin-top-right border border-border bg-background/95 backdrop-blur shadow-xl rounded-lg overflow-hidden animate-[fadeIn_120ms_ease-out]"
        >
          <div className="px-4 py-3 flex items-center gap-3 border-b border-border bg-card/50">
            {user.image ? (
              <img
                src={user.image}
                alt=""
                className="size-10 rounded-full object-cover ring-1 ring-border shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="size-10 rounded-full bg-accent/10 ring-1 ring-accent/30 flex items-center justify-center text-sm font-semibold text-accent shrink-0">
                {initial}
              </span>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{user.name ?? "Account"}</div>
              {user.email && (
                <div className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</div>
              )}
            </div>
          </div>
          <div className="py-1">
            <Link
              role="menuitem"
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-card transition"
            >
              <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 8L8 2.5L14 8M3.5 7v6h9V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Dashboard</span>
            </Link>
            <Link
              role="menuitem"
              href="/setup/collector"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-card transition"
            >
              <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 2v3M8 11v3M3.05 4.05l2.12 2.12M10.83 9.83l2.12 2.12M2 8h3M11 8h3M3.05 11.95l2.12-2.12M10.83 6.17l2.12-2.12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span>Collector</span>
            </Link>
          </div>
          <div className="border-t border-border py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/"; } } })}
              className="w-full text-left px-4 py-2 text-sm hover:bg-card transition flex items-center gap-2.5 text-foreground/90"
            >
              <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M6.5 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3.5M10 11l3-3-3-3M13 8H6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
