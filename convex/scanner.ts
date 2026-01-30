// Scanner functionality has been moved to Next.js API route (/api/scan)
// This file is kept for reference but the actual scanning happens locally
// via the API route since Playwright requires a full Node.js environment
// with browser binaries that can't run in Convex's serverless environment.

// The scanning flow is now:
// 1. Client creates audit via Convex mutation
// 2. Client calls /api/scan with the URL
// 3. API route runs Playwright + axe-core locally
// 4. Client updates Convex with results via mutation
// 5. Client triggers AI analysis via Convex action

export {};
