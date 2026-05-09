"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectOrg } from "@/app/org/[provider]/[slug]/actions";

type Provider = "github" | "gitlab";

export default function DisconnectOrgModal({
  provider, slug, orgName,
}: {
  provider: Provider;
  slug: string;
  orgName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"confirm" | "done" | "error">("confirm");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stage !== "done") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, stage]);

  function close() {
    if (stage === "done") return; // can't close after disconnect — reload
    setOpen(false);
    setStage("confirm");
    setErrorMsg(null);
  }

  function confirm() {
    startTransition(async () => {
      const res = await disconnectOrg({ provider, slug });
      if (res.ok) {
        setStage("done");
      } else {
        setStage("error");
        setErrorMsg(res.error);
      }
    });
  }

  function reconnect() {
    if (provider === "gitlab") {
      router.push("/setup/org/gitlab/oauth");
    } else {
      router.push("/setup/org");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mk-label border border-border px-3 py-2 text-muted-foreground hover:border-destructive hover:text-destructive transition"
        title={`Disconnect ${orgName} from Pellametric`}
      >
        Disconnect →
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/55"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="disconnect-modal-title"
        >
          <div className="bg-card border border-border rounded-md shadow-2xl w-[min(440px,92vw)] p-5">
            {stage === "confirm" && (
              <>
                <h2 id="disconnect-modal-title" className="text-base font-semibold leading-snug">
                  Disconnect {orgName}?
                </h2>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  This removes the {provider === "gitlab" ? "GitLab" : "GitHub"} credentials, all
                  members, invitations, and ingested session data for this org from Pellametric.
                  You can reconnect at any time — historical sessions will be re-uploaded by your
                  collector on the next run.
                </p>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    onClick={close}
                    disabled={isPending}
                    className="text-xs h-8 px-3 rounded-md border border-border text-foreground hover:border-accent transition leading-none disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirm}
                    disabled={isPending}
                    className="text-xs h-8 px-3 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition leading-none disabled:opacity-50"
                  >
                    {isPending ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              </>
            )}

            {stage === "done" && (
              <>
                <h2 id="disconnect-modal-title" className="text-base font-semibold leading-snug">
                  Disconnected
                </h2>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  {orgName} is no longer connected to Pellametric. Reconnect to set it back up
                  with fresh credentials, or head back to the dashboard.
                </p>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="text-xs h-8 px-3 rounded-md border border-border text-foreground hover:border-accent transition leading-none"
                  >
                    Back to dashboard
                  </button>
                  <button
                    onClick={reconnect}
                    className="text-xs h-8 px-3 rounded-md bg-accent text-accent-foreground hover:opacity-90 transition leading-none"
                  >
                    Reconnect →
                  </button>
                </div>
              </>
            )}

            {stage === "error" && (
              <>
                <h2 id="disconnect-modal-title" className="text-base font-semibold leading-snug">
                  Couldn't disconnect
                </h2>
                <p className="text-xs text-destructive mt-2 leading-relaxed">{errorMsg}</p>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    onClick={close}
                    className="text-xs h-8 px-3 rounded-md border border-border text-foreground hover:border-accent transition leading-none"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
