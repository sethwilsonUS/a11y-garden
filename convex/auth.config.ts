import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Clerk JWT issuer domain — set CLERK_JWT_ISSUER_DOMAIN in the
      // Convex dashboard (Settings → Environment Variables).
      // Value: your Clerk Frontend API URL, e.g.
      //   Dev:  https://verb-noun-00.clerk.accounts.dev
      //   Prod: https://clerk.yourdomain.com
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
