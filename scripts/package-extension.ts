import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
const distRoot = resolve(root, "extension", "dist");
const manifestPath = resolve(distRoot, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
  version: string;
};
const outputPath = resolve(root, "extension", `a11y-garden-v${manifest.version}.zip`);

function collectFiles(dir: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};

  for (const name of readdirSync(dir)) {
    const absolute = join(dir, name);
    const stats = statSync(absolute);

    if (stats.isDirectory()) {
      Object.assign(files, collectFiles(absolute));
      continue;
    }

    const archivePath = relative(distRoot, absolute).split("\\").join("/");
    files[archivePath] = new Uint8Array(readFileSync(absolute));
  }

  return files;
}

const archiveFiles = collectFiles(distRoot);
const zipped = zipSync(archiveFiles, { level: 9 });

writeFileSync(outputPath, zipped);
console.log(`Packaged extension to ${outputPath}`);
