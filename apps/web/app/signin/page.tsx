import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Sign-in UI now lives in a modal off the marketing surface — this
 * standalone page is retired. Keep the route alive so OAuth callbacks
 * and any lingering bookmarks don't 404, but bounce visitors home.
 * Signed-in users still land on the dashboard, matching the old flow.
 */
export default async function SignInRoute() {
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session?.user ? "/dashboard" : "/");
}
