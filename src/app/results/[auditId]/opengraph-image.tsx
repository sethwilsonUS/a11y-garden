import { ImageResponse } from "next/og";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// Dynamic OG image for results pages.
//
// Generates a 1200×630 branded card that shows:
//  - A11y Garden branding
//  - "Accessibility Report" heading
//  - The site title / domain
//  - Issue count (tasteful, no grade to avoid public shaming)
//  - A small screenshot thumbnail when available
//
// Next.js automatically wires this into <meta property="og:image" />
// via the opengraph-image.tsx file convention.
// ---------------------------------------------------------------------------

export const alt = "Accessibility Report — A11y Garden";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

export default async function Image({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;

  let siteTitle = "Unknown Site";
  let domain = "";
  let issueCount = 0;
  let screenshotUrl: string | null = null;

  if (CONVEX_URL) {
    try {
      const client = new ConvexHttpClient(CONVEX_URL);
      const audit = await client.query(api.audits.getAudit, {
        auditId: auditId as Id<"audits">,
      });

      if (audit) {
        siteTitle = audit.pageTitle || audit.domain;
        domain = audit.domain;
        issueCount = audit.violations.total;

        // Fetch screenshot URL if one was captured
        if (audit.screenshotId) {
          try {
            screenshotUrl = await client.query(
              api.audits.getScreenshotUrl,
              { auditId: auditId as Id<"audits"> },
            );
          } catch {
            // Screenshot fetch failed — continue without it
          }
        }
      }
    } catch {
      // Convex unavailable — render with defaults
    }
  }

  // Truncate very long page titles so they don't overflow the card
  if (siteTitle.length > 60) {
    siteTitle = siteTitle.slice(0, 57) + "…";
  }

  const showDomainSeparately = domain && siteTitle !== domain;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(145deg, #171717 0%, #1a2420 50%, #171717 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* ── Top accent bar ── */}
        <div
          style={{
            width: "100%",
            height: "4px",
            background:
              "linear-gradient(90deg, #059669 0%, #34d399 50%, #059669 100%)",
            flexShrink: 0,
          }}
        />

        {/* ── Content area ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "48px 56px 32px",
          }}
        >
          {/* Branding */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "36px",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                backgroundColor: "rgba(5, 150, 105, 0.2)",
                border: "1px solid rgba(52, 211, 153, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
              }}
            >
              🌱
            </div>
            <span
              style={{
                color: "#34d399",
                fontSize: "22px",
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              A11y Garden
            </span>
          </div>

          {/* ── Main content row ── */}
          <div style={{ display: "flex", flex: 1, gap: "48px" }}>
            {/* Left column — text */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  color: "#f0ede6",
                  fontSize: "52px",
                  fontWeight: 700,
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                  marginBottom: "20px",
                }}
              >
                Accessibility Report
              </div>

              <div
                style={{
                  color: "#a8b89e",
                  fontSize: "30px",
                  fontWeight: 500,
                  lineHeight: 1.3,
                  marginBottom: showDomainSeparately ? "6px" : "20px",
                }}
              >
                {siteTitle}
              </div>

              {showDomainSeparately && (
                <div
                  style={{
                    color: "#909f86",
                    fontSize: "20px",
                    marginBottom: "20px",
                  }}
                >
                  {domain}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#909f86",
                  fontSize: "20px",
                }}
              >
                {issueCount > 0
                  ? `${issueCount} accessibility issue${issueCount !== 1 ? "s" : ""} found`
                  : "No accessibility issues found"}
              </div>
            </div>

            {/* Right column — screenshot thumbnail */}
            {screenshotUrl && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  width: "380px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    borderRadius: "12px",
                    border: "2px solid #2f2f2f",
                    overflow: "hidden",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshotUrl}
                    width={376}
                    height={260}
                    alt=""
                    style={{ objectFit: "cover" }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: "16px",
              marginTop: "12px",
            }}
          >
            <span style={{ color: "#909f86", fontSize: "16px" }}>
              a11ygarden.org
            </span>
            <span style={{ color: "#516247", fontSize: "16px" }}>
              Nurture a More Accessible Web
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
