import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import axe from "axe-core";

const AXE_CDN_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.11.1/axe.min.js",
  "https://unpkg.com/axe-core@4.11.1/axe.min.js",
];

let cachedAxeSource: string | null = axe.source || null;
let cachedHtmlcsSource: string | null = null;
let cachedAceSource: string | null = null;

export async function getAxeCoreSource(): Promise<string> {
  if (cachedAxeSource) {
    return cachedAxeSource;
  }

  for (const url of AXE_CDN_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      cachedAxeSource = await response.text();
      return cachedAxeSource;
    } catch {
      // Try the next CDN.
    }
  }

  throw new Error(
    "Failed to load axe-core: bundled source was empty and all CDN fallbacks failed",
  );
}

export function getHtmlcsSource(): string {
  if (!cachedHtmlcsSource) {
    cachedHtmlcsSource = readFileSync(
      resolve(process.cwd(), "node_modules/@pa11y/html_codesniffer/build/HTMLCS.js"),
      "utf8",
    );
  }

  return cachedHtmlcsSource;
}

export function getAceSource(): string {
  if (!cachedAceSource) {
    cachedAceSource = readFileSync(
      resolve(process.cwd(), "node_modules/accessibility-checker-engine/ace.js"),
      "utf8",
    );
  }

  return cachedAceSource;
}
