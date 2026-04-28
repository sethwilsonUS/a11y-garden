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
  ["result.html", "result.html"],
  ["result.css", "result.css"],
  ["result.js", "result.js"],
  ["shared.js", "shared.js"],
  ["db.js", "db.js"],
  ["background.js", "background.js"],
  ["scan-main.js", "scan-main.js"],
];

const vendorFiles: Array<[string, string]> = [
  [resolve(root, "node_modules/axe-core/axe.min.js"), "axe.min.js"],
  [
    resolve(root, "node_modules/@pa11y/html_codesniffer/build/HTMLCS.js"),
    "HTMLCS.js",
  ],
  [resolve(root, "node_modules/accessibility-checker-engine/ace.js"), "ace.js"],
  [resolve(root, "node_modules/fflate/esm/browser.js"), "fflate.mjs"],
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
