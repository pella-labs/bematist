import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "./db";
import { eq } from "drizzle-orm";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: ["write:org", "repo", "read:user", "user:email"],
      // Stash GitHub login + id on our user row
      mapProfileToUser: (profile: any) => ({
        githubLogin: profile.login,
        githubId: String(profile.id),
      }),
    },
    gitlab: {
      clientId: process.env.GITLAB_CLIENT_ID!,
      clientSecret: process.env.GITLAB_CLIENT_SECRET!,
      scope: ["read_user", "read_api"],
      mapProfileToUser: (profile: any) => ({
        gitlabUsername: profile.username,
        gitlabId: String(profile.id),
      }),
    },
  },
  user: {
    additionalFields: {
      githubLogin: { type: "string", required: false },
      githubId: { type: "string", required: false },
      gitlabUsername: { type: "string", required: false },
      gitlabId: { type: "string", required: false },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "gitlab"],
    },
  },
  databaseHooks: {
    account: {
      create: {
        after: async (account) => {
          if (!account.accessToken || !account.userId) return;
          try {
            if (account.providerId === "github") {
              const r = await fetch("https://api.github.com/user", {
                headers: {
                  Authorization: `Bearer ${account.accessToken}`,
                  Accept: "application/vnd.github+json",
                },
                cache: "no-store",
              });
              if (!r.ok) return;
              const profile = await r.json();
              await db.update(schema.user).set({
                githubLogin: profile.login,
                githubId: String(profile.id),
              }).where(eq(schema.user.id, account.userId));
            } else if (account.providerId === "gitlab") {
              const r = await fetch("https://gitlab.com/api/v4/user", {
                headers: { Authorization: `Bearer ${account.accessToken}` },
                cache: "no-store",
              });
              if (!r.ok) return;
              const profile = await r.json();
              await db.update(schema.user).set({
                gitlabUsername: profile.username,
                gitlabId: String(profile.id),
              }).where(eq(schema.user.id, account.userId));
            }
          } catch {
            // Don't block sign-in if profile sync fails — convenience cols are best-effort.
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;
