"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getProvider, ProviderError } from "@/lib/providers";
import { SlugOverlapError } from "@/lib/orgs/validate-slug";

export async function connectGitlabGroup(formData: FormData): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/");
  }

  const groupId = String(formData.get("groupId") ?? "");
  const path = String(formData.get("path") ?? "");
  const gat = String(formData.get("gat") ?? "").trim();

  if (!groupId || !gat) {
    redirect(`/setup/org/gitlab/${groupId}/connect?path=${encodeURIComponent(path)}&error=${encodeURIComponent("Missing group or token")}`);
  }

  let orgId: string;
  try {
    const result = await getProvider("gitlab").connectOrg({
      userId: session!.user.id,
      externalId: groupId,
      credential: gat,
    });
    orgId = result.orgId;
  } catch (e) {
    let msg = "Couldn't connect this group.";
    if (e instanceof SlugOverlapError) {
      msg = `This group's path overlaps an existing org "${e.conflictingSlug}". Pick a different group or remove the overlap.`;
    } else if (e instanceof ProviderError) {
      msg = e.code === "permission_denied"
        ? "Token doesn't have permission for this group. Use a Maintainer-role token with the api scope."
        : e.code === "expired_credential"
          ? "Token rejected by GitLab (401). Generate a fresh GAT and try again."
          : `GitLab error: ${e.code}`;
    } else if (e instanceof Error) {
      msg = e.message;
    }
    redirect(`/setup/org/gitlab/${groupId}/connect?path=${encodeURIComponent(path)}&error=${encodeURIComponent(msg)}`);
  }

  // Look up the slug we just inserted, so we can redirect to /org/<slug>.
  const [row] = await db
    .select({ slug: schema.org.slug })
    .from(schema.org)
    .where(eq(schema.org.id, orgId))
    .limit(1);
  redirect(`/org/${encodeURIComponent(row!.slug)}`);
}
