"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
  const initial = (user.name?.[0] ?? user.email?.[0] ?? "?").toUpperCase();

  return (
    <div ref={ref} className="fixed top-3 right-3 sm:top-4 sm:right-4 z-50">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-background/80 backdrop-blur px-1 py-1 hover:border-[color:var(--border-hover)] transition shadow-sm"
      >
        {user.image ? (
          <img
            src={user.image}
            alt=""
            className="size-8 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="size-8 rounded-full bg-card border border-border flex items-center justify-center text-xs font-semibold">
            {initial}
          </span>
        )}
        <span className="mk-label hidden sm:inline pr-2 max-w-[10rem] truncate">
          {user.name?.split(" ")[0] ?? user.email}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 origin-top-right border border-border bg-background shadow-lg rounded-md overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border">
            <div className="text-sm font-medium truncate">{user.name ?? "Account"}</div>
            {user.email && (
              <div className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</div>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/"; } } })}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-card transition"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
