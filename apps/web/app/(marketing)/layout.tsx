import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/home", label: "Product" },
  { href: "/home#pricing", label: "Pricing" },
  { href: "/home#docs", label: "Docs" },
  { href: "/privacy", label: "Bill of Rights" },
];

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/home" className="flex items-center gap-2">
            <span className="inline-block h-6 w-6 rounded-md bg-primary" aria-hidden />
            <span className="text-sm font-semibold tracking-tight">Bematist</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/"
              className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Bematist · Apache 2.0 + BSL 1.1</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="cursor-pointer hover:text-foreground">
              Bill of Rights
            </Link>
            <a
              href="https://github.com/pella-labs/bematist"
              className="cursor-pointer hover:text-foreground"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
