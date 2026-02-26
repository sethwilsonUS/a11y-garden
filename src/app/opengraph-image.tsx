import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "A11y Garden — Nurture a More Accessible Web";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#34d399",
          fontFamily: "sans-serif",
          padding: "60px",
        }}
      >
        {/* Leaf icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#111111"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          width={120}
          height={120}
          style={{ marginBottom: "32px" }}
        >
          <path d="M12 2C6.5 6 4 11 4 15c0 3.5 3.5 6 8 7 4.5-1 8-3.5 8-7 0-4-2.5-9-8-13z" />
          <path d="M12 2v20" />
          <path d="M12 8l-3 3" />
          <path d="M12 8l3 3" />
          <path d="M12 13l-4 3" />
          <path d="M12 13l4 3" />
        </svg>

        {/* Title */}
        <div
          style={{
            fontSize: "72px",
            fontWeight: 700,
            color: "#111111",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            marginBottom: "16px",
          }}
        >
          A11y Garden
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: "32px",
            fontWeight: 400,
            color: "#111111",
            opacity: 0.7,
            letterSpacing: "-0.01em",
          }}
        >
          Nurture a More Accessible Web
        </div>
      </div>
    ),
    { ...size },
  );
}
