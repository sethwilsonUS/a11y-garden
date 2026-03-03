# A11y Garden

> Understand your site's accessibility — and how to improve it.

[![WCAG 2.2](https://img.shields.io/badge/WCAG-2.2-10b981?style=flat-square)](https://www.w3.org/WAI/standards-guidelines/wcag/)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?style=flat-square)](https://nextjs.org/)
[![Convex](https://img.shields.io/badge/Convex-Backend-8b5cf6?style=flat-square)](https://convex.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

---

## Purpose

A friendly accessibility audit tool that provides AI insights and specific, actionable advice.

---

## Features

- 🔍 **Automated Accessibility Scanning** — Uses axe-core to test websites against WCAG 2.2 guidelines
- 📱 **Dual Viewport Scanning** — Scans at both desktop (1920x1080) and mobile (390x844) viewports in parallel, with separate results for each
- 🤖 **AI-Powered Insights** — GPT-4.1 Mini translates technical violations into plain English, with separate analysis per viewport
- 📊 **Letter Grade System** — Per-viewport grades plus a combined weighted grade (60% desktop + 40% mobile)
- 🧩 **Platform & Framework Detection** — Detects CMS platforms (WordPress, Shopify, Squarespace, etc.) and frontend frameworks (Next.js, React, Angular, Svelte, etc.) with confidence levels, providing platform-specific fix advice
- 🗄️ **Community Database** — Browse and search accessibility audits shared by other users
- 👤 **User Accounts** — Save and manage your audit history with Clerk authentication
- ⚡ **Real-time Updates** — Live status updates as scans progress
- 🌗 **Light/Dark Themes** — Modern, accessible interface built with Tailwind CSS v4
- 🤖 **AI Agent Fix Plans** — Generate downloadable AGENTS.md fix-plan files from audit results, ready to drop into Cursor, Codex, Claude Code, or GitHub Copilot (developer framework sites only)
- 📋 **Export Reports** — Copy markdown reports including both desktop and mobile results
- 🛡️ **Rate Limiting & Concurrency** — Per-IP sliding window (5 scans/hour) and global concurrency cap via Upstash Redis
- 🔒 **SSRF Protection** — URL validation blocks private IP ranges and non-HTTP schemes in production
- 📸 **Page Screenshots** — Captures JPEG screenshots at both viewports so users can verify the scanner reached the real site
- 🧱 **WAF / Bot-Block Detection** — Detects when a site's firewall blocks the scanner and warns the user instead of returning misleading results
- 🔄 **Safe Mode Fallback** — Automatically retries with a reduced rule set when complex sites crash the full axe-core scan
- 🚨 **Error Boundary** — Global React error boundary catches rendering crashes with a friendly recovery UI
- ⚙️ **Graceful Degradation** — Runs without env vars for local demos; a banner warns which features are disabled
- 💻 **CLI Tool** — Scan sites from your terminal with `a11ygarden <url>`, dual-viewport by default with a `--desktop-only` flag

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/home.png" alt="A11y Garden home page — enter a URL to scan" width="720" />
</p>

<p align="center">
  <img src="docs/screenshots/result.png" alt="Audit results page showing letter grade, issue breakdown, AI summary, and prioritized recommendations" width="720" />
</p>

<p align="center">
  <img src="docs/screenshots/database.png" alt="Community Garden — browse and search public accessibility audits" width="720" />
</p>

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) |
| **Backend** | [Convex](https://convex.dev/) (serverless functions & real-time database) |
| **Authentication** | [Clerk](https://clerk.com/) |
| **Scanning Engine** | [Playwright](https://playwright.dev/) + [axe-core](https://github.com/dequelabs/axe-core) |
| **AI Analysis** | [OpenAI GPT-4.1 Mini](https://openai.com/) |
| **Rate Limiting** | [Upstash Redis](https://upstash.com/) (sliding window + concurrency) |
| **Fonts** | Fraunces, DM Sans, JetBrains Mono |

---

## Quick Start

```bash
git clone https://github.com/sethwilsonUS/a11y-garden.git
cd a11y-garden
npm install
npx playwright install chromium
npm run local
```

Open **http://localhost:3000** and start scanning. That's it — no accounts, no API keys, no external services.

### Optional: Add AI Summaries

Add an [OpenAI key](https://platform.openai.com/api-keys) to unlock AI-powered analysis:

```bash
echo "OPENAI_API_KEY=sk-..." >> .env.local
# Then restart: npm run local
```

This is the same key the [CLI](#cli-usage) uses. When it's missing, AI features are silently skipped.

### Want the Full Web Experience?

For saved audits, user accounts, the community database, and AI via Convex — see [Full Development Setup](#full-development-setup) below.

---

## CLI Usage

Scan websites from your terminal — no Convex, Clerk, or browser required. Just Playwright + axe-core (and optionally OpenAI for AI summaries).

### Quick Start

```bash
# From the project root (after npm install + npx playwright install chromium)
npm run cli -- example.com
```

### Examples

```bash
# Basic scan — scans desktop + mobile viewports in parallel
npm run cli -- walmart.com

# Desktop-only scan (skip mobile viewport)
npm run cli -- walmart.com --desktop-only

# Export a markdown report to a file
npm run cli -- walmart.com --markdown > walmart-a11y.md

# Output raw JSON (useful for piping to jq)
npm run cli -- walmart.com --json

# Skip AI summary even when OPENAI_API_KEY is set
npm run cli -- walmart.com --no-ai

# Save screenshots of the scanned page (desktop + mobile)
npm run cli -- walmart.com --screenshot

# Save screenshot to a custom path
npm run cli -- walmart.com --screenshot walmart-screenshot.jpg

# Scan your local dev server
npm run cli -- localhost:3000

# Force local Playwright even when BROWSERLESS_URL is set
npm run cli -- walmart.com --local
```

### Using as a Command

You can also link the package to use `a11ygarden` as a global command:

```bash
npm link
a11ygarden walmart.com
a11ygarden walmart.com --markdown > report.md
```

### Options

| Flag | Description |
|------|-------------|
| `--desktop-only` | Skip mobile viewport scan (desktop only) |
| `--markdown` | Output a markdown report instead of the default terminal format |
| `--json` | Output raw JSON (includes separate `desktop` and `mobile` objects) |
| `--no-ai` | Skip AI summary even when `OPENAI_API_KEY` is set |
| `--screenshot [path]` | Save JPEG screenshots (desktop + `screenshot-mobile.jpg` for dual scans) |
| `--local` | Force local Playwright even when `BROWSERLESS_URL` is set |
| `-V, --version` | Show version number |
| `-h, --help` | Show help |

### Environment Variables (CLI)

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `OPENAI_API_KEY` | No — AI silently skips when missing | Powers AI summaries and recommendations |
| `BROWSERLESS_URL` | No — falls back to local Playwright | Use a remote browser (e.g. Docker Browserless) for parity with the web UI |
| `BROWSERLESS_TOKEN` | No — only needed if your Browserless instance requires auth | Appended to the WebSocket URL as `?token=` |

The CLI automatically loads `.env.local`, so if `BROWSERLESS_URL` is set (e.g. from `dev:browserless`), the CLI uses the same Docker browser as the web UI. Use `--local` to force local Playwright. AI analysis runs automatically when `OPENAI_API_KEY` is in your environment and degrades silently when it isn't.

---

## Scanning Your Local Dev Server

A11y Garden is designed to scan sites you're actively building. Here's how to test your own `localhost` during development.

### Option A: CLI (Simplest)

The CLI runs a local Playwright browser that can reach your dev server directly — no Docker needed.

```bash
# Start your project's dev server (e.g. on port 3000)
# Then, from the a11y-garden directory:
npm run cli -- localhost:3000

# With a screenshot for visual verification
npm run cli -- localhost:3000 --screenshot

# Export a markdown report
npm run cli -- localhost:3000 --markdown > my-app-a11y.md
```

The CLI automatically uses `http://` for localhost URLs (no TLS).

### Option B: Web UI + Browserless (Full Experience)

To scan localhost from the web UI, you need the Browserless Docker container. Without it, the Next.js dev server deadlocks when asked to scan its own origin.

```bash
# Start Docker Browserless + the full dev stack in one command
npm run dev:browserless
```

This starts a Browserless Chromium container and sets `BROWSERLESS_URL` automatically. The scanner rewrites `localhost` URLs to `host.docker.internal` so the Docker container can reach your host machine.

> **Note:** Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/). On Linux, the `--add-host=host.docker.internal:host-gateway` flag is included automatically in the npm script.

### Parity Between CLI and Web UI

When `BROWSERLESS_URL` is set in `.env.local` (which `dev:browserless` does), the CLI uses the same Docker browser as the web UI. This ensures identical scan results between both flows. Use `--local` to force the CLI to use its own local Playwright instead:

```bash
# Uses Browserless (same as web UI)
npm run cli -- walmart.com

# Forces local Playwright
npm run cli -- walmart.com --local
```

---

## Full Development Setup

Working on the full web app with saved audits, user accounts, community database, and AI? You'll need accounts for [Convex](https://convex.dev), [Clerk](https://clerk.com), and [OpenAI](https://openai.com).

### Prerequisites

- Node.js 18+
- Accounts for: [Convex](https://convex.dev), [Clerk](https://clerk.com), [OpenAI](https://openai.com)

### Installation

1. **Clone and install**
   ```bash
   git clone https://github.com/sethwilsonUS/a11y-garden.git
   cd a11y-garden
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp env.example .env.local
   ```
   
   Fill in your API keys (see [Environment Variables](#environment-variables) below).

3. **Initialize Convex**
   ```bash
   npx convex dev
   ```
   
   This creates your Convex project and deploys the schema. Keep this running.

4. **Add OpenAI key to Convex**
   
   In the [Convex dashboard](https://dashboard.convex.dev), go to **Settings → Environment Variables** and add:
   - `OPENAI_API_KEY` — Your OpenAI API key

5. **Install Playwright browser**
   ```bash
   npx playwright install chromium
   ```

6. **Start development**
   ```bash
   # In a new terminal (keep Convex running)
   npm run dev
   ```

7. Open **http://localhost:3000**

---

## Environment Variables

Copy `env.example` to `.env.local` and fill in the values:

```bash
# Clerk Authentication (https://dashboard.clerk.com)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Convex (https://dashboard.convex.dev)
CONVEX_DEPLOYMENT=dev:your-deployment-name
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# OpenAI (optional — used by the CLI and local mode for AI summaries)
# The full web app reads OPENAI_API_KEY from the Convex dashboard instead.
# OPENAI_API_KEY=sk-...

# Upstash Redis — rate limiting & concurrency (https://console.upstash.com)
# Optional in dev (rate limiting is disabled without these).
# Required in production to prevent abuse.
# UPSTASH_REDIS_REST_URL=https://...upstash.io
# UPSTASH_REDIS_REST_TOKEN=...

# Force-enable rate limiting in local dev (for testing):
# RATE_LIMIT_ENABLED=true

# OPTIONAL: Browserless
# In production (Vercel), required for scanning (Playwright can't run in serverless).
# In local dev, set automatically by `npm run dev:browserless` for scanning localhost.
# The CLI also picks these up for parity with the web UI (use --local to skip).
# BROWSERLESS_TOKEN=your-token
# BROWSERLESS_URL=ws://localhost:3001  (local Docker) or wss://custom-endpoint (cloud)
```

**Convex dashboard variables** (add these in the [Convex dashboard](https://dashboard.convex.dev) under Settings → Environment Variables, **not** in `.env.local`):

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Powers AI summaries and recommendations |
| `CLERK_JWT_ISSUER_DOMAIN` | Your Clerk Frontend API URL for server-side auth |

### What happens when variables are missing?

The app is designed to degrade gracefully rather than crash:

| Variable | Missing in dev | Missing in production |
|----------|---------------|----------------------|
| `NEXT_PUBLIC_CONVEX_URL` | App runs without Convex/Clerk — `/demo` still works. A banner warns unless running in local mode (`npm run local`). | Same behavior; auth and database features are unavailable. |
| `BROWSERLESS_TOKEN`/`URL` | Not needed — Playwright launches a local browser. Set by `dev:browserless` for localhost scanning from the web UI. | Scan API returns a 500 with a descriptive error message. |
| `OPENAI_API_KEY` (Convex) | AI summary/recommendations are skipped with a clear error logged. | Same — scans work, but AI analysis fails gracefully. |
| `OPENAI_API_KEY` (.env.local) | CLI and local mode skip AI summary when missing. | N/A (CLI / local mode only). |
| `UPSTASH_REDIS_REST_URL/TOKEN` | Rate limiting disabled — all scans allowed. | **Required** — prevents abuse via per-IP rate limits and concurrency caps. |
| `RATE_LIMIT_ENABLED` | Rate limiting stays off (default). Set to `true` to test locally. | Not needed — rate limiting is always on when Upstash vars are present. |

---

## Project Structure

```
├── cli/                       # CLI tool
│   ├── index.ts              # CLI entry point (dual-viewport + --desktop-only)
│   └── bin.mjs               # Bin wrapper for npm link / npx
├── convex/                    # Convex backend
│   ├── schema.ts             # Database schema (desktop + mobile fields)
│   ├── audits.ts             # Audit queries & mutations (incl. mobile)
│   ├── ai.ts                 # OpenAI integration (parallel desktop/mobile)
│   ├── agentPlan.ts           # AGENTS.md fix-plan generation action
│   ├── auth.config.ts        # Clerk ↔ Convex auth config
│   └── lib/
│       ├── grading.ts        # Grading algorithm + combined grade
│       ├── groupViolations.ts # Violation grouping & normalization
│       └── buildAgentPlanPrompt.ts # Prompt builder for agent plans
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── page.tsx          # Home page
│   │   ├── providers.tsx     # Convex/Clerk providers (conditional)
│   │   ├── demo/             # Demo mode (no auth required)
│   │   ├── results/          # Results pages (tabbed desktop/mobile)
│   │   ├── database/         # Community audit database
│   │   ├── dashboard/        # User dashboard (auth required)
│   │   ├── sign-in/          # Clerk sign-in page
│   │   ├── sign-up/          # Clerk sign-up page
│   │   └── api/
│   │       ├── scan/          # Scan API (dual-viewport via scanUrlDual)
│   │       └── ai-summary/    # AI summary API (local mode + demo)
│   ├── components/
│   │   ├── AgentPlanButton.tsx     # Generate/view AGENTS.md fix plans (owner-only)
│   │   ├── AgentPlanViewer.tsx    # Modal viewer for rendered fix plan markdown
│   │   ├── ButtonCard.tsx         # Shared wrapper for action buttons
│   │   ├── ErrorBoundary.tsx      # Global React error boundary
│   │   ├── ScanForm.tsx           # URL input + dual-viewport orchestration
│   │   ├── ScreenshotSection.tsx  # Screenshot viewer (desktop or mobile)
│   │   ├── Navbar.tsx             # Top nav (dev links in development)
│   │   ├── GradeBadge.tsx         # Letter grade display
│   │   ├── ViolationCard.tsx      # Severity breakdown cards
│   │   └── ThemeProvider.tsx      # Light/dark theme context
│   └── lib/
│       ├── scanner.ts        # Scan engine (scanUrl + scanUrlDual)
│       ├── platforms.ts      # Platform labels, confidence levels
│       ├── report.ts         # Markdown report (desktop + mobile sections)
│       ├── mode.ts           # Local vs. web mode detection
│       ├── ai-summary.ts     # OpenAI integration (CLI + local mode)
│       ├── grading.ts        # Client-side grading (re-exports Convex)
│       ├── create-agent-plan-zip.ts # Client-side ZIP bundler for fix plans
│       ├── rate-limit.ts     # Upstash rate limiting & concurrency
│       └── url-validator.ts  # SSRF-safe URL validation
└── middleware.ts             # Clerk auth middleware
```

---

## How It Works

### Web App

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌─────────────────────────────┐
│  User    │    │  Rate    │    │  SSRF    │    │   Single browser, two       │
│  submits │ ─▶ │  Limit   │ ─▶ │  Check   │ ─▶ │   contexts in parallel:     │
│  URL     │    │ (Upstash)│    │          │    │                             │
└──────────┘    └──────────┘    └──────────┘    │  ┌─────────┐ ┌──────────┐  │
                                                │  │Desktop  │ │ Mobile   │  │
                                                │  │1920×1080│ │ 390×844  │  │
                                                │  │axe+shot │ │ axe+shot │  │
                                                │  └────┬────┘ └────┬─────┘  │
                                                └───────┼───────────┼────────┘
                                                        │           │
                                                        ▼           ▼
                ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
                │ Tabbed   │ ◀─ │  OpenAI  │ ◀─ │  Convex  │ ◀─ │  Grade   │
                │ Results  │    │ Analysis │    │ Database │    │  (per-VP │
                │ Page     │    │(desktop +│    │(+desktop │    │+ combined│
                │(D/M tabs)│    │ mobile)  │    │& mobile  │    │ 60/40)   │
                └──────────┘    └──────────┘    │ storage) │    └──────────┘
                                                └──────────┘
```

### CLI

```
┌──────────┐    ┌────────────────────────────────┐    ┌──────────┐    ┌──────────┐
│  User    │    │ Dual-viewport scan (parallel)  │    │  OpenAI  │    │ Terminal │
│  runs    │ ─▶ │                                │ ─▶ │ Summary  │ ─▶ │ Report   │
│  CLI     │    │  Desktop ctx  +  Mobile ctx    │    │(optional)│    │(D+M+comb)│
└──────────┘    │  (or --desktop-only for one)   │    └──────────┘    └──────────┘
                └────────────────────────────────┘
                         │            │
                         ▼            ▼ (if --screenshot)
                   ┌──────────┐  ┌─────────────────┐
                   │  Grade   │  │ screenshot.jpg   │
                   │(combined)│  │ screenshot-      │
                   └──────────┘  │ mobile.jpg       │
                                 └─────────────────┘
```

### Scan Flow

1. **User enters a URL** — The scan form validates, normalizes, and strips `www.`
2. **Rate limit checked** — Per-IP sliding window (5/hour) and global concurrency cap (10 simultaneous)
3. **URL validated** — SSRF protection blocks private IPs and non-HTTP schemes in production
4. **Browser connects** — A single browser (local Playwright or remote Browserless) opens two parallel contexts: desktop (1920x1080) and mobile (390x844, iPhone emulation with touch and UA)
5. **Desktop navigates first** — The desktop context loads the page, runs the WAF/firewall check, and detects the platform/CMS/framework
6. **Mobile navigates** — Only if the WAF check passes, the mobile context loads the same URL with mobile emulation
7. **Parallel scan + screenshot** — axe-core and JPEG screenshots run on both contexts simultaneously via `Promise.all`
8. **Results truncated** — If raw violations exceed 350 KB per viewport, node arrays are trimmed to stay under Convex's 1 MB document limit
9. **Platform detected** — CMS platforms (WordPress, Shopify, etc.) and frameworks (Next.js, React, Angular, etc.) are identified from HTML markers, with confidence levels (high/medium)
10. **Audit saved** — Scan results for both viewports are stored in Convex. Desktop and mobile screenshots are uploaded in parallel to file storage.
11. **Grades calculated** — Per-viewport grades (A-F) plus a combined weighted grade (60% desktop + 40% mobile)
12. **AI analyzes** — OpenAI generates separate summaries for desktop and mobile violations, plus platform-specific tips (fires in the background). If violations are identical to the previous audit for the same URL, the AI summary and any existing agent plan are reused without calling OpenAI.
13. **Results displayed** — A tabbed UI shows Desktop and Mobile results separately. Each tab has its own grade, violations, screenshot, AI summary, and top issues. The combined grade appears in the header.

---

## Grading System

| Grade | Score | Description |
|-------|-------|-------------|
| **A** | 90–100 | Excellent accessibility |
| **B** | 80–89 | Good accessibility |
| **C** | 70–79 | Fair accessibility |
| **D** | 60–69 | Poor accessibility |
| **F** | 0–59 | Very poor accessibility |

**Penalty weights per violation:**

| Severity | Points Deducted |
|----------|-----------------|
| Critical | −25 |
| Serious | −12 |
| Moderate | −5 |
| Minor | −1 |

**Hard caps** ensure severe issues are always reflected in the grade:

| Condition | Maximum Score |
|-----------|--------------|
| Any critical violations | 55 (grade F) |
| Any serious violations | 72 (grade C) |
| 3+ moderate violations | 85 (grade B) |

### Combined Grade (Dual-Viewport)

When both desktop and mobile results are available, the displayed grade is a weighted average:

| Viewport | Weight |
|----------|--------|
| Desktop | 60% |
| Mobile | 40% |

Each viewport gets its own per-viewport grade (visible in the Desktop/Mobile tabs), while the header shows the combined grade. For desktop-only scans or pre-mobile audits, the desktop score is used directly.

The algorithm version is tracked per audit, and grades are lazily recalculated when you view an older report after an algorithm update.

---

## Platform & Framework Detection

The scanner identifies the CMS or framework powering a page by pattern-matching rendered HTML. When detected, the AI generates platform-specific fix advice (e.g., "Install the WP Accessibility plugin" for WordPress, or "Use `next/image` with required `alt` props" for Next.js).

| Confidence | Platforms | Rationale |
|------------|-----------|-----------|
| **High** | WordPress, Squarespace, Shopify, Wix, Webflow, Drupal, Joomla, Ghost, HubSpot, Weebly, Next.js, Nuxt, Gatsby, Angular, Remix, Astro | Unique, unmistakable HTML markers |
| **Medium** | React, Vue, Svelte | Base library heuristics that can occasionally appear on non-matching sites |

Medium-confidence detections are surfaced with a qualifier in the UI and reports ("detected" label, hedged AI phrasing).

---

## Scripts

```bash
npm run local            # Local mode — just scanning + optional AI (no accounts/database)
npm run dev              # Start Next.js + Convex together (full stack)
npm run dev:next         # Start only Next.js (no local-mode redirects)
npm run dev:convex       # Start only Convex
npm run dev:browserless  # Start with local Docker Browserless (needed for localhost scanning from web UI)
npm run dev:upstash      # Start with rate limiting enabled locally
npm run browserless      # Run the Browserless Docker container
npm run browserless:stop # Stop the Browserless container
npm run build            # Production build (deploys Convex + builds Next.js)
npm run start            # Start production server
npm run cli -- <url>     # Scan a URL from the terminal (see CLI Usage)
npm run test             # Run tests in watch mode (vitest)
npm run test:run         # Run tests once
npm run test:coverage    # Run tests with coverage report
npm run lint             # Run ESLint
```

---

## Production Deployment

### Vercel + Convex

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy

For browser-based scanning in production, you'll need [Browserless](https://browserless.io) (free tier available) since Vercel doesn't support running Playwright directly. The app will return a clear 500 error if you forget this variable.

Add to Vercel environment variables:
```
BROWSERLESS_TOKEN=your-token
```

> **Tip:** Large scan results are automatically truncated at 350 KB per viewport (desktop + mobile) to stay within Convex's 1 MB document limit. Violation counts and grades remain accurate; only duplicate element examples are trimmed.

### Convex Production

```bash
npx convex deploy
```

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [axe-core](https://github.com/dequelabs/axe-core) — The accessibility testing engine that powers the scanning
- [Playwright](https://playwright.dev) — Browser automation
- [Convex](https://convex.dev) — Real-time backend platform
- [Clerk](https://clerk.com) — Authentication
- [OpenAI](https://openai.com) — AI analysis
- [Upstash](https://upstash.com/) — Serverless Redis for rate limiting
- [Commander.js](https://github.com/tj/commander.js) — CLI framework
- [chalk](https://github.com/chalk/chalk) + [ora](https://github.com/sindresorhus/ora) — Terminal styling and spinners
- [Deque Systems](https://www.deque.com/) — WCAG expertise and axe-core development
