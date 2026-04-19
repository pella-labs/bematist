"use client";
import { Button } from "@bematist/ui";
import { useState, useTransition } from "react";
import { enqueueHistoryBackfillAction } from "../actions";

/**
 * Client component — wraps the `enqueueHistoryBackfillAction` Server Action.
 *
 * Seeds `queued` rows in `github_history_sync_progress` for every tracked
 * repo on the caller's installation. Idempotent on re-click (ON CONFLICT
 * resets rows to `queued`). Audit-logged server-side.
 */
export function BackfillHistoryButton({ disabled }: { disabled?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || isPending}
        onClick={() => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await enqueueHistoryBackfillAction({ window_days: 90 });
            if (!result.ok) {
              setError(result.error.message);
            } else {
              setMessage(
                `Queued ${result.data.repos_queued} repo${
                  result.data.repos_queued === 1 ? "" : "s"
                } (${result.data.rows_queued} rows). Worker will start the walk shortly.`,
              );
            }
          });
        }}
        className="cursor-pointer disabled:cursor-not-allowed"
      >
        {isPending ? "Enqueueing…" : "Backfill last 90 days"}
      </Button>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
