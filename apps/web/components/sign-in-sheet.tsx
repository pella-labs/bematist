"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { signIn } from "@/lib/auth-client";

type SheetContext = {
  open: () => void;
  close: () => void;
};

const Ctx = createContext<SheetContext | null>(null);

export function useSignInSheet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSignInSheet must be used inside <SignInSheetProvider>");
  return ctx;
}

export function SignInSheetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      <SignInSheet isOpen={isOpen} onClose={close} />
    </Ctx.Provider>
  );
}

function SignInSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    buttonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await signIn.social({ provider: "github", callbackURL: "/dashboard" });
    } catch {
      setLoading(false);
    }
  };

  return (
    <div
      className="mk-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mk-sheet-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className="mk-sheet-panel">
        <button
          type="button"
          className="mk-sheet-close"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
        <div className="mk-sheet-eyebrow mk-sys">pellametric</div>
        <h2 id="mk-sheet-title" className="mk-sheet-title">
          Sign in with GitHub
        </h2>
        <p className="mk-sheet-body">
          We use GitHub to scope data to your orgs. No passwords, no email lists.
        </p>
        <button
          ref={buttonRef}
          type="button"
          onClick={handleSignIn}
          disabled={loading}
          className="mk-btn mk-btn-primary mk-sheet-cta"
        >
          {loading ? <SpinnerIcon /> : <GithubIcon />}
          {loading ? "Redirecting…" : "Continue with GitHub"}
        </button>
        <p className="mk-sheet-scope">
          Requests <code>read:org</code> and <code>repo</code> — read-only, revocable in GitHub
          settings.
        </p>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.42c.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.38-3.88-1.38-.52-1.33-1.28-1.68-1.28-1.68-1.04-.72.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.2.68.8.56A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" style={{ animation: "mk-sheet-spin 0.7s linear infinite" }}>
      <path d="M12 3 A 9 9 0 0 1 21 12" />
    </svg>
  );
}
