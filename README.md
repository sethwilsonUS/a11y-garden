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

- 🔍 **Multi-Engine Accessibility Scanning** — Strict profile runs axe-core. Comprehensive profile runs axe-core, HTML_CodeSniffer, and IBM ACE together, with findings split into confirmed vs. needs-review lanes
- 📱 **Dual Viewport Scanning** — Scans at both desktop (1920x1080) and mobile (390x844) viewports in parallel, with separate results for each
- 🤖 **AI-Powered Insights** — GPT-5.4 Mini translates technical violations into plain English, with separate analysis per viewport
- 📊 **Letter Grade System** — Per-viewport grades plus a combined weighted grade (60% desktop + 40% mobile)
- 🧩 **Platform & Framework Detection** — Detects CMS platforms (WordPress, Shopify, Squarespace, etc.) and frontend frameworks (Next.js, React, Angular, Svelte, etc.) with confidence levels, providing platform-specific fix advice
- 🗄️ **Community Database** — Browse and search accessibility audits shared by signed-in users
- 👤 **User Accounts** — Save and manage your audit history with Clerk authentication
- 🔐 **Public Garden Protection** — Only authenticated users can publish to the community garden; anonymous scans are always private
- ⚡ **Real-time Updates** — Live status updates as scans progress
- 🌗 **Light/Dark Themes** — Modern, accessible interface built with Tailwind CSS v4
- 🤖 **AI Agent Fix Plans** — Signed-in users can generate downloadable AGENTS.md fix-plan files from confirmed findings, ready to drop into Cursor, Codex, Claude Code, or GitHub Copilot (developer framework sites only)
- 📋 **Export Reports** — Copy markdown reports including both desktop and mobile results
- 🛡️ **Rate Limiting & Concurrency** — Per-user (30/hr authenticated, 10/hr anonymous) sliding window and global concurrency cap via Upstash Redis
- 🔒 **SSRF Protection** — URL validation blocks private IP ranges and non-HTTP schemes in production
- 📸 **Page Screenshots** — Captures JPEG screenshots at both viewports so users can verify the scanner reached the real site (including WAF-bypassed sites via BQL, quality 90 for BQL / 75 for Playwright). Includes a retry mechanism when BQL returns partial screenshots.
- 🧩 **Chrome Extension (Local Unpacked)** — Run a desktop live scan against the page exactly as you see it in Chrome, then open a protected hosted private result on either `localhost` or `https://a11ygarden.org`
- 🧱 **WAF Bypass (BQL + Live Browser Handoff)** — Automatically detects and bypasses Web Application Firewalls using Browserless BrowserQL stealth mode with a 3-tier escalation chain (stealth + proxy, extended navigation wait, Cloudflare challenge solver). Comprehensive scans reconnect the solved session back to Playwright when possible; otherwise the app falls back to a clearly-flagged structural axe-core scan via JSDOM.
- 🔀 **Smart Fallback Strategy** — Tries fast Playwright BaaS first, detects WAF blocks or timeouts, then escalates to BQL for authenticated users. Correctly distinguishes WAF blocks from Browserless API errors (quota, auth). Leverages Vercel Pro's 5-minute function limit for complex WAF bypasses. Strategy auto-detection prioritizes Vercel environment to prevent misconfiguration.
- 📱 **Smart Dual-Viewport for BQL** — Detects adaptive serving (mobile subdomains, AMP alternates, Vary headers) and only runs a second BQL call when the site genuinely serves different mobile HTML. Responsive sites reuse a single scan.
- 🗺️ **Domain Strategy Cache** — Remembers which domains need BQL bypass via Redis, skipping the BaaS attempt on repeat scans (saves 5-10s per scan, 7-day TTL)
- 📊 **Usage Monitoring & Circuit Breaker** — Tracks Browserless unit consumption with an in-memory budget tracker. Automatically disables BQL at 95% monthly budget to prevent billing surprises.
- 🤖 **robots.txt Compliance** — Advisory robots.txt checking before each scan. Disallowed pages still scan (accessibility audits have legal safe harbors) but results show a notice. Non-stealth paths identify as `A11yGarden/1.0` in the User-Agent.
- 🔄 **Safe Mode Fallback** — Automatically retries axe-core with a reduced rule set when complex pages crash the full in-browser axe-core pass
- 🚨 **Error Boundary** — Global React error boundary catches rendering crashes with a friendly recovery UI
- ⚙️ **Graceful Degradation** — Runs without env vars for local demos; a banner warns which features are disabled
- 💻 **CLI Tool** — Scan sites from your terminal with `a11ygarden <url>`, dual-viewport by default with a `--desktop-only` flag
- 🩺 **Health Check** — `GET /api/health/browserless` verifies BaaS and BQL API connectivity with latency measurements
- 📏 **Response Size Safety** — Monitors API response size; if results exceed Vercel's 4.5MB limit (large sites with screenshots), screenshots are gracefully dropped with a warning instead of silently failing

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
| **Scanning Engine** | [Playwright](https://playwright.dev/) + [axe-core](https://github.com/dequelabs/axe-core) + [HTML_CodeSniffer](https://github.com/squizlabs/HTML_CodeSniffer) + [IBM ACE](https://www.npmjs.com/package/accessibility-checker-engine) |
| **WAF Bypass** | [Browserless BQL](https://browserless.io/) (stealth routes + residential proxies) + Playwright reconnect + [JSDOM](https://github.com/jsdom/jsdom) fallback |
| **AI Analysis** | [OpenAI GPT-5.4 Mini](https://openai.com/) |
| **Rate Limiting** | [Upstash Redis](https://upstash.com/) (per-user sliding window + concurrency) |
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

Logged-out web scans use the strict axe-core profile by default. Signing in unlocks comprehensive multi-engine scans, WAF bypass on protected sites, saved audits, and AGENTS.md generation. The CLI can use either profile via `--profile`.

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

Scan websites from your terminal — no Convex or Clerk required. The CLI uses the strict axe-core profile by default, or the comprehensive multi-engine profile via `--profile comprehensive` (and optionally OpenAI for AI summaries).

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

# Run the comprehensive multi-engine profile
npm run cli -- walmart.com --profile comprehensive

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
| `--profile <strict\|comprehensive>` | Choose strict axe-core only, or comprehensive axe-core + HTML_CodeSniffer + IBM ACE |
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

# Reproduce the production fallback path locally (requires Browserless cloud env vars)
npm run dev:fallback

# Force the BQL-only path locally for debugging
npm run dev:bql
```

This starts a Browserless Chromium container and sets `BROWSERLESS_URL` automatically. The scanner rewrites `localhost` URLs to `host.docker.internal` so the Docker container can reach your host machine.

If you want to test WAF bypass locally against sites like Shutterstock, use `npm run dev:fallback` or `npm run dev:bql` with your Browserless cloud variables configured, and sign in. The default `npm run dev` / `npm run dev:browserless` flow stays on the local Playwright strategy and will not auto-escalate into BQL.

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

## Chrome Extension (Local Unpacked)

The Chrome extension is a supported local workflow for desktop live scans. It is not in the Chrome Web Store yet, so for now you install it as an unpacked extension and point its `A11y Garden origin` at either local dev or production.

### Local Install

```bash
npm run build:extension
```

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select `extension/dist`

The unpacked extension scans regular `http(s)` pages only and opens a protected hosted private result in a new tab.

### Choosing the A11y Garden Origin

Use the popup's `A11y Garden origin` field to decide where the hosted result should be created:

- `http://localhost:3000` for local development
- `https://a11ygarden.org` for production

If you change extension files, rebuild with `npm run build:extension` and click **Reload** on the unpacked extension in `chrome://extensions`.

### Using It Against Production

You can keep the extension installed locally as an unpacked extension and point it at `https://a11ygarden.org`. That works as long as the backend is deployed and `https://a11ygarden.org/api/extension/ingest` is live with working Convex configuration.

### Troubleshooting

- **Scan fails immediately:** Make sure you're on a regular `http(s)` page. Chrome internal pages, extension pages, and the New Tab page are not scannable.
- **Production scans fail:** Confirm the deployed app includes `/api/extension/ingest` and that Convex is configured in that environment.
- **Results open on the wrong host or fail to save:** Check the popup's `A11y Garden origin` value.
- **Recent extension code changes do not show up:** Rebuild with `npm run build:extension`, then click **Reload** in `chrome://extensions`.

For operational details, file references, and a backend checklist, see [docs/extension.md](docs/extension.md).

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

# Upstash Redis — rate limiting, concurrency, and domain strategy cache
# Optional in dev (features are disabled without these).
# Required in production to prevent abuse.
# UPSTASH_REDIS_REST_URL=https://...upstash.io
# UPSTASH_REDIS_REST_TOKEN=...

# Force-enable rate limiting in local dev (for testing):
# RATE_LIMIT_ENABLED=true

# Browserless — cloud browser + WAF bypass
# In production (Vercel), required for scanning (Playwright can't run in serverless).
# In local dev, set automatically by `npm run dev:browserless` for localhost scanning.
# The CLI also picks these up (use --local to skip).
# BROWSERLESS_TOKEN=your-token
# BROWSERLESS_URL=ws://localhost:3001 (local Docker)

# Browserless Cloud BQL endpoint (WAF bypass via stealth + proxies)
# Also used for BrowserQL reconnect when handing protected sessions back to Playwright.
# On Vercel with BROWSERLESS_TOKEN, `fallback` is auto-detected (highest priority):
# tries BaaS first, escalates to BQL on WAF detection.
# Locally, BROWSERLESS_TOKEN alone does NOT trigger fallback (uses local Playwright).
# BROWSERLESS_CLOUD_URL=https://production-sfo.browserless.io

# Scan strategy override (default: auto-detected, see table below)
# Options: fallback, baas, bql, local
# SCAN_STRATEGY=fallback

# Browserless monthly unit budget for circuit breaker (default: 900)
# BQL is disabled at 95% consumption to prevent billing surprises.
# BROWSERLESS_MONTHLY_UNIT_BUDGET=900
```

**Convex dashboard variables** (add these in the [Convex dashboard](https://dashboard.convex.dev) under Settings → Environment Variables, **not** in `.env.local`):

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Powers AI summaries, recommendations, and AGENTS.md generation |
| `CLERK_JWT_ISSUER_DOMAIN` | Your Clerk Frontend API URL for server-side auth |

### Scan Strategy Selection

| `SCAN_STRATEGY` Value | When Used | Behavior |
|----------------------|-----------|----------|
| *(unset)* | Default | Auto-detected (see below) |
| `fallback` | Production (recommended) | BaaS → WAF detect → BQL escalation, within Vercel Pro 5-minute budget |
| `baas` | Debug / testing | Playwright via Browserless WebSocket only (no BQL) |
| `bql` | Debug / testing | BQL stealth path directly, using Playwright reconnect when available and structural JSDOM fallback otherwise |
| `local` | Local development | Local Playwright (no Browserless needed) |

**Auto-detection logic** (when `SCAN_STRATEGY` is unset):

| Priority | Environment | Strategy | Reason |
|----------|-------------|----------|--------|
| 1 | On Vercel + `BROWSERLESS_TOKEN` | `fallback` | BaaS → BQL escalation for WAF bypass |
| 2 | `BROWSERLESS_URL` set (local only) | `local` | Docker Browserless for localhost scanning |
| 3 | Local dev (neither set) | `local` | System Playwright, simplest setup |

> **Important:** Vercel is always checked first. Even if `BROWSERLESS_URL` is accidentally set in Vercel env vars, the strategy correctly resolves to `fallback`. Do **not** set `BROWSERLESS_URL` on Vercel — it is for local Docker only.

### What happens when variables are missing?

The app is designed to degrade gracefully rather than crash:

| Variable | Missing in dev | Missing in production |
|----------|---------------|----------------------|
| `NEXT_PUBLIC_CONVEX_URL` | App runs without Convex/Clerk — `/demo` still works. A banner warns unless running in local mode (`npm run local`). | Same behavior; auth and database features are unavailable. |
| `BROWSERLESS_TOKEN`/`URL` | Not needed — Playwright launches a local browser. Set by `dev:browserless` for localhost scanning from the web UI. | Scan API returns a 500 with a descriptive error message. |
| `BROWSERLESS_CLOUD_URL` | BQL bypass disabled — WAF-blocked sites will fail. | Required for WAF bypass. Without it, BQL strategies cannot connect. |
| `BROWSERLESS_MONTHLY_UNIT_BUDGET` | Defaults to 900 units. Circuit breaker activates at 95% of that value. | Set to match your Browserless plan and desired safety margin to prevent overages. |
| `OPENAI_API_KEY` (Convex) | AI summary/recommendations are skipped with a clear error logged. | Same — scans work, but AI analysis fails gracefully. |
| `OPENAI_API_KEY` (.env.local) | CLI and local mode skip AI summary when missing. | N/A (CLI / local mode only). |
| `UPSTASH_REDIS_REST_URL/TOKEN` | Rate limiting and domain cache disabled — all scans allowed, no WAF-domain memory. | **Required** — prevents abuse via per-user rate limits, concurrency caps, and caches domain strategies. |
| `RATE_LIMIT_ENABLED` | Rate limiting stays off (default). Set to `true` to test locally. | Not needed — rate limiting is always on when Upstash vars are present. |
| `SCAN_STRATEGY` | Auto-detected: `fallback` on Vercel with token (checked first), `local` otherwise. | Usually leave unset for auto-detection. Override to force a specific strategy. |

---

## Project Structure

```
├── cli/                       # CLI tool
│   ├── index.ts              # CLI entry point (dual-viewport + --desktop-only)
│   └── bin.mjs               # Bin wrapper for npm link / npx
├── convex/                    # Convex backend
│   ├── schema.ts             # Database schema (audits, domainStrategies, etc.)
│   ├── audits.ts             # Audit queries & mutations (incl. mobile + WAF metadata)
│   ├── ai.ts                 # OpenAI integration (parallel desktop/mobile + platform tips)
│   ├── agentPlan.ts          # AGENTS.md fix-plan generation action
│   ├── scanner.ts            # Convex-side scanner utilities
│   ├── domainStrategies.ts   # Domain strategy cache (WAF-known domains)
│   ├── scanStats.ts          # Scan usage report (30-day aggregates)
│   ├── auth.config.ts        # Clerk ↔ Convex auth config
│   └── lib/
│       ├── grading.ts        # Grading algorithm + combined grade
│       ├── groupViolations.ts # Violation grouping & normalization
│       ├── dedup.ts           # Audit deduplication helpers
│       └── buildAgentPlanPrompt.ts # Prompt builder for agent plans
├── docs/
│   └── browserless-upgrade-decision.md # Browserless tier upgrade framework
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── page.tsx          # Home page
│   │   ├── layout.tsx        # Root layout
│   │   ├── providers.tsx     # Convex/Clerk providers (conditional)
│   │   ├── opengraph-image.tsx # OG image generator
│   │   ├── twitter-image.tsx  # Twitter card image generator
│   │   ├── demo/             # Demo mode (no auth required)
│   │   ├── results/          # Results pages (tabbed desktop/mobile)
│   │   ├── database/         # Community audit database
│   │   ├── dashboard/        # User dashboard (auth required)
│   │   ├── sign-in/          # Clerk sign-in page
│   │   ├── sign-up/          # Clerk sign-up page
│   │   └── api/
│   │       ├── scan/          # Scan API (strategy selection, 300s max, dual-viewport)
│   │       ├── og/            # Dynamic OG image per audit
│   │       ├── ai-summary/    # AI summary API (local mode + demo)
│   │       └── health/
│   │           └── browserless/ # Browserless API health check
│   ├── components/
│   │   ├── AdvancedFeaturesModal.tsx # Logged-out advanced features explainer
│   │   ├── AgentPlanButton.tsx     # Generate/view AGENTS.md fix plans
│   │   ├── AgentPlanViewer.tsx     # Modal viewer for fix plan markdown
│   │   ├── AuditCard.tsx           # Audit card for database/dashboard lists
│   │   ├── ButtonCard.tsx          # Reusable button card component
│   │   ├── EngineSummaryAccordion.tsx # Collapsible per-engine results summary
│   │   ├── FindingDetailsAccordion.tsx # Confirmed / needs-review finding details
│   │   ├── ScanForm.tsx            # URL input + scan orchestration + WAF progress
│   │   ├── ScanProgressDisplay.tsx # Shared scan progress display (elapsed time, WAF banner, SR announcements)
│   │   ├── ScanModeBanner.tsx      # Detailed scan mode info (full/safe/structural)
│   │   ├── SafeModeModal.tsx       # Modal explaining safe mode
│   │   ├── StatusIndicator.tsx     # Scan status indicator
│   │   ├── WafBadge.tsx            # WAF bypass status badge
│   │   ├── ScreenshotSection.tsx   # Screenshot viewer (desktop or mobile)
│   │   ├── ErrorBoundary.tsx       # Global React error boundary
│   │   ├── Footer.tsx              # Site footer
│   │   ├── Navbar.tsx              # Top nav
│   │   ├── GradeBadge.tsx          # Letter grade display
│   │   ├── ViolationCard.tsx       # Severity breakdown cards
│   │   ├── ThemeProvider.tsx       # Light/dark theme context
│   │   └── ThemeToggle.tsx         # Light/dark toggle button
│   ├── lib/
│   │   ├── findings.ts             # Normalized multi-engine finding schema + truncation
│   │   ├── scanner.ts             # Scan engine (Playwright direct)
│   │   ├── rate-limit.ts          # Per-user/IP rate limiting + concurrency
│   │   ├── url-validator.ts       # SSRF-safe URL validation
│   │   ├── robots-check.ts        # Advisory robots.txt checker
│   │   ├── platforms.ts           # Platform detection, labels, confidence levels
│   │   ├── report.ts              # Markdown report builder
│   │   ├── grading.ts             # Client-side grading
│   │   ├── ai-summary.ts          # OpenAI integration (CLI + local mode)
│   │   ├── create-agent-plan-zip.ts # ZIP bundler for fix plans
│   │   ├── analytics.ts          # Client-side analytics
│   │   ├── analytics-server.ts   # Server-side analytics
│   │   ├── audit-sort.ts         # Audit sorting helpers
│   │   ├── nav-links.ts          # Navigation link definitions
│   │   ├── urls.ts                # URL builder utilities
│   │   ├── mode.ts                # Local vs. web mode detection
│   │   └── scan/                  # Scan strategy subsystem
│   │       ├── engines/
│   │       │   ├── orchestrator.ts    # Multi-engine runner orchestration
│   │       │   ├── axe-runner.ts      # axe-core adapter
│   │       │   ├── htmlcs-runner.ts   # HTML_CodeSniffer adapter
│   │       │   ├── ace-runner.ts      # IBM ACE adapter
│   │       │   └── dedup.ts           # Cross-engine merge logic
│   │       ├── strategies/
│   │       │   ├── index.ts           # Strategy factory (Vercel-first auto-detection)
│   │       │   ├── types.ts           # ScanStrategy interface + ScanMetadata
│   │       │   ├── playwright-local.ts # Local Playwright strategy
│   │       │   ├── playwright-baas.ts  # Cloud Playwright (BaaS) strategy
│   │       │   ├── bql-jsdom.ts        # BQL bypass + reconnect handoff + structural fallback
│   │       │   └── fallback.ts         # BaaS → BQL escalation with time budget
│   │       ├── monitoring/
│   │       │   ├── usage-tracker.ts   # Browserless unit consumption tracker
│   │       │   └── scan-logger.ts     # Structured JSON logging
│   │       ├── rules/
│   │       │   ├── categories.ts      # axe-core rule classifications
│   │       │   └── jsdom-compatible.ts # JSDOM-safe rule list
│   │       ├── utils/
│   │       │   ├── waf-detector.ts    # WAF + Chrome error page detection heuristics
│   │       │   └── adaptive-detect.ts # Adaptive serving detection
│   │       ├── axe-jsdom.ts           # Server-side axe-core via JSDOM
│   │       └── domain-cache.ts        # Redis-backed domain strategy cache
│   └── middleware.ts          # Clerk auth middleware
```

---

## How It Works

### Web App

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  User    │    │  Auth +  │    │  SSRF +  │    │ robots   │
│  submits │ ─▶ │  Rate    │ ─▶ │  URL     │ ─▶ │ .txt     │
│  URL     │    │  Limit   │    │  Check   │    │ advisory │
└──────────┘    └──────────┘    └──────────┘    └────┬─────┘
                                                     │
                                                     ▼
                                          ┌─────────────────────┐
                                          │  Domain cache check  │
                                          │  (Redis / in-memory) │
                                          └──────────┬──────────┘
                                                     │
                              ┌───────────────────────┼───────────────────────┐
                              │                       │                       │
                              ▼                       ▼                       ▼
                       Known-BQL domain         Fallback strategy        Direct BQL/local
                       → skip to BQL            → BaaS first            (explicit override)
                                                → WAF? escalate BQL
                                                     │
                              ┌───────────────────────┼───────────────────────┐
                              │                       │                       │
                              ▼                       ▼                       ▼
                    ┌────────────────┐    ┌────────────────────┐   ┌───────────────┐
                    │   Playwright   │    │  BQL stealth route │   │   Playwright  │
                    │ (BaaS or local)│    │  + reconnect when  │   │   (local dev) │
                    │ Desktop+Mobile │    │  possible, else    │   │ Desktop+Mobile│
                    │  parallel ctx  │    │ structural fallback│   │  parallel ctx │
                    └───────┬────────┘    └────────┬───────────┘   └──────┬────────┘
                            │                      │                      │
                            └──────────────────────┼──────────────────────┘
                                                   ▼
                ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
                │ Tabbed   │ ◀─ │  OpenAI  │ ◀─ │  Convex  │ ◀─ │  Grade   │
                │ Results  │    │ Analysis │    │ Database │    │  (per-VP │
                │ Page     │    │(desktop +│    │(+WAF meta│    │+ combined│
                │(D/M tabs)│    │ mobile)  │    │& mobile) │    │ 60/40)   │
                └──────────┘    └──────────┘    └──────────┘    └──────────┘
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

1. **User enters a URL** — The scan form validates, normalizes, and strips `www.`. Signed-in users can opt to share results publicly in the community garden; anonymous users always get private results.
2. **Auth resolved** — Clerk `auth()` determines the user's identity (anonymous or signed-in). Anonymous users can scan freely but their audits are forced to `isPublic: false` server-side.
3. **Rate limit checked** — Per-user sliding window (30/hr authenticated, 10/hr anonymous) and global concurrency cap (10 simultaneous)
4. **URL validated** — SSRF protection blocks private IPs and non-HTTP schemes in production
5. **robots.txt checked** — Advisory check; disallowed pages still scan but results show a notice
6. **Domain cache consulted** — Redis lookup for known-WAF domains. If the domain previously required BQL, skip straight to BQL for authenticated users (saves 5-10s)
7. **Strategy selected** — Auto-detection checks Vercel first (highest priority), then `BROWSERLESS_URL` for local Docker. On Vercel with `BROWSERLESS_TOKEN`, the fallback strategy tries BaaS first, then escalates to BQL on WAF detection or timeout. Browserless API errors (quota/auth) are caught early and surfaced as infrastructure errors, not false WAF detections. Can be overridden via `SCAN_STRATEGY` env var.
8. **Desktop scan** — Depending on strategy:
   - **Playwright (BaaS/local):** Opens a browser context at 1920x1080, navigates, runs the selected engine profile, and captures a JPEG screenshot (quality 75)
   - **BQL bypass path:** Stealth BQL navigates the page through a 3-tier escalation chain (stealth+proxy → extended wait → Cloudflare verify), captures desktop + mobile screenshots in a single session via GraphQL aliases (quality 90), and then:
     - **Strict profile:** Runs structural axe-core server-side against the HTML via JSDOM
     - **Comprehensive profile:** Requests a Browserless reconnect endpoint and hands the solved session back to Playwright so all selected engines can run on the real page
     - **Reconnect failure fallback:** Falls back to the structural axe-core path and records the skip in engine summaries
   Dynamic timeouts adapt to the available time budget. Chrome error pages are detected and trigger re-escalation. If either screenshot is missing after navigation, a dedicated retry query re-navigates (WAF challenge should be cached).
9. **Mobile scan** — Depending on strategy:
   - **Playwright:** Opens a second context at 390x844 with iPhone emulation, runs the selected engine profile + screenshot in parallel with desktop
   - **BQL responsive sites:** Reuses the desktop bypass session and cached mobile screenshot when possible
   - **BQL adaptive sites:** Detected via heuristics (mobile subdomains, AMP alternates, Vary headers); a second BQL mobile fetch is only attempted when the site genuinely serves different mobile HTML
10. **Findings normalized and trimmed** — Engine-specific results are merged into normalized confirmed / needs-review findings. If serialized findings exceed the per-viewport size budget, verbose node fields are trimmed before representative examples are sampled down to stay under Convex's 1 MB document limit
11. **Platform detected** — CMS platforms and frameworks identified from HTML markers with confidence levels. Detection runs on both Playwright and BQL paths via a shared `detectPlatformFromHtml` utility. AI generates platform-specific fix advice when a platform is detected.
12. **Domain cache updated** — If WAF was bypassed, the domain is cached in Redis (7-day TTL) for faster repeat scans
13. **Audit saved** — Scan results for both viewports + WAF metadata (strategy used, WAF type, bypass status, duration) stored in Convex. Screenshots uploaded to file storage. Anonymous audits are always private; only authenticated audits can appear in the community garden.
14. **Grades calculated** — Per-viewport grades (A-F) plus a combined weighted grade (60% desktop + 40% mobile)
15. **AI analyzes** — OpenAI generates separate summaries for desktop and mobile violations (fires in background). Identical violations reuse previous AI content, unless a platform was newly detected (triggers regeneration with platform-specific context).
16. **Results displayed** — Tabbed UI with per-viewport grades, violations, screenshots, AI summaries, scan mode banners (full/safe/structural), WAF status badges, and platform-specific fix tips

### WAF Bypass Escalation Chain

When the fallback strategy detects a WAF block (or BaaS fails for any site-level reason), it escalates through three BQL tiers. Each tier gets a dynamic time budget (up to 90 seconds per step) rather than hardcoded timeouts.

| Tier | Method | Wait Strategy | Use Case |
|------|--------|---------------|----------|
| 1 | Stealth + residential proxy | `waitForNavigation(networkIdle)` — dynamic 8-20s | Most WAF-protected sites |
| 2 | Stealth + residential proxy + extended wait | `waitForNavigation(networkIdle)` — dynamic 12-25s | Slow-loading WAF challenges |
| 3 | Stealth + residential proxy + Cloudflare verify | `verify(type: cloudflare)` challenge solver | Cloudflare-specific WAF challenges |

**Error classification:** Browserless API errors (401 quota exhausted, 403 auth failed) are correctly distinguished from WAF blocks — they surface a clear "scanner service temporarily unavailable" message instead of falsely triggering the WAF flow.

**Unreachable sites:** If the cloud browser can't reach the target site at all (DNS failure, connection refused), the Chrome error page is detected via content markers (`chrome-error://`, `neterror`, etc.) and `httpStatus === 0`. The escalation chain retries through all tiers before surfacing a clear "site could not be reached" error instead of returning garbage results from the error page.

**Unsolvable challenges:** Some sites use interactive CAPTCHA challenges (e.g., HUMAN Security / PerimeterX "Press & Hold" on Walmart) that require physical human interaction and cannot be bypassed by any automated tool. These are detected — even when the challenge is an overlay on top of real page content — and reported as a block rather than producing false scan results.

**Screenshot resilience:** BQL sometimes returns one screenshot but not the other due to timing/render races. A retry mechanism fires if *either* desktop or mobile screenshot is missing (not just both), using a dedicated screenshot query that re-navigates through the cached WAF session.

If all three tiers fail, the scan returns a blocked error. The auth gate ensures only signed-in users consume BQL units. The circuit breaker disables BQL at 95% of the monthly unit budget.

### Scan Profiles

| Profile | Engines | Availability |
|---------|---------|--------------|
| **Strict** | axe-core only | Default everywhere |
| **Comprehensive** | axe-core + HTML_CodeSniffer + IBM ACE | Signed-in web users and CLI `--profile comprehensive` |

### Axe-core Execution Modes

| Mode | Description | Rules Run | Screenshots |
|------|-------------|-----------|-------------|
| **Full** | Full in-browser axe-core pass | ~80+ | Browser-captured at exact viewport |
| **Safe** | Curated safe axe-core rules (fallback for complex sites) | ~50+ | Browser-captured |
| **Structural (JSDOM)** | Server-side structural axe-core fallback when live browser execution is unavailable | ~23-30 | BQL-captured (desktop 1920x1080, mobile 390x844) |

---

## Database Schema

### `audits` table

Core audit data with normalized per-viewport results and WAF metadata:

| Field | Type | Description |
|-------|------|-------------|
| `url` | `string` | Scanned URL |
| `status` | `string` | Scan status: `scanning`, `analyzing`, `complete`, `error` |
| `violations` / `mobileViolations` | `object` | Confirmed finding counts per viewport |
| `reviewViolations` / `mobileReviewViolations` | `object` | Needs-review counts per viewport |
| `score` / `mobileScore` | `number` | Numeric score (0-100) per viewport |
| `letterGrade` / `mobileLetterGrade` | `string` | Letter grade per viewport |
| `rawFindings` / `mobileRawFindings` | `string` | Serialized normalized `AuditFinding[]` payloads |
| `engineProfile` | `string` | Selected scan profile: `strict` or `comprehensive` |
| `engineSummary` / `mobileEngineSummary` | `string` | Serialized per-engine execution summary |
| `scanMode` / `mobileScanMode` | `string` | axe-core execution mode: `full`, `safe`, `jsdom-structural` |
| `screenshotId` / `mobileScreenshotId` | `id` | File storage references for screenshots |
| `platform` | `string` | Detected CMS/framework |
| `agentPlanFileId` | `id` | Generated AGENTS.md file in Convex storage |
| `scanStrategy` | `string` | Strategy used: `baas`, `bql-stealth`, `bql-proxy`, `failed` |
| `wafDetected` | `boolean` | Whether a WAF blocked the initial attempt |
| `wafType` | `string` | WAF vendor: `cloudflare`, `datadome`, `akamai`, etc. |
| `wafBypassed` | `boolean` | Whether the BQL bypass succeeded |
| `scanDurationMs` | `number` | Total scan duration in milliseconds |
| `isPublic` | `boolean` | Whether the audit appears in the community garden (forced `false` for anonymous users) |
| `userId` | `string?` | Clerk user ID (absent for anonymous scans) |
| `robotsDisallowed` | `boolean` | Whether `robots.txt` disallows crawling the scanned path |

### `domainStrategies` table

Persistent domain-level strategy cache for fast repeat scans:

| Field | Type | Description |
|-------|------|-------------|
| `domain` | `string` | Domain name (indexed) |
| `strategy` | `string` | Known working strategy (`bql`) |
| `wafType` | `string` | WAF vendor for this domain |
| `lastScanned` | `number` | Timestamp of last successful scan |
| `successRate` | `number` | Historical success rate (0-1) |
| `adaptiveServing` | `boolean` | Whether the domain serves different mobile content |
| `adaptiveReason` | `string` | Why it was flagged adaptive (e.g. `mobile_subdomain`) |

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

> **Important:** This project requires **Vercel Pro** (or higher) for WAF bypass support. The scan API uses `maxDuration = 300` (5 minutes), which exceeds the Hobby plan's 10-second limit. Non-WAF sites typically scan in 10-30 seconds; WAF-protected sites may take 1-4 minutes.

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com) (Pro plan)
3. Add environment variables in Vercel dashboard
4. Deploy

For browser-based scanning in production, you'll need [Browserless](https://browserless.io) since Vercel doesn't support running Playwright directly.

Add to Vercel environment variables:
```
BROWSERLESS_TOKEN=your-token
BROWSERLESS_CLOUD_URL=wss://production-sfo.browserless.io
BROWSERLESS_MONTHLY_UNIT_BUDGET=1000
```

> **Do NOT set `BROWSERLESS_URL` on Vercel.** This variable is for local Docker Browserless only (`ws://localhost:3001`). Setting it on Vercel forces the `local` strategy, which bypasses WAF detection, BQL escalation, and stealth routing — scans will silently fail or return incorrect results for WAF-protected sites.

The `BROWSERLESS_TOKEN` enables Playwright BaaS (fast path) and BQL (WAF bypass). The `BROWSERLESS_CLOUD_URL` enables BQL stealth routing via residential proxies for WAF-protected sites (the code normalizes `wss://` to `https://` for HTTP API calls). The budget variable controls the circuit breaker threshold.

> **Tip:** Check `/api/health/browserless` after deployment to verify BaaS and BQL connectivity.

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
- [Browserless](https://browserless.io) — Cloud browser infrastructure and BQL stealth API
- [JSDOM](https://github.com/jsdom/jsdom) — Server-side DOM for structural accessibility checks
- [Convex](https://convex.dev) — Real-time backend platform
- [Clerk](https://clerk.com) — Authentication
- [OpenAI](https://openai.com) — AI analysis
- [Upstash](https://upstash.com/) — Serverless Redis for rate limiting and domain caching
- [Commander.js](https://github.com/tj/commander.js) — CLI framework
- [chalk](https://github.com/chalk/chalk) + [ora](https://github.com/sindresorhus/ora) — Terminal styling and spinners
- [Deque Systems](https://www.deque.com/) — WCAG expertise and axe-core development
