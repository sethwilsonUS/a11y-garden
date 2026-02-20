import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { parseResultsSegments } from "@/lib/urls";

// ---------------------------------------------------------------------------
// Dynamic OG metadata for results pages.
//
// This server-side layout fetches audit data from Convex and sets the
// page title, description, and OG/Twitter tags so that link-sharing
// previews show "Accessibility Report for [Site Title]" instead of
// the generic site title.
//
// The OG image is served by the API route at /api/og/[auditId] and
// referenced explicitly via openGraph.images below (the file-convention
// opengraph-image.tsx doesn't work inside catch-all routes).
// ---------------------------------------------------------------------------

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}): Promise<Metadata> {
  const { segments } = await params;
  const { auditId } = parseResultsSegments(segments);

  if (!CONVEX_URL) {
    return { title: "Accessibility Report | A11y Garden" };
  }

  try {
    const client = new ConvexHttpClient(CONVEX_URL);
    const audit = await client.query(api.audits.getAudit, {
      auditId: auditId as Id<"audits">,
    });

    if (!audit || audit.status === "error") {
      return { title: "Accessibility Report | A11y Garden" };
    }

    const siteTitle = audit.pageTitle || audit.domain;
    const title = `Accessibility Report for ${siteTitle}`;
    const issueWord = audit.violations.total === 1 ? "issue" : "issues";

    const description =
      audit.status === "complete"
        ? `Scanned ${audit.domain} and found ${audit.violations.total} accessibility ${issueWord}. View the full report on A11y Garden.`
        : `Accessibility scan for ${audit.domain} in progress. View results on A11y Garden.`;

    const ogImageUrl = `/api/og/${auditId}`;

    return {
      title: `${title} | A11y Garden`,
      description,
      openGraph: {
        title,
        description,
        type: "article",
        siteName: "A11y Garden",
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: `Accessibility Report for ${siteTitle} — A11y Garden`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImageUrl],
      },
    };
  } catch {
    return { title: "Accessibility Report | A11y Garden" };
  }
}

export default function ResultsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
