import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import BackButton from "@/components/back-button";
import { connectGitlabGroup } from "./actions";

export const dynamic = "force-dynamic";

export default async function GitlabConnectPage({
  params, searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ path?: string; error?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const { groupId } = await params;
  const sp = await searchParams;
  const path = sp.path ?? "";
  const errorMsg = sp.error;

  const tokensUrl = path
    ? `https://gitlab.com/groups/${path}/-/settings/access_tokens`
    : "https://gitlab.com/groups";

  return (
    <main className="max-w-xl mx-auto min-h-[80vh] px-6 pt-12 pb-16">
      <header className="flex items-start gap-4 mb-6">
        <BackButton href="/setup/org/gitlab" />
        <div>
          <h1 className="text-xl font-bold">Paste a Group Access Token</h1>
          <p className="text-sm text-muted-foreground mt-1">
            We use a server-side token (not your personal account) so the connection survives if you leave the org.
          </p>
        </div>
      </header>

      <ol className="text-sm text-muted-foreground space-y-2 mb-6 list-decimal pl-5">
        <li>
          Open{" "}
          <a className="underline text-foreground" href={tokensUrl} target="_blank" rel="noopener noreferrer">
            {path || "the group settings"} → Access tokens
          </a>.
        </li>
        <li>
          Click <strong>Add new token</strong>. Role: <strong>Reporter</strong> or higher.
          Scope: <strong className="text-foreground">read_api</strong>.
        </li>
        <li>Copy the token and paste below. We encrypt it at rest with AES-256-GCM.</li>
      </ol>

      <details className="text-xs text-muted-foreground mb-6 -mt-2 ml-5">
        <summary className="cursor-pointer hover:text-foreground transition">Want one-click invites from Pellametric?</summary>
        <p className="mt-2 max-w-md">
          Add the <strong className="text-foreground">api</strong> scope (full read/write) instead of <code>read_api</code> and we'll
          enable inviting members from this dashboard. With <code>read_api</code> only, you'll see metrics but
          invite members on gitlab.com directly. You can rotate to a wider-scope token any time.
        </p>
      </details>

      {errorMsg && <p className="text-sm text-destructive mb-3">{decodeURIComponent(errorMsg)}</p>}

      <form action={connectGitlabGroup}>
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="path" value={path} />
        <textarea
          name="gat"
          required
          minLength={20}
          rows={3}
          placeholder="glpat-…"
          className="w-full font-mono text-sm bg-card border border-border rounded-md p-3 focus:outline-none focus:border-accent transition"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            className="h-10 px-4 rounded-md bg-accent text-accent-foreground mk-label leading-none hover:opacity-90 transition"
          >
            Connect →
          </button>
          <a
            href="/setup/org/gitlab"
            className="h-10 px-4 rounded-md border border-border text-sm leading-10 hover:border-[color:var(--border-hover)] transition"
          >
            Cancel
          </a>
        </div>
      </form>
    </main>
  );
}
