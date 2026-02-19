import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isLocalMode = process.env.NEXT_PUBLIC_LOCAL_MODE === "true";

const isPublicRoute = createRouteMatcher([
  "/",
  "/scan",
  "/results/(.*)",
  "/database",
  "/demo",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  // In local mode, redirect root to the demo page and skip all auth.
  if (isLocalMode) {
    if (request.nextUrl.pathname === "/") {
      return NextResponse.redirect(new URL("/demo", request.url));
    }
    return;
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
