#!/usr/bin/env node

/**
 * Thin wrapper that uses tsx to run the TypeScript CLI entry point.
 * This allows `npx a11ygarden` / `npm link` usage without a build step.
 */

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  execFileSync(
    process.execPath,
    ["--import", "tsx", join(__dirname, "index.ts"), ...process.argv.slice(2)],
    { stdio: "inherit" },
  );
} catch (error) {
  // execFileSync throws on non-zero exit; the child's stderr is already piped
  process.exit(error.status ?? 1);
}
