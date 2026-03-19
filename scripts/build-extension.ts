import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
const extensionRoot = resolve(root, "extension");
const distRoot = resolve(extensionRoot, "dist");

const filesToCopy: Array<[string, string]> = [
  ["manifest.json", "manifest.json"],
  ["popup.html", "popup.html"],
  ["popup.css", "popup.css"],
  ["popup.js", "popup.js"],
  ["background.js", "background.js"],
  ["a11y-garden-bridge.js", "a11y-garden-bridge.js"],
  ["scan-main.js", "scan-main.js"],
];

const vendorFiles: Array<[string, string]> = [
  [resolve(root, "node_modules/axe-core/axe.min.js"), "axe.min.js"],
  [
    resolve(root, "node_modules/@pa11y/html_codesniffer/build/HTMLCS.js"),
    "HTMLCS.js",
  ],
  [resolve(root, "node_modules/accessibility-checker-engine/ace.js"), "ace.js"],
];

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(resolve(distRoot, "vendor"), { recursive: true });

for (const [sourceName, destName] of filesToCopy) {
  copyFileSync(
    resolve(extensionRoot, sourceName),
    resolve(distRoot, destName),
  );
}

for (const [sourcePath, destName] of vendorFiles) {
  copyFileSync(sourcePath, resolve(distRoot, "vendor", destName));
}

console.log(`Built extension to ${distRoot}`);
